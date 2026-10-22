import { DurableObject } from 'cloudflare:workers'
import type { AuditSnapshot } from '@seo/core/commands'
import robotsParser from 'robots-parser'
import { extractPage, resolveUrl } from './extract.ts'
import { Meter } from './meter.ts'
import { analyse, type RunSummary } from './rules.ts'
import { DISPOSABLE, KEPT } from './schema.ts'
import { readSitemap } from './sitemap.ts'

// One object per person and Search Console property (the weekly-audit
// beta). Each wake is an alarm that claims up to BATCH_PAGES queued URLs,
// fetches them at most MAX_CONCURRENCY at once and MAX_RPS a second, writes
// each page as it lands and sets the next alarm. All state is in SQLite, so
// an evicted object carries on from its last written page. When the crawl
// ends it works out findings, keeps a capped history and pushes one summary
// row to D1, so listing sites never wakes an object.

export const USER_AGENT =
  'Mozilla/5.0 (compatible; SEOSkillBot/1.0; +https://seoskill.dev)'
const PRODUCT_TOKEN = 'SEOSkillBot'
const MAX_PAGES = 5000
const MAX_CONCURRENCY = 4
const MAX_RPS = 4
const BATCH_PAGES = 200
// A wake stops claiming pages after this long; the alarm limit is 15 minutes.
const WAKE_MS = 60_000
const FETCH_TIMEOUT_MS = 15_000
const MAX_ROBOTS_CHARS = 500_000
const MAX_SITEMAPS = 50
const MAX_ATTEMPTS = 3
const MAX_CONSECUTIVE_ERRORS = 3
const RETRY_DELAY_MS = 60_000
const MAX_PAUSE_MS = 120_000
// Above this crawl-delay, waiting between wakes (an alarm) is cheaper than
// waiting inside one: an alarm costs one request and one row, while waiting
// inside is billed as 128 MB for the whole delay.
const ALARM_WAIT_ABOVE_MS = 2000
const MAX_CRAWL_DELAY_MS = 10_000
const RUNS_KEPT = 52
const RESOLVED_KEPT_MS = 90 * 86_400_000
const ASSET =
  /\.(avif|bmp|css|csv|dmg|docx?|eot|gif|gz|ico|jpe?g|js|json|map|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i

export type Run = {
  id: string
  status: 'running' | 'done' | 'failed'
  started_at: number
  finished_at: number | null
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

type Site = {
  user_id: string
  property: string
  origin: string | null
  scope: string
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

// Where a property's crawl starts: the URL prefix itself, or the home page
// of a domain property's host.
export function startOf(property: string): URL {
  const domain = /^sc-domain:(.+)$/.exec(property)?.[1]
  const url = new URL(domain ? `https://${domain}/` : property)
  url.hash = ''
  url.search = ''
  return url
}

// The crawl's origin and path scope once the start URL's redirects are
// followed: a domain property may live on www or another subdomain, never
// outside the domain; a URL-prefix property keeps its own origin and path.
export function scopeOf(
  property: string,
  finalUrl: string,
): { origin: string; scope: string } | null {
  const final = URL.parse(finalUrl)
  if (!final) return null
  const domain = /^sc-domain:(.+)$/.exec(property)?.[1]
  if (domain) {
    const host = final.hostname
    return host === domain || host.endsWith(`.${domain}`)
      ? { origin: final.origin, scope: '/' }
      : null
  }
  const start = startOf(property)
  return { origin: start.origin, scope: start.pathname }
}

// Counters for one wake, added to the run row as each page is written.
type Wake = {
  meter: Meter
  requests: number
  throttled: number
  known: number
  dropped: number
  fetched: number
  // Rows already counted by an earlier flush.
  rowsWritten: number
  rowsRead: number
}

export class SiteAudit extends DurableObject<Env> {
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
    userId: string,
    property: string,
  ): Promise<{ created: boolean; runId: string }> {
    const meter = new Meter(this.ctx.storage)
    meter.run(
      `INSERT INTO site (user_id, property) VALUES (?, ?)
       ON CONFLICT (property) DO NOTHING`,
      userId,
      property,
    )
    const current = this.run(meter)
    if (current?.status === 'running') {
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.ctx.storage.setAlarm(Date.now())
      }
      return { created: false, runId: current.id }
    }
    const id = crypto.randomUUID()
    meter.transaction(() => {
      const hasPages = meter.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM pages WHERE state = 'fetched' LIMIT 1)",
      )?.n
      // Last week's pages stay one more run, for "what changed".
      meter.run('DROP TABLE IF EXISTS pages_prev')
      if (hasPages) meter.run('ALTER TABLE pages RENAME TO pages_prev')
      else meter.run('DROP TABLE pages')
      meter.run('DROP TABLE sitemaps')
      meter.run(DISPOSABLE)
      meter.run('DELETE FROM run')
      meter.run(
        `INSERT INTO run (id, status, started_at, concurrency)
         VALUES (?, 'running', ?, ?)`,
        id,
        Date.now(),
        Math.min(2, MAX_CONCURRENCY),
      )
    })
    await this.ctx.storage.setAlarm(Date.now())
    meter.run(
      'UPDATE run SET rows_written = ?, rows_read = ?, alarms = 1',
      meter.rowsWritten + 2,
      meter.rowsRead,
    )
    return { created: true, runId: id }
  }

  // Everything this object holds, gone: used when the site is removed or
  // the account is deleted.
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  snapshot(): AuditSnapshot | null {
    const meter = new Meter(this.ctx.storage)
    const site = meter.one<Site>('SELECT * FROM site')
    if (!site) return null
    const run = this.run(meter)
    // The last finished run: the current one, or the newest in history.
    const last = meter.one<{
      id: string
      started_at: number
      finished_at: number
      summary: string
    }>(
      'SELECT id, started_at, finished_at, summary FROM runs ORDER BY started_at DESC, id LIMIT 1',
    )
    const findings = last
      ? meter.all<AuditSnapshot['findings'][number]>(
          `SELECT rule, subject, details, state, first_seen_at, reopened_at, resolved_at
           FROM findings
           WHERE state = 'open' OR resolved_at >= ?
           ORDER BY rule, subject, id`,
          last.started_at,
        )
      : []
    const history = meter
      .all<{
        started_at: number
        finished_at: number
        status: string
        summary: string
      }>(
        'SELECT started_at, finished_at, status, summary FROM runs ORDER BY started_at DESC, id LIMIT ?',
        RUNS_KEPT,
      )
      .map((row) => {
        const summary = JSON.parse(row.summary) as RunSummary
        return {
          started_at: row.started_at,
          finished_at: row.finished_at,
          status: row.status,
          open: summary.findings.open,
          new: summary.findings.new + summary.findings.reopened,
          resolved: summary.findings.resolved,
        }
      })
    return {
      property: site.property,
      origin: site.origin,
      run: run
        ? {
            id: run.id,
            status: run.status,
            started_at: run.started_at,
            finished_at: run.finished_at,
            fetched: run.fetched,
            error: run.error,
          }
        : null,
      summary: last ? (JSON.parse(last.summary) as RunSummary) : null,
      finished_at: last?.finished_at ?? null,
      findings,
      history,
    }
  }

  override async alarm(): Promise<void> {
    const meter = new Meter(this.ctx.storage)
    const run = this.run(meter)
    const site = meter.one<Site>('SELECT * FROM site')
    if (!run || !site) return
    if (run.status !== 'running') {
      await this.pushSummary(site, run)
      return
    }
    const wake: Wake = {
      meter,
      requests: 0,
      throttled: 0,
      known: 0,
      dropped: 0,
      fetched: 0,
      rowsWritten: 0,
      rowsRead: 0,
    }
    const started = Date.now()
    let next: number | null = null
    let error: string | null = null
    let finished = false
    try {
      this.retryInflight(meter, run)
      if (!run.seeded) await this.seed(wake, run, site)
      const scoped = meter.one<Site>('SELECT * FROM site') as Site
      const origin = scoped.origin as string
      const robots = robotsParser(`${origin}/robots.txt`, run.robots_txt ?? '')
      const more = await this.crawlBatch(wake, run, scoped, robots, started)
      if (more) {
        const delay = Math.max(
          run.pause_until - Date.now(),
          run.crawl_delay_ms > ALARM_WAIT_ABOVE_MS ? run.crawl_delay_ms : 0,
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
    let alarms = 0
    if (next !== null) {
      await this.ctx.storage.setAlarm(next)
      alarms = 1
    }
    meter.run(
      `UPDATE run SET wakes = wakes + 1, alarms = alarms + ?, inflight = NULL,
         error = coalesce(?, error), consecutive_errors = ?, concurrency = ?, pause_until = ?`,
      alarms,
      error,
      errors,
      run.concurrency,
      run.pause_until,
    )
    this.flush(wake, run, alarms)
    if (finished || failed) await this.finish(site, failed ? 'failed' : 'done')
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
         rows_written = rows_written + ?, rows_read = rows_read + ?`,
      wake.requests,
      wake.throttled,
      wake.known,
      wake.dropped,
      wake.fetched,
      written,
      read,
    )
    run.requests += wake.requests
    run.throttled += wake.throttled
    run.known_urls += wake.known
    run.dropped_urls += wake.dropped
    run.fetched += wake.fetched
    run.rows_written += written
    run.rows_read += read
    wake.requests = 0
    wake.throttled = 0
    wake.known = 0
    wake.dropped = 0
    wake.fetched = 0
    wake.rowsWritten = meter.rowsWritten
    wake.rowsRead = meter.rowsRead
  }

  // A wake that never finished (an eviction or a crash) leaves its claimed
  // URLs in run.inflight. Pages start in claim order, so the ones that were
  // being fetched are the first MAX_CONCURRENCY of them still queued; only
  // those are charged an attempt, never the rest of the batch. After
  // MAX_ATTEMPTS a URL fails, so one URL that kills the object cannot stall
  // the crawl. Costs nothing on a normal wake.
  private retryInflight(meter: Meter, run: Run): void {
    if (!run.inflight) return
    meter.transaction(() => {
      meter.run(
        `UPDATE pages SET attempts = attempts + 1 WHERE url IN (
           SELECT j.value FROM json_each(?) j JOIN pages p ON p.url = j.value
           WHERE p.state = 'queued' ORDER BY j.key LIMIT ?)`,
        run.inflight,
        MAX_CONCURRENCY,
      )
      meter.run(
        `UPDATE pages SET state = 'failed',
           error = 'Gave up after the crawl stopped on this URL ${MAX_ATTEMPTS} times'
         WHERE state = 'queued' AND attempts >= ?`,
        MAX_ATTEMPTS,
      )
    })
  }

  // The start URL's redirects (to find the crawl's origin), robots.txt, the
  // sitemaps it lists (or /sitemap.xml) and the start URL itself.
  private async seed(wake: Wake, run: Run, site: Site): Promise<void> {
    const { meter } = wake
    const gap = () => sleep(Math.max(1000 / MAX_RPS, run.crawl_delay_ms))
    const start = startOf(site.property)
    if (!site.origin) {
      const home = await get(start.href, 'follow')
      wake.requests += 1
      await home.body?.cancel()
      const scope = scopeOf(site.property, home.url || start.href)
      if (!scope) {
        throw new Error(
          `${start.href} redirects to ${home.url}, outside ${site.property}`,
        )
      }
      meter.run(
        'UPDATE site SET origin = ?, scope = ?',
        scope.origin,
        scope.scope,
      )
      site.origin = scope.origin
      site.scope = scope.scope
      await gap()
    }
    const origin = site.origin
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
    const first = site.scope === '/' ? `${origin}/` : `${origin}${site.scope}`
    meter.transaction(() => {
      meter.run(
        'UPDATE run SET robots_status = ?, robots_txt = ?, crawl_delay_ms = ?',
        response.status,
        text,
        run.crawl_delay_ms,
      )
      this.enqueue(wake, run, site, robots, [first], 0)
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
      await gap()
      await this.fetchSitemap(wake, run, site, robots, sitemap.url)
    }
    await gap()
    meter.run('UPDATE run SET seeded = 1')
    run.seeded = 1
  }

  private async fetchSitemap(
    wake: Wake,
    run: Run,
    site: Site,
    robots: Robots,
    url: string,
  ): Promise<void> {
    const { meter } = wake
    const origin = site.origin as string
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
      this.enqueue(wake, run, site, robots, found, 1, 1)
      // New URLs were inserted marked; this marks URLs already known (the
      // start URL, or a URL in two sitemaps), one row per URL changed.
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
  // past the cap (twice MAX_PAGES) are counted, not stored, so the table and
  // memory stay bounded. Only URLs in the site's origin and scope are kept.
  private enqueue(
    wake: Wake,
    run: Run,
    site: Site,
    robots: Robots,
    urls: string[],
    depth: number,
    inSitemap: 0 | 1 = 0,
  ): void {
    const { meter } = wake
    const rows = urls
      .filter((href) => {
        const url = new URL(href)
        return (
          url.origin === site.origin &&
          url.pathname.startsWith(site.scope) &&
          !ASSET.test(url.pathname) &&
          !url.pathname.startsWith('/cdn-cgi/')
        )
      })
      .map((href) => [
        href,
        robots.isAllowed(href, PRODUCT_TOKEN) === false ? 'blocked' : 'queued',
      ])
    if (rows.length === 0) return
    const cap = MAX_PAGES * 2
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

  // Fetches up to BATCH_PAGES queued URLs, at most `concurrency` at once and
  // MAX_RPS a second (or one per crawl-delay), until the wake's time is up.
  // Returns false when the crawl has nothing left to fetch.
  private async crawlBatch(
    wake: Wake,
    run: Run,
    site: Site,
    robots: Robots,
    started: number,
  ): Promise<boolean> {
    const { meter } = wake
    if (run.fetched >= MAX_PAGES) return false
    const alarmWait = run.crawl_delay_ms > ALARM_WAIT_ABOVE_MS
    const limit = Math.min(alarmWait ? 1 : BATCH_PAGES, MAX_PAGES - run.fetched)
    const claimed = meter.all<{ url: string; depth: number }>(
      "SELECT url, depth FROM pages WHERE state = 'queued' ORDER BY depth, rowid LIMIT ?",
      limit,
    )
    if (claimed.length === 0) return false
    meter.run(
      'UPDATE run SET inflight = ?',
      JSON.stringify(claimed.map((page) => page.url)),
    )

    const gap = Math.max(1000 / MAX_RPS, alarmWait ? 0 : run.crawl_delay_ms)
    // A crawl-delay means one request at a time.
    const concurrency = () => (run.crawl_delay_ms > 0 ? 1 : run.concurrency)
    const deadline = started + WAKE_MS
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
      const task = this.fetchPage(wake, run, site, robots, page).then(
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
              run.concurrency < MAX_CONCURRENCY
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
    if (run.fetched + wake.fetched >= MAX_PAGES) return false
    return Boolean(
      meter.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM pages WHERE state = 'queued' LIMIT 1)",
      )?.n,
    )
  }

  private async fetchPage(
    wake: Wake,
    run: Run,
    site: Site,
    robots: Robots,
    page: { url: string; depth: number },
  ): Promise<
    { kind: 'done'; ms: number } | { kind: 'throttled'; retryAfterMs: number }
  > {
    const { meter } = wake
    const origin = site.origin as string
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
      if (target) {
        this.enqueue(wake, run, site, robots, [target.href], page.depth)
      }
      // Pages that ask not to be followed add no new URLs.
      if (!/nofollow/.test(facts?.robots ?? '')) {
        this.enqueue(wake, run, site, robots, found, page.depth + 1)
      }
      this.flush(wake, run)
    })
    return { kind: 'done', ms }
  }

  // Works out findings and the week's changes, keeps a capped history and
  // pushes the summary to D1.
  private async finish(site: Site, status: 'done' | 'failed'): Promise<void> {
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
    if (finished) await this.pushSummary(site, finished)
  }

  // One row per site in D1, so the account page and the scheduler never
  // wake site objects. On failure the alarm retries in a minute.
  private async pushSummary(site: Site, run: Run): Promise<void> {
    if (run.summary_pushed_at || run.status === 'running' || !run.summary) {
      return
    }
    const summary = JSON.parse(run.summary) as RunSummary
    try {
      await this.env.DB.prepare(
        `UPDATE audit_sites SET last_finished_at = ?, last_status = ?, complete = ?,
           pages_fetched = ?, open_findings = ?, new_findings = ?, resolved_findings = ?
         WHERE user_id = ? AND property = ?`,
      )
        .bind(
          run.finished_at,
          run.status,
          summary.complete ? 1 : 0,
          summary.pages.fetched,
          summary.findings.open,
          summary.findings.new + summary.findings.reopened,
          summary.findings.resolved,
          site.user_id,
          site.property,
        )
        .run()
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
