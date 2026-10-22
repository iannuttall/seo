import { DurableObject } from 'cloudflare:workers'
import robotsParser from 'robots-parser'
import { analyse, type RunSummary } from './audit.ts'
import { extractPage, resolveUrl } from './extract.ts'
import { Meter } from './meter.ts'
import { DISPOSABLE, KEPT } from './schema.ts'
import { readSitemap } from './sitemap.ts'

// One site object per site. A run has two phases. In the crawl phase each
// wake (an alarm) claims up to batch_pages queued URLs, fetches them a few at
// a time at no more than max_rps, writes each page as it lands and sets the
// next alarm. In the inspect phase it asks Google's URL Inspection API about
// up to inspect_limit pages. All state is in SQLite, so an evicted object
// carries on from its last written page.

export const USER_AGENT =
  'Mozilla/5.0 (compatible; SEOSkillBot/0.1; +https://seoskill.dev/bot)'
const PRODUCT_TOKEN = 'SEOSkillBot'
const FETCH_TIMEOUT_MS = 15_000
const MAX_ROBOTS_CHARS = 500_000
const MAX_SITEMAPS = 50
const MAX_ATTEMPTS = 3
const MAX_CONSECUTIVE_ERRORS = 3
const RETRY_DELAY_MS = 60_000
const MAX_PAUSE_MS = 120_000
// Above this crawl-delay, waiting between wakes (an alarm) is cheaper than
// waiting inside one: an alarm costs one request and one row, while waiting
// inside costs 128 MB of duration for the whole delay.
const ALARM_WAIT_ABOVE_MS = 2000
const MAX_CRAWL_DELAY_MS = 10_000
// Google allows 600 inspections a minute per property; stay under it.
const INSPECT_GAP_MS = 110
const INSPECT_CONCURRENCY = 5
const INSPECT_BATCH = 200
const RUNS_KEPT = 52
const RESOLVED_KEPT_MS = 90 * 86_400_000
const ASSET =
  /\.(avif|bmp|css|csv|dmg|docx?|eot|gif|gz|ico|jpe?g|js|json|map|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i

export type RunOptions = {
  origin: string
  property?: string
  maxPages?: number
  maxConcurrency?: number
  maxRps?: number
  batchPages?: number
  wakeMs?: number
  inspectLimit?: number
}

export type Run = {
  id: string
  status: 'running' | 'done' | 'failed'
  phase: 'crawl' | 'inspect'
  started_at: number
  finished_at: number | null
  max_pages: number
  max_concurrency: number
  max_rps: number
  batch_pages: number
  wake_ms: number
  inspect_limit: number
  inspected: number
  concurrency: number
  seeded: number
  robots_status: number | null
  robots_txt: string | null
  crawl_delay_ms: number
  pause_until: number
  inflight: string | null
  known_urls: number
  dropped_urls: number
  fetched: number
  wakes: number
  requests: number
  throttled: number
  rows_written: number
  rows_read: number
  alarms: number
  error: string | null
  consecutive_errors: number
  summary: string | null
  summary_pushed_at: number | null
}

type Robots = ReturnType<typeof robotsParser>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

function get(url: string, redirect: 'manual' | 'follow'): Promise<Response> {
  return fetch(url, {
    redirect,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

// Counters for one wake, added to the run row when the wake ends.
type Wake = {
  meter: Meter
  requests: number
  throttled: number
  alarms: number
  known: number
  dropped: number
  fetched: number
  inspected: number
  // Rows already counted by an earlier flush.
  rowsWritten: number
  rowsRead: number
}

export class SiteCrawler extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(KEPT)
      ctx.storage.sql.exec(DISPOSABLE)
    })
  }

  // Starts a run unless one is running. Starting again while one runs only
  // makes sure its alarm is set, so the scheduler can call this safely.
  async start(
    siteId: string,
    options: RunOptions,
  ): Promise<{ created: boolean; run: Run }> {
    const meter = new Meter(this.ctx.storage)
    const origin = new URL(options.origin).origin
    meter.run(
      `INSERT INTO site (id, origin) VALUES (?, ?)
       ON CONFLICT (id) DO UPDATE SET origin = excluded.origin WHERE origin != excluded.origin`,
      siteId,
      origin,
    )
    const current = this.run(meter)
    if (current?.status === 'running') {
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.ctx.storage.setAlarm(Date.now())
      }
      return { created: false, run: current }
    }
    const maxConcurrency = clamp(options.maxConcurrency ?? 4, 1, 6)
    meter.transaction(() => {
      const hasPages = meter.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM pages WHERE state = 'fetched' LIMIT 1)",
      )?.n
      // Last week's pages stay one more run, for "what changed".
      meter.run('DROP TABLE IF EXISTS pages_prev')
      if (hasPages) meter.run('ALTER TABLE pages RENAME TO pages_prev')
      else meter.run('DROP TABLE pages')
      meter.run('DROP TABLE sitemaps')
      meter.run('DROP TABLE inspections')
      meter.run(DISPOSABLE)
      meter.run('DELETE FROM run')
      meter.run(
        `INSERT INTO run (id, status, started_at, max_pages, max_concurrency, max_rps,
           batch_pages, wake_ms, concurrency, inspect_limit)
         VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        Date.now(),
        clamp(options.maxPages ?? 500, 1, 5000),
        maxConcurrency,
        clamp(options.maxRps ?? 4, 0.1, 20),
        clamp(options.batchPages ?? 200, 1, 1000),
        clamp(options.wakeMs ?? 60_000, 1000, 600_000),
        Math.min(2, maxConcurrency),
        clamp(options.inspectLimit ?? 0, 0, 2000),
      )
    })
    await this.ctx.storage.setAlarm(Date.now())
    meter.run(
      'UPDATE run SET rows_written = ?, rows_read = ?, alarms = 1',
      meter.rowsWritten + 2,
      meter.rowsRead,
    )
    const run = this.run(meter)
    if (!run) throw new Error('No run after starting one')
    return { created: true, run }
  }

  status():
    | (Run & { pages: Record<string, number>; storage_bytes: number })
    | null {
    const meter = new Meter(this.ctx.storage)
    const run = this.run(meter)
    if (!run) return null
    const pages: Record<string, number> = {}
    for (const row of meter.all<{ state: string; n: number }>(
      'SELECT state, count(*) AS n FROM pages GROUP BY state',
    )) {
      pages[row.state] = row.n
    }
    return {
      ...run,
      robots_txt: null,
      inflight: null,
      pages,
      storage_bytes: this.ctx.storage.sql.databaseSize,
    }
  }

  // The latest run's summary and findings. newOnly keeps findings first seen
  // or reopened in the latest run.
  report(newOnly = false): {
    summary: RunSummary | null
    findings: Record<string, SqlStorageValue>[]
    history: Record<string, SqlStorageValue>[]
  } {
    const meter = new Meter(this.ctx.storage)
    const run = this.run(meter)
    return {
      summary: run?.summary ? JSON.parse(run.summary) : null,
      findings: meter.all(
        `SELECT id, rule, subject, details, state, first_seen_at, reopened_at, resolved_at
         FROM findings
         WHERE ? = 0 OR first_seen_run = ? OR reopened_at >= ? OR resolved_at >= ?
         ORDER BY state, rule, subject, id`,
        newOnly ? 1 : 0,
        run?.id ?? '',
        run?.started_at ?? 0,
        run?.started_at ?? 0,
      ),
      history: meter.all(
        'SELECT id, started_at, finished_at, status FROM runs ORDER BY started_at DESC, id',
      ),
    }
  }

  override async alarm(): Promise<void> {
    const meter = new Meter(this.ctx.storage)
    const run = this.run(meter)
    const site = meter.one<{ id: string; origin: string }>(
      'SELECT id, origin FROM site',
    )
    if (!run || !site) return
    if (run.status !== 'running') {
      await this.pushSummary(site.id, run)
      return
    }
    const wake: Wake = {
      meter,
      requests: 0,
      throttled: 0,
      alarms: 0,
      known: 0,
      dropped: 0,
      fetched: 0,
      inspected: 0,
      rowsWritten: 0,
      rowsRead: 0,
    }
    const started = Date.now()
    let next: number | null = null
    let error: string | null = null
    let finished = false
    try {
      this.retryInflight(meter, run)
      let more: boolean
      if (run.phase === 'crawl') {
        if (!run.seeded) await this.seed(wake, run, site.origin)
        const robots = robotsParser(
          `${site.origin}/robots.txt`,
          run.robots_txt ?? '',
        )
        more = await this.crawlBatch(wake, run, site.origin, robots, started)
        if (!more && run.inspect_limit > 0) {
          run.phase = 'inspect'
          more = true
        }
      } else {
        more = await this.inspectBatch(wake, run, site.origin, started)
      }
      if (more) {
        const delay = Math.max(
          run.pause_until - Date.now(),
          run.phase === 'crawl' && run.crawl_delay_ms > ALARM_WAIT_ABOVE_MS
            ? run.crawl_delay_ms
            : 0,
          0,
        )
        next = Date.now() + delay
      } else {
        finished = true
      }
    } catch (caught) {
      error = message(caught)
      next = Date.now() + RETRY_DELAY_MS
    }

    const errors = error ? run.consecutive_errors + 1 : 0
    const failed = errors >= MAX_CONSECUTIVE_ERRORS
    if (failed) next = null
    if (next !== null) {
      await this.ctx.storage.setAlarm(next)
      wake.alarms += 1
    }
    meter.run(
      `UPDATE run SET wakes = wakes + 1, alarms = alarms + ?, phase = ?, inflight = NULL,
         error = coalesce(?, error), consecutive_errors = ?, concurrency = ?, pause_until = ?`,
      wake.alarms,
      run.phase,
      error,
      errors,
      run.concurrency,
      run.pause_until,
    )
    this.flush(wake, run, wake.alarms)
    if (finished || failed)
      await this.finish(site.id, failed ? 'failed' : 'done')
  }

  // Adds the wake's counters to the run row and to `run`. Called in each
  // page's transaction, so an eviction loses at most the pages in flight.
  private flush(wake: Wake, run: Run, alarms = 0): void {
    const { meter } = wake
    const written = meter.rowsWritten - wake.rowsWritten + alarms + 1
    const read = meter.rowsRead - wake.rowsRead
    meter.run(
      `UPDATE run SET requests = requests + ?, throttled = throttled + ?,
         known_urls = known_urls + ?, dropped_urls = dropped_urls + ?, fetched = fetched + ?,
         inspected = inspected + ?, rows_written = rows_written + ?, rows_read = rows_read + ?`,
      wake.requests,
      wake.throttled,
      wake.known,
      wake.dropped,
      wake.fetched,
      wake.inspected,
      written,
      read,
    )
    run.requests += wake.requests
    run.throttled += wake.throttled
    run.known_urls += wake.known
    run.dropped_urls += wake.dropped
    run.fetched += wake.fetched
    run.inspected += wake.inspected
    run.rows_written += written
    run.rows_read += read
    wake.requests = 0
    wake.throttled = 0
    wake.known = 0
    wake.dropped = 0
    wake.fetched = 0
    wake.inspected = 0
    wake.rowsWritten = meter.rowsWritten
    wake.rowsRead = meter.rowsRead
  }

  // URLs claimed by a wake that never finished (an eviction or a crash) get
  // another attempt; after MAX_ATTEMPTS they fail, so one URL that kills the
  // object cannot stall the crawl. Costs nothing on a normal wake.
  private retryInflight(meter: Meter, run: Run): void {
    if (!run.inflight || run.phase !== 'crawl') return
    meter.transaction(() => {
      meter.run(
        `UPDATE pages SET attempts = attempts + 1 WHERE state = 'queued'
           AND url IN (SELECT value FROM json_each(?))`,
        run.inflight,
      )
      meter.run(
        `UPDATE pages SET state = 'failed',
           error = 'Gave up after the crawl stopped on this URL ${MAX_ATTEMPTS} times'
         WHERE state = 'queued' AND attempts >= ?`,
        MAX_ATTEMPTS,
      )
    })
  }

  // robots.txt, the sitemaps it lists (or /sitemap.xml) and the home page.
  private async seed(wake: Wake, run: Run, origin: string): Promise<void> {
    const { meter } = wake
    const response = await get(`${origin}/robots.txt`, 'follow')
    wake.requests += 1
    // RFC 9309: a server error means the crawl must wait and try again.
    if (response.status >= 500) {
      await response.body?.cancel()
      throw new Error(`robots.txt returned ${response.status}`)
    }
    const text = response.ok
      ? (await response.text()).slice(0, MAX_ROBOTS_CHARS)
      : ''
    if (!response.ok) await response.body?.cancel()
    const robots = robotsParser(`${origin}/robots.txt`, text)
    const delaySeconds = Number(robots.getCrawlDelay(PRODUCT_TOKEN) ?? 0)
    run.crawl_delay_ms = Math.min(delaySeconds * 1000, MAX_CRAWL_DELAY_MS)
    run.robots_txt = text
    meter.transaction(() => {
      meter.run(
        'UPDATE run SET robots_status = ?, robots_txt = ?, crawl_delay_ms = ?',
        response.status,
        text,
        run.crawl_delay_ms,
      )
      this.enqueue(wake, run, robots, [`${origin}/`], 0)
      const listed = robots
        .getSitemaps()
        .map((loc) => resolveUrl(loc, origin))
        .filter((url): url is URL => url?.origin === origin)
      for (const url of listed.length
        ? listed
        : [new URL(`${origin}/sitemap.xml`)]) {
        meter.run(
          "INSERT INTO sitemaps (url, state) VALUES (?, 'queued') ON CONFLICT DO NOTHING",
          url.href,
        )
      }
    })

    for (let index = 0; index < MAX_SITEMAPS; index += 1) {
      const sitemap = meter.one<{ url: string }>(
        "SELECT url FROM sitemaps WHERE state = 'queued' ORDER BY rowid LIMIT 1",
      )
      if (!sitemap) break
      // Sitemaps keep to the same pace as pages.
      await sleep(Math.max(1000 / run.max_rps, run.crawl_delay_ms))
      await this.fetchSitemap(wake, run, origin, robots, sitemap.url)
    }
    await sleep(Math.max(1000 / run.max_rps, run.crawl_delay_ms))
    meter.run('UPDATE run SET seeded = 1')
    run.seeded = 1
  }

  private async fetchSitemap(
    wake: Wake,
    run: Run,
    origin: string,
    robots: Robots,
    url: string,
  ): Promise<void> {
    const { meter } = wake
    let response: Response
    try {
      response = await get(url, 'follow')
      wake.requests += 1
    } catch (caught) {
      meter.run(
        "UPDATE sitemaps SET state = 'failed', error = ? WHERE url = ?",
        message(caught),
        url,
      )
      return
    }
    if (!response.ok) {
      await response.body?.cancel()
      meter.run(
        "UPDATE sitemaps SET state = 'failed', status = ? WHERE url = ?",
        response.status,
        url,
      )
      return
    }
    const sitemap = await readSitemap(response)
    const found = sitemap.locs
      .map((loc) => resolveUrl(loc, origin))
      .filter((loc): loc is URL => loc?.origin === origin)
      .map((loc) => loc.href)
    meter.transaction(() => {
      meter.run(
        "UPDATE sitemaps SET state = 'fetched', status = ?, urls = ? WHERE url = ?",
        response.status,
        sitemap.locs.length,
        url,
      )
      if (sitemap.kind === 'index') {
        for (const loc of found) {
          meter.run(
            "INSERT INTO sitemaps (url, state) VALUES (?, 'queued') ON CONFLICT DO NOTHING",
            loc,
          )
        }
        return
      }
      this.enqueue(wake, run, robots, found, 1, 1)
      // New URLs were inserted marked; this marks URLs already known (the
      // home page, or a URL in two sitemaps), one row per URL changed.
      for (let index = 0; index < found.length; index += 1000) {
        meter.run(
          `UPDATE pages SET in_sitemap = 1 WHERE in_sitemap = 0
             AND url IN (SELECT value FROM json_each(?))`,
          JSON.stringify(found.slice(index, index + 1000)),
        )
      }
    })
  }

  // Adds new URLs in one statement. A URL already known costs no row. URLs
  // past the cap (twice max_pages, at least max_pages + 1,000) are counted,
  // not stored, so the table and memory stay bounded.
  private enqueue(
    wake: Wake,
    run: Run,
    robots: Robots,
    urls: string[],
    depth: number,
    inSitemap: 0 | 1 = 0,
  ): void {
    const { meter } = wake
    const rows = urls
      .filter((href) => {
        const { pathname } = new URL(href)
        return !ASSET.test(pathname) && !pathname.startsWith('/cdn-cgi/')
      })
      .map((href) => [
        href,
        robots.isAllowed(href, PRODUCT_TOKEN) === false ? 'blocked' : 'queued',
      ])
    if (rows.length === 0) return
    const cap = Math.max(run.max_pages * 2, run.max_pages + 1000)
    for (let index = 0; index < rows.length; index += 1000) {
      const chunk = rows.slice(index, index + 1000)
      if (cap - run.known_urls - wake.known >= chunk.length) {
        wake.known += meter.all(
          `INSERT INTO pages (url, state, depth, in_sitemap)
           SELECT j.value ->> 0, j.value ->> 1, ?, ? FROM json_each(?) j WHERE true
           ON CONFLICT (url) DO NOTHING RETURNING 1 AS n`,
          depth,
          inSitemap,
          JSON.stringify(chunk),
        ).length
        continue
      }
      // Near the cap: only URLs already known, and count the rest.
      const known = new Set(
        meter
          .all<{ url: string }>(
            'SELECT url FROM pages WHERE url IN (SELECT j.value ->> 0 FROM json_each(?) j)',
            JSON.stringify(chunk),
          )
          .map((row) => row.url),
      )
      for (const [href, state] of chunk) {
        if (known.has(href as string)) continue
        if (cap - run.known_urls - wake.known > 0) {
          meter.run(
            'INSERT INTO pages (url, state, depth, in_sitemap) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
            href,
            state,
            depth,
            inSitemap,
          )
          wake.known += 1
        } else {
          wake.dropped += 1
        }
      }
    }
  }

  // Fetches up to batch_pages queued URLs, at most `concurrency` at once and
  // max_rps a second (or one per crawl-delay), until the wake's time is up.
  // Returns false when the crawl has nothing left to fetch.
  private async crawlBatch(
    wake: Wake,
    run: Run,
    origin: string,
    robots: Robots,
    started: number,
  ): Promise<boolean> {
    const { meter } = wake
    if (run.fetched >= run.max_pages) return false
    const alarmWait = run.crawl_delay_ms > ALARM_WAIT_ABOVE_MS
    const limit = Math.min(
      alarmWait ? 1 : run.batch_pages,
      run.max_pages - run.fetched,
    )
    const claimed = meter.all<{ url: string; depth: number }>(
      "SELECT url, depth FROM pages WHERE state = 'queued' ORDER BY depth, rowid LIMIT ?",
      limit,
    )
    if (claimed.length === 0) return false
    meter.run(
      'UPDATE run SET inflight = ?',
      JSON.stringify(claimed.map((page) => page.url)),
    )

    const gap = Math.max(1000 / run.max_rps, alarmWait ? 0 : run.crawl_delay_ms)
    // A crawl-delay means one request at a time.
    const concurrency = () => (run.crawl_delay_ms > 0 ? 1 : run.concurrency)
    const deadline = started + run.wake_ms
    const active = new Set<Promise<void>>()
    // One gap first, after the seed's or the last wake's final request.
    let nextStart = Date.now() + gap
    let healthy = 0
    let latencyTotal = 0
    let stop = false

    for (const page of claimed) {
      while (active.size >= concurrency()) await Promise.race(active)
      if (stop || Date.now() >= deadline) break
      const wait = nextStart - Date.now()
      if (wait > 0) await sleep(wait)
      nextStart = Math.max(nextStart + gap, Date.now())
      const task = this.fetchPage(wake, run, origin, robots, page).then(
        (result) => {
          if (result.kind === 'throttled') {
            // 429 or 503: halve concurrency and pause the whole crawl.
            stop = true
            run.concurrency = Math.max(1, Math.floor(run.concurrency / 2))
            run.pause_until = Date.now() + result.retryAfterMs
            healthy = 0
            return
          }
          healthy += 1
          latencyTotal += result.ms
          // Twenty quick, clean answers in a row earn one more connection.
          if (healthy >= 20) {
            if (
              latencyTotal / healthy < 1000 &&
              run.concurrency < run.max_concurrency
            ) {
              run.concurrency += 1
            }
            healthy = 0
            latencyTotal = 0
          }
        },
      )
      const tracked: Promise<void> = task.finally(() => active.delete(tracked))
      active.add(tracked)
    }
    await Promise.all(active)
    if (run.fetched + wake.fetched >= run.max_pages) return false
    return Boolean(
      meter.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM pages WHERE state = 'queued' LIMIT 1)",
      )?.n,
    )
  }

  private async fetchPage(
    wake: Wake,
    run: Run,
    origin: string,
    robots: Robots,
    page: { url: string; depth: number },
  ): Promise<
    { kind: 'done'; ms: number } | { kind: 'throttled'; retryAfterMs: number }
  > {
    const { meter } = wake
    const begin = Date.now()
    let response: Response
    try {
      wake.requests += 1
      response = await get(page.url, 'manual')
    } catch (caught) {
      wake.fetched += 1
      meter.transaction(() => {
        meter.run(
          "UPDATE pages SET state = 'failed', error = ?, ms = ? WHERE url = ?",
          message(caught),
          Date.now() - begin,
          page.url,
        )
        this.flush(wake, run)
      })
      return { kind: 'done', ms: Date.now() - begin }
    }
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel()
      wake.throttled += 1
      const header = Number(response.headers.get('retry-after'))
      const retryAfterMs =
        Number.isFinite(header) && header > 0
          ? Math.min(header * 1000, MAX_PAUSE_MS)
          : 30_000
      return { kind: 'throttled', retryAfterMs }
    }

    const contentType = response.headers.get('content-type')
    const location = response.headers.get('location')
    const target = location ? resolveUrl(location, page.url) : null
    const html =
      response.status === 200 && /^\s*text\/html/i.test(contentType ?? '')
    const facts = html ? await extractPage(response, page.url, origin) : null
    if (!html) await response.body?.cancel()
    const ms = Date.now() - begin

    meter.transaction(() => {
      meter.run(
        `UPDATE pages SET state = 'fetched', status = ?, location = ?, content_type = ?,
           x_robots = ?, title = ?, description = ?, h1 = ?, canonical = ?, robots = ?,
           words = ?, bytes = ?, ms = ?, links = ?, external = ? WHERE url = ?`,
        response.status,
        target?.href ?? location,
        contentType,
        response.headers.get('x-robots-tag'),
        facts?.title ?? null,
        facts?.description ?? null,
        facts?.h1 ?? null,
        facts?.canonical ?? null,
        facts?.robots ?? null,
        facts?.words ?? null,
        facts?.bytes ?? null,
        ms,
        facts?.internal.length ? JSON.stringify(facts.internal) : null,
        facts?.external ?? null,
        page.url,
      )
      wake.fetched += 1
      const found = (facts?.internal ?? []).map((link) => link.u)
      if (target?.origin === origin)
        this.enqueue(wake, run, robots, [target.href], page.depth)
      // Pages that ask not to be followed add no new URLs.
      if (!/nofollow/.test(facts?.robots ?? '')) {
        this.enqueue(wake, run, robots, found, page.depth + 1)
      }
      this.flush(wake, run)
    })
    return { kind: 'done', ms }
  }

  // Inspects the next pages: sitemap pages first, then the shallowest,
  // all fetched with a 200. One wake does up to INSPECT_BATCH.
  private async inspectBatch(
    wake: Wake,
    run: Run,
    origin: string,
    started: number,
  ): Promise<boolean> {
    const { meter } = wake
    const left = run.inspect_limit - run.inspected
    if (left <= 0) return false
    const urls = meter
      .all<{ url: string }>(
        `SELECT url FROM pages p WHERE state = 'fetched' AND status = 200
           AND content_type LIKE 'text/html%'
           AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.url = p.url)
         ORDER BY in_sitemap DESC, depth, url LIMIT ?`,
        Math.min(left, INSPECT_BATCH),
      )
      .map((row) => row.url)
    if (urls.length === 0) return false
    const token = await this.googleToken()
    const deadline = started + run.wake_ms
    const active = new Set<Promise<void>>()
    let nextStart = Date.now()
    let stop = false
    for (const url of urls) {
      while (active.size >= INSPECT_CONCURRENCY) await Promise.race(active)
      if (stop || Date.now() >= deadline) break
      const wait = nextStart - Date.now()
      if (wait > 0) await sleep(wait)
      nextStart = Math.max(nextStart + INSPECT_GAP_MS, Date.now())
      const task = this.inspect(wake, run, origin, token, url).then(
        (throttled) => {
          if (throttled) {
            stop = true
            run.pause_until = Date.now() + 60_000
          }
        },
      )
      const tracked: Promise<void> = task.finally(() => active.delete(tracked))
      active.add(tracked)
    }
    await Promise.all(active)
    return run.inspected + wake.inspected < run.inspect_limit && urls.length > 0
  }

  // In the product the site object asks the account Worker for a fresh
  // access token over a service binding; the refresh token never leaves it.
  private async googleToken(): Promise<string> {
    return this.env.POC_GOOGLE_TOKEN ?? 'poc'
  }

  private async inspect(
    wake: Wake,
    run: Run,
    origin: string,
    token: string,
    url: string,
  ): Promise<boolean> {
    const { meter } = wake
    wake.requests += 1
    try {
      const response = await fetch(this.env.INSPECT_API, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: `${origin}/` }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (response.status === 429) {
        await response.body?.cancel()
        wake.throttled += 1
        return true
      }
      const text = await response.text()
      const body = (() => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })() as {
        inspectionResult?: {
          indexStatusResult?: Record<string, string | undefined>
        }
      } | null
      const status = body?.inspectionResult?.indexStatusResult
      meter.run(
        `INSERT INTO inspections (url, verdict, coverage, indexing, robots_txt,
           google_canonical, last_crawl, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        url,
        status?.verdict ?? null,
        status?.coverageState ?? null,
        status?.indexingState ?? null,
        status?.robotsTxtState ?? null,
        status?.googleCanonical ?? null,
        status?.lastCrawlTime ?? null,
        response.ok && status
          ? null
          : `URL Inspection returned ${response.status}`,
      )
    } catch (caught) {
      meter.run(
        'INSERT INTO inspections (url, error) VALUES (?, ?)',
        url,
        message(caught),
      )
    }
    wake.inspected += 1
    this.flush(wake, run)
    return false
  }

  // Works out findings and the week's changes, keeps a capped history and
  // pushes the summary to D1.
  private async finish(
    siteId: string,
    status: 'done' | 'failed',
  ): Promise<void> {
    const meter = new Meter(this.ctx.storage)
    const run = this.run(meter)
    if (!run) return
    const now = Date.now()
    const summary = await analyse(meter, run, status, now)
    meter.transaction(() => {
      meter.run(
        "UPDATE run SET status = ?, finished_at = ?, summary = ? WHERE status = 'running'",
        status,
        now,
        JSON.stringify(summary),
      )
      meter.run(
        `INSERT INTO runs (id, started_at, finished_at, status, summary) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        run.id,
        run.started_at,
        now,
        status,
        JSON.stringify(summary),
      )
      meter.run(
        'DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY started_at DESC LIMIT ?)',
        RUNS_KEPT,
      )
      meter.run(
        "DELETE FROM findings WHERE state = 'resolved' AND resolved_at < ?",
        now - RESOLVED_KEPT_MS,
      )
    })
    meter.run(
      'UPDATE run SET rows_written = rows_written + ?, rows_read = rows_read + ?',
      meter.rowsWritten + 1,
      meter.rowsRead,
    )
    const finished = this.run(meter)
    if (finished) await this.pushSummary(siteId, finished)
  }

  // One row per site in D1, so the scheduler and any list of sites never
  // wake site objects. On failure the alarm retries in a minute.
  private async pushSummary(siteId: string, run: Run): Promise<void> {
    if (run.summary_pushed_at || run.status === 'running' || !run.summary)
      return
    const summary = JSON.parse(run.summary) as RunSummary
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO site_summaries (site_id, run_id, status, complete, finished_at,
             pages_fetched, open_findings, new_findings, resolved_findings, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (site_id) DO UPDATE SET run_id = excluded.run_id,
             status = excluded.status, complete = excluded.complete,
             finished_at = excluded.finished_at, pages_fetched = excluded.pages_fetched,
             open_findings = excluded.open_findings, new_findings = excluded.new_findings,
             resolved_findings = excluded.resolved_findings, updated_at = excluded.updated_at`,
        ).bind(
          siteId,
          run.id,
          run.status,
          summary.complete ? 1 : 0,
          run.finished_at,
          summary.pages.fetched,
          summary.findings.open,
          summary.findings.new + summary.findings.reopened,
          summary.findings.resolved,
          Date.now(),
        ),
        this.env.DB.prepare(
          'UPDATE sites SET last_finished_at = ? WHERE id = ?',
        ).bind(run.finished_at, siteId),
      ])
      this.ctx.storage.sql.exec(
        'UPDATE run SET summary_pushed_at = ?',
        Date.now(),
      )
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY_MS)
    }
  }

  private run(meter: Meter): Run | null {
    return meter.one<Run>('SELECT * FROM run')
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
