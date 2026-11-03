import { DurableObject } from 'cloudflare:workers'
import {
  type CrawledPage,
  type CrawlSkipReason,
  crawlUrl,
  excerptOf,
  GENERIC_ANCHORS,
  hasMetaRobotsDirective,
  hasXRobotsDirective,
  type InternalLinksDependencies,
  internalLinksReportWith,
  linkableSentences,
  normalizePageUrl,
  placementPage,
  resolveAliases,
  type SiteCrawl,
  SiteIndex,
  termCounts,
  typesafeDecisionModel,
} from '@seo/core/hosted'
import robotsParser from 'robots-parser'
import { resolveUrl } from '../audit/extract.ts'
import {
  PRODUCT_TOKEN,
  scopeOf,
  startOf,
  USER_AGENT,
} from '../audit/site-audit.ts'
import { readSitemap } from '../audit/sitemap.ts'
import { directory } from '../google.ts'
import { accountsOf } from '../store.ts'
import { addUsage } from '../usage.ts'
import { readLinkPage } from './read.ts'
import { type LinksResult, resultOf } from './result.ts'

// The internal linking tool on seoskill.dev, run in the cloud: one object
// per person and Search Console property. An alarm crawls the site in
// wakes of up to a minute as SEOSkillBot, honouring robots.txt and its
// crawl delay, and writes each page's links, terms and linkable sentences
// to SQLite as it lands, so an evicted object carries on. When the crawl
// ends, the shared report in core (internalLinksReportWith) works out the
// links to add, with Jev on SEO Skill's TypeSafe key. Only a trimmed result
// is kept, the crawl is dropped, and everything is deleted KEEP_MS after the
// run ends, except the day's run count, which goes with it a day later.
// Never renders JavaScript.

export const KEEP_MS = 24 * 3_600_000

const CONCURRENCY = 4
// At most four requests a second, or one per robots.txt crawl delay.
const GAP_MS = 250
const WAKE_MS = 60_000
const BATCH = 240
const FETCH_TIMEOUT_MS = 15_000
const MAX_ROBOTS_CHARS = 500_000
const MAX_SITEMAPS = 50
// As in the CLI's crawl: a crawl delay is honoured up to 10 seconds, and a
// site that asks for one is crawled for about 15 minutes at most.
const MAX_CRAWL_DELAY_SECONDS = 10
const CRAWL_DELAY_BUDGET_SECONDS = 900
// Linked URLs outside the crawl that are followed to see where they lead.
const REDIRECT_CHECKS = 150
const MAX_REDIRECT_HOPS = 5
const GENERIC_ANCHOR_LIMIT = 100
// Terms kept per page; the shared index keeps no more than this either.
const PAGE_TERMS = 300
const MAX_ATTEMPTS = 3
const MAX_THROTTLES = 10
const MAX_PAUSE_MS = 120_000
const RETRY_MS = 60_000
const MAX_ERRORS = 3
// Search Console query rows read for shared queries, to fit the object's
// memory next to a 5,000-page crawl.
const GSC_MAX_ROWS = 50_000
const ASSET =
  /\.(avif|bmp|css|csv|dmg|docx?|eot|gif|gz|ico|jpe?g|js|json|map|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i

export type Plan = 'free' | 'audit'

type Status = 'crawling' | 'checking' | 'analysing' | 'done' | 'failed'

type Run = {
  id: string
  user_id: string
  property: string
  plan: Plan
  max_pages: number
  status: Status
  started_at: number
  finished_at: number | null
  keep_until: number | null
  origin: string | null
  scope: string
  robots_txt: string | null
  crawl_delay_ms: number
  page_limit: number
  method: 'sitemap' | 'links'
  seeded: number
  blocked: number
  sitemap_urls: number
  queued: number
  overflow: number
  pages: number
  skipped: string
  warnings: string
  redirects_checked: number
  requests: number
  throttles: number
  pause_until: number
  errors: number
  error: string | null
  result: string | null
  cost_usd: number
  metered: number
}

export type RunState = {
  status: Status
  plan: Plan
  maxPages: number
  pageLimit: number
  pagesCrawled: number
  startedAt: number
  finishedAt: number | null
  keepUntil: number | null
  error: string | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS day_runs (
  day TEXT NOT NULL,
  plan TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, plan)
);
CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  property TEXT NOT NULL,
  plan TEXT NOT NULL,
  max_pages INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  keep_until INTEGER,
  origin TEXT,
  scope TEXT NOT NULL DEFAULT '/',
  robots_txt TEXT,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 0,
  page_limit INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'links',
  seeded INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  sitemap_urls INTEGER NOT NULL DEFAULT 0,
  queued INTEGER NOT NULL DEFAULT 0,
  overflow INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  skipped TEXT NOT NULL DEFAULT '{}',
  warnings TEXT NOT NULL DEFAULT '[]',
  redirects_checked INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  throttles INTEGER NOT NULL DEFAULT 0,
  pause_until INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  metered INTEGER NOT NULL DEFAULT 0
);
`

// One crawl only: dropped once the result is worked out.
const CRAWL = `
CREATE TABLE IF NOT EXISTS urls (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  -- seen (linked only), queued, done, or checked (followed for a redirect)
  state TEXT NOT NULL,
  alias INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  url_id INTEGER NOT NULL UNIQUE,
  record TEXT NOT NULL,
  terms TEXT NOT NULL,
  sentences TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS anchors (
  source INTEGER NOT NULL,
  href TEXT NOT NULL,
  text TEXT NOT NULL
);
`

type Robots = ReturnType<typeof robotsParser>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const today = () => new Date().toISOString().slice(0, 10)

function get(url: string): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

export class InternalLinks extends DurableObject<Env> {
  private readonly sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(SCHEMA)
      this.sql.exec(CRAWL)
    })
  }

  private run(): Run | null {
    return this.sql.exec<Run>('SELECT * FROM run').toArray()[0] ?? null
  }

  private one<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: unknown[]
  ): T | null {
    return this.sql.exec<T>(query, ...bindings).toArray()[0] ?? null
  }

  // Runs started today on this site, by plan.
  private runsToday(): Record<Plan, number> {
    const rows = this.sql
      .exec<{ plan: Plan; n: number }>(
        'SELECT plan, n FROM day_runs WHERE day = ?',
        today(),
      )
      .toArray()
    return {
      free: rows.find((row) => row.plan === 'free')?.n ?? 0,
      audit: rows.find((row) => row.plan === 'audit')?.n ?? 0,
    }
  }

  // The latest run and its result while it is kept, and today's runs.
  status(): {
    run: RunState | null
    result: LinksResult | null
    runsToday: Record<Plan, number>
  } {
    const run = this.run()
    const kept = run && (run.keep_until === null || run.keep_until > Date.now())
    return {
      run: kept
        ? {
            status: run.status,
            plan: run.plan,
            maxPages: run.max_pages,
            pageLimit: run.page_limit || run.max_pages,
            pagesCrawled: run.pages,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            keepUntil: run.keep_until,
            error: run.error,
          }
        : null,
      result:
        kept && run.result ? (JSON.parse(run.result) as LinksResult) : null,
      runsToday: this.runsToday(),
    }
  }

  // Starts a run unless one is running or the site's runs for the plan are
  // used up today. The free plan's limit is per account, so its caller
  // checks it in D1; this one counts it all the same.
  async start(input: {
    userId: string
    property: string
    plan: Plan
    maxPages: number
    runsPerDay: number
  }): Promise<'started' | 'running' | 'limit'> {
    const current = this.run()
    if (
      current &&
      (current.status === 'crawling' ||
        current.status === 'checking' ||
        current.status === 'analysing')
    ) {
      return 'running'
    }
    if (this.runsToday()[input.plan] >= input.runsPerDay) return 'limit'
    const day = today()
    this.ctx.storage.transactionSync(() => {
      this.dropCrawl()
      this.sql.exec('DELETE FROM run')
      this.sql.exec('DELETE FROM day_runs WHERE day <> ?', day)
      this.sql.exec(
        `INSERT INTO day_runs (day, plan, n) VALUES (?, ?, 1)
         ON CONFLICT (day, plan) DO UPDATE SET n = n + 1`,
        day,
        input.plan,
      )
      this.sql.exec(
        `INSERT INTO run (id, user_id, property, plan, max_pages, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'crawling', ?)`,
        crypto.randomUUID(),
        input.userId,
        input.property,
        input.plan,
        input.maxPages,
        Date.now(),
      )
    })
    await this.ctx.storage.setAlarm(Date.now())
    return 'started'
  }

  // Everything this object holds, gone.
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  private dropCrawl(): void {
    this.sql.exec('DROP TABLE IF EXISTS urls')
    this.sql.exec('DROP TABLE IF EXISTS pages')
    this.sql.exec('DROP TABLE IF EXISTS anchors')
    this.sql.exec(CRAWL)
  }

  override async alarm(): Promise<void> {
    const run = this.run()
    if (!run) {
      await this.destroy()
      return
    }
    if (run.status === 'done' || run.status === 'failed') {
      const keep = run.keep_until ?? 0
      if (Date.now() >= keep) await this.destroy()
      else await this.afterRun(run, keep)
      return
    }
    let next = Date.now()
    try {
      if (run.status === 'crawling') {
        if (!run.seeded) await this.seed(run)
        const more = !run.blocked && (await this.crawl(run))
        if (more) next = Math.max(run.pause_until, Date.now())
        else this.sql.exec("UPDATE run SET status = 'checking'")
      } else if (run.status === 'checking') {
        if (!(await this.checkRedirects(run))) {
          this.sql.exec("UPDATE run SET status = 'analysing'")
        }
      } else {
        await this.analyse(run)
        return
      }
      this.sql.exec('UPDATE run SET errors = 0')
    } catch (error) {
      const errors = run.errors + 1
      const text = error instanceof Error ? error.message : String(error)
      if (errors >= MAX_ERRORS) {
        await this.fail(run, text)
        return
      }
      this.sql.exec('UPDATE run SET errors = ?', errors)
      next = Date.now() + RETRY_MS
    }
    await this.ctx.storage.setAlarm(next)
  }

  private async fail(run: Run, error: string): Promise<void> {
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      this.dropCrawl()
      this.sql.exec(
        `UPDATE run SET status = 'failed', error = ?, finished_at = ?, keep_until = ?,
           robots_txt = NULL`,
        error.slice(0, 300),
        now,
        now + KEEP_MS,
      )
    })
    await this.afterRun(run, now + KEEP_MS)
  }

  // Pages crawled and SEO Skill's TypeSafe spend go to the account's usage
  // once, then the alarm waits to delete the result. A D1 failure is tried
  // again in a minute.
  private async afterRun(run: Run, keepUntil: number): Promise<void> {
    const saved = this.run() ?? run
    let metered = saved.metered === 1
    if (!metered) {
      metered = await addUsage(this.env, run.user_id, {
        internal_links_pages: saved.pages,
        included_typesafe_microusd: saved.cost_usd * 1_000_000,
      }).then(
        () => true,
        () => false,
      )
      if (metered) this.sql.exec('UPDATE run SET metered = 1')
    }
    await this.ctx.storage.setAlarm(
      metered ? keepUntil : Math.min(Date.now() + RETRY_MS, keepUntil),
    )
  }

  // The start URL's redirects (for the origin), robots.txt and its crawl
  // delay, and the sitemaps it lists (or /sitemap.xml), then the queue.
  private async seed(run: Run): Promise<void> {
    const start = startOf(run.property)
    const home = await fetch(start.href, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    await home.body?.cancel()
    const scope = scopeOf(run.property, home.url || start.href)
    if (!scope) {
      throw new Error(
        `${start.href} redirects to ${home.url}, outside the Search Console property.`,
      )
    }
    const origin = scope.origin
    const robotsResponse = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    // RFC 9309: a server error means the crawl must wait and try again.
    if (robotsResponse.status >= 500) {
      await robotsResponse.body?.cancel()
      throw new Error(
        `robots.txt answered with HTTP ${robotsResponse.status}, so the crawl could not start.`,
      )
    }
    const text = robotsResponse.ok
      ? (await robotsResponse.text()).slice(0, MAX_ROBOTS_CHARS)
      : ''
    if (!robotsResponse.ok) await robotsResponse.body?.cancel()
    const robots = robotsParser(`${origin}/robots.txt`, text)
    const delay = Number(robots.getCrawlDelay(PRODUCT_TOKEN) ?? 0)
    const delaySeconds =
      delay > 0 ? Math.min(delay, MAX_CRAWL_DELAY_SECONDS) : 0
    const pageLimit = delaySeconds
      ? Math.min(
          run.max_pages,
          Math.max(20, Math.floor(CRAWL_DELAY_BUDGET_SECONDS / delaySeconds)),
        )
      : run.max_pages
    const warnings: string[] = []
    if (pageLimit < run.max_pages) {
      warnings.push(
        `robots.txt asks for ${delaySeconds} seconds between requests, so the crawl stopped at ${pageLimit} pages to finish in about ${CRAWL_DELAY_BUDGET_SECONDS / 60} minutes.`,
      )
    }
    const first = `${origin}${scope.scope}`
    const blocked = robots.isAllowed(first, PRODUCT_TOKEN) === false
    if (blocked) {
      warnings.push(`robots.txt does not allow this crawler to read ${first}.`)
    }
    const site = { ...run, origin, scope: scope.scope }

    // Sitemap URLs first, up to twice the page limit; with none, follow
    // links from the start page.
    const seeds: string[] = []
    let requests = 2
    if (!blocked) {
      const listed = robots
        .getSitemaps()
        .map((loc: string) => resolveUrl(loc, origin))
        .filter((url: URL | null): url is URL => url?.origin === origin)
        .map((url: URL) => url.href)
      const sitemaps = listed.length ? listed : [`${origin}/sitemap.xml`]
      const seen = new Set(sitemaps)
      for (let at = 0; at < sitemaps.length && at < MAX_SITEMAPS; at += 1) {
        if (seeds.length >= pageLimit * 2) break
        const url = sitemaps[at] as string
        if (robots.isAllowed(url, PRODUCT_TOKEN) === false) continue
        await sleep(Math.max(GAP_MS, delaySeconds * 1000))
        requests += 1
        const response = await fetch(url, {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => null)
        if (!response) continue
        if (!response.ok) {
          await response.body?.cancel()
          continue
        }
        const sitemap = await readSitemap(response).catch(() => null)
        if (!sitemap) continue
        for (const loc of sitemap.locs) {
          const found = crawlUrl(loc.trim())
          if (!found) continue
          if (sitemap.kind === 'index') {
            if (URL.parse(found)?.origin === origin && !seen.has(found)) {
              seen.add(found)
              sitemaps.push(found)
            }
          } else if (inScope(site, found) && seeds.length < pageLimit * 2) {
            seeds.push(found)
          }
        }
      }
    }
    const method = seeds.length ? 'sitemap' : 'links'
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `UPDATE run SET origin = ?, scope = ?, robots_txt = ?, crawl_delay_ms = ?,
           page_limit = ?, method = ?, blocked = ?, sitemap_urls = ?, warnings = ?,
           seeded = 1, requests = requests + ?`,
        origin,
        scope.scope,
        text,
        delaySeconds * 1000,
        pageLimit,
        method,
        blocked ? 1 : 0,
        seeds.length,
        JSON.stringify(warnings),
        requests,
      )
      if (!blocked) this.enqueue(method === 'sitemap' ? seeds : [first], false)
    })
    Object.assign(run, this.run())
  }

  // Adds URLs to the queue in order, up to five times the page limit
  // unless `always` (a redirect or canonical target).
  private enqueue(urls: string[], always: boolean): void {
    if (!urls.length) return
    const run = this.run() as Run
    const json = JSON.stringify(urls)
    this.sql.exec(
      `INSERT INTO urls (url, state) SELECT value, 'seen' FROM json_each(?) WHERE true
       ON CONFLICT (url) DO NOTHING`,
      json,
    )
    const room = always ? -1 : Math.max(0, run.page_limit * 5 - run.queued)
    if (room === 0) return
    const added = this.sql
      .exec(
        `UPDATE urls SET state = 'queued' WHERE id IN (
           SELECT id FROM urls WHERE state = 'seen'
             AND url IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT ?)
         RETURNING 1 AS n`,
        json,
        room,
      )
      .toArray().length
    if (added) this.sql.exec('UPDATE run SET queued = queued + ?', added)
  }

  // The ids of URLs, adding the ones not known yet as linked only.
  private idsOf(urls: string[]): Map<string, number> {
    if (!urls.length) return new Map()
    const json = JSON.stringify(urls)
    this.sql.exec(
      `INSERT INTO urls (url, state) SELECT value, 'seen' FROM json_each(?) WHERE true
       ON CONFLICT (url) DO NOTHING`,
      json,
    )
    return new Map(
      this.sql
        .exec<{ id: number; url: string }>(
          'SELECT id, url FROM urls WHERE url IN (SELECT value FROM json_each(?))',
          json,
        )
        .toArray()
        .map((row) => [row.url, row.id]),
    )
  }

  private skip(reason: CrawlSkipReason, count = 1): void {
    this.sql.exec(
      `UPDATE run SET skipped = json_set(skipped, '$.' || ?,
         coalesce(json_extract(skipped, '$.' || ?), 0) + ?)`,
      reason,
      reason,
      count,
    )
  }

  // One wake of the crawl. Returns true while there is more to fetch.
  private async crawl(run: Run): Promise<boolean> {
    const site = run
    const robots = robotsParser(
      `${run.origin}/robots.txt`,
      run.robots_txt ?? '',
    )
    const deadline = Date.now() + WAKE_MS
    const gap = Math.max(GAP_MS, run.crawl_delay_ms)
    const concurrency = run.crawl_delay_ms ? 1 : CONCURRENCY
    // A URL the object stopped on three times is given up.
    const stuck = this.sql
      .exec(
        `UPDATE urls SET state = 'done' WHERE state = 'queued' AND attempts >= ?
         RETURNING 1 AS n`,
        MAX_ATTEMPTS,
      )
      .toArray().length
    if (stuck) this.skip('fetch-failed', stuck)
    const pages = () =>
      this.one<{ pages: number }>('SELECT pages FROM run')?.pages ?? 0
    // Set when the site asks the crawler to slow down: when to carry on.
    const wake: { pause: number | null } = { pause: null }
    let nextStart = Date.now()
    while (
      Date.now() < deadline &&
      pages() < run.page_limit &&
      wake.pause === null
    ) {
      const claimed = this.sql
        .exec<{ id: number; url: string }>(
          "SELECT id, url FROM urls WHERE state = 'queued' ORDER BY id LIMIT ?",
          concurrency === 1 ? 1 : BATCH,
        )
        .toArray()
      if (!claimed.length) break
      this.sql.exec(
        'UPDATE urls SET attempts = attempts + 1 WHERE id IN (SELECT value FROM json_each(?))',
        JSON.stringify(claimed.map((row) => row.id)),
      )
      const active = new Set<Promise<void>>()
      for (const row of claimed) {
        while (active.size >= concurrency) await Promise.race(active)
        if (wake.pause !== null || Date.now() >= deadline) break
        if (pages() >= run.page_limit) break
        const wait = nextStart - Date.now()
        if (wait > 0) await sleep(wait)
        nextStart = Math.max(nextStart + gap, Date.now())
        const task = this.fetchOne(site, robots, row).then((retryAfter) => {
          if (retryAfter !== null) wake.pause = Date.now() + retryAfter
        })
        const tracked: Promise<void> = task.finally(() =>
          active.delete(tracked),
        )
        active.add(tracked)
      }
      await Promise.all(active)
      // Claimed but not started: back in the queue without an attempt.
      this.sql.exec(
        `UPDATE urls SET attempts = attempts - 1 WHERE state = 'queued'
           AND id IN (SELECT value FROM json_each(?)) AND attempts > 0`,
        JSON.stringify(claimed.map((row) => row.id)),
      )
    }
    const latest = this.run() as Run
    if (wake.pause !== null) {
      if (latest.throttles >= MAX_THROTTLES) {
        this.warn(
          `The site asked the crawler to slow down ${latest.throttles} times, so the crawl stopped at ${latest.pages} pages.`,
        )
        return false
      }
      this.sql.exec('UPDATE run SET pause_until = ?', wake.pause)
      run.pause_until = wake.pause
      return true
    }
    if (latest.pages >= latest.page_limit) return false
    return Boolean(
      this.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM urls WHERE state = 'queued' LIMIT 1)",
      )?.n,
    )
  }

  private warn(text: string): void {
    this.sql.exec(
      `UPDATE run SET warnings = json_insert(warnings, '$[#]', ?)`,
      text,
    )
  }

  // Fetches and records one URL. Returns how long to pause when the site
  // asks the crawler to slow down, else null.
  private async fetchOne(
    site: Run,
    robots: Robots,
    row: { id: number; url: string },
  ): Promise<number | null> {
    // The URL is finished, skipped for a reason or not; nothing to pause.
    const done = (reason?: CrawlSkipReason): null => {
      this.sql.exec("UPDATE urls SET state = 'done' WHERE id = ?", row.id)
      if (reason) this.skip(reason)
      return null
    }
    if (robots.isAllowed(row.url, PRODUCT_TOKEN) === false) {
      return done('robots')
    }
    let response: Response
    try {
      this.sql.exec('UPDATE run SET requests = requests + 1')
      response = await get(row.url)
    } catch {
      return done('fetch-failed')
    }
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel()
      this.sql.exec('UPDATE run SET throttles = throttles + 1')
      const header = Number(response.headers.get('retry-after'))
      return Number.isFinite(header) && header > 0
        ? Math.min(header * 1000, MAX_PAUSE_MS)
        : 30_000
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      const target = location ? crawlUrl(location, row.url) : undefined
      if (!target) return done('fetch-failed')
      if (!inScope(site, target)) return done('off-site')
      this.ctx.storage.transactionSync(() => {
        const id = this.idsOf([target]).get(target)
        this.sql.exec(
          "UPDATE urls SET state = 'done', alias = ? WHERE id = ?",
          id ?? null,
          row.id,
        )
        this.enqueue([target], true)
      })
      return null
    }
    if (response.status < 200 || response.status > 299) {
      await response.body?.cancel()
      return done('http-error')
    }
    if (!/html/i.test(response.headers.get('content-type') ?? 'text/html')) {
      await response.body?.cancel()
      return done('not-html')
    }
    let page: Awaited<ReturnType<typeof readLinkPage>>
    try {
      page = await readLinkPage(response)
    } catch {
      return done('fetch-failed')
    }
    // From here on, no await: the page number, record and limit check are
    // taken together.
    this.ctx.storage.transactionSync(() => {
      const url = row.url
      const canonical = page.canonical
        ? crawlUrl(page.canonical, url)
        : undefined
      if (
        canonical &&
        inScope(site, canonical) &&
        normalizePageUrl(canonical) !== normalizePageUrl(url)
      ) {
        const id = this.idsOf([canonical]).get(canonical)
        this.sql.exec(
          "UPDATE urls SET state = 'done', alias = ? WHERE id = ?",
          id ?? null,
          row.id,
        )
        this.enqueue([canonical], true)
        this.skip('canonicalised')
        return
      }
      const run = this.run() as Run
      if (run.pages >= run.page_limit) {
        this.sql.exec('UPDATE run SET overflow = overflow + 1')
        done()
        return
      }
      const text = placementPage({
        url,
        html: page.html,
        title: page.title,
        metaDescription: page.metaDescription,
        headings: page.headings,
      })
      const hasMain = /<(main|article)[\s>]|role=["']main["']/i.test(page.html)
      const hrefs: Array<{ href: string; text: string; contextual: boolean }> =
        []
      for (const link of page.links) {
        const href = crawlUrl(link.href, url)
        if (!href || !inScope(site, href)) continue
        hrefs.push({
          href,
          text: link.text,
          contextual:
            link.location === 'main-content' ||
            (!hasMain && link.location === 'other'),
        })
      }
      const ids = this.idsOf([...new Set(hrefs.map((link) => link.href))])
      const contextual = new Set<number>()
      const other = new Set<number>()
      const pageId = run.pages + 1
      let anchors =
        this.one<{ n: number }>('SELECT count(*) AS n FROM anchors')?.n ?? 0
      for (const link of hrefs) {
        const id = ids.get(link.href)
        if (id === undefined) continue
        if (link.contextual) {
          contextual.add(id)
          if (
            GENERIC_ANCHORS.test(link.text.trim()) &&
            anchors < GENERIC_ANCHOR_LIMIT
          ) {
            anchors += 1
            this.sql.exec(
              'INSERT INTO anchors (source, href, text) VALUES (?, ?, ?)',
              pageId,
              link.href,
              link.text.trim(),
            )
          }
        } else other.add(id)
      }
      const terms = Object.entries(termCounts(text))
        .sort(
          (left, right) =>
            right[1] - left[1] ||
            (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
        )
        .slice(0, PAGE_TERMS)
      const record: Omit<CrawledPage, 'text'> = {
        url,
        title: text.title,
        h1: text.h1,
        description: text.description,
        headings: text.headings,
        excerpt: excerptOf(text.sentences),
        words: text.sentences.reduce(
          (sum, sentence) => sum + sentence.text.split(/\s+/).length,
          0,
        ),
        lang: page.lang?.toLowerCase().split(/[-_]/)[0] || null,
        noindex:
          hasMetaRobotsDirective(page.robots, 'noindex') ||
          hasXRobotsDirective(
            response.headers.get('x-robots-tag') ?? undefined,
            'noindex',
          ),
        contextual: [...contextual],
        other: [...other],
      }
      this.sql.exec(
        'INSERT INTO pages (id, url_id, record, terms, sentences) VALUES (?, ?, ?, ?, ?)',
        pageId,
        row.id,
        JSON.stringify(record),
        JSON.stringify(Object.fromEntries(terms)),
        JSON.stringify(
          linkableSentences(text.sentences).map((sentence) => [
            sentence.text,
            sentence.section,
          ]),
        ),
      )
      this.sql.exec('UPDATE run SET pages = pages + 1')
      done()
      const nofollow = page.robots.some((value) => /\bnofollow\b/i.test(value))
      if (run.method === 'links' && !nofollow) {
        this.enqueue(
          hrefs.map((link) => link.href),
          false,
        )
      }
    })
    return null
  }

  // Linked URLs that were not crawled may redirect to a crawled page; a
  // link through them is still a link to that page. Follows the most
  // linked of them, REDIRECT_CHECKS at most over the run. Returns true
  // while some are left for the next wake.
  private async checkRedirects(run: Run): Promise<boolean> {
    const left = REDIRECT_CHECKS - this.checkedCount()
    if (left <= 0 || !run.origin) return false
    const crawled = new Set(
      this.sql
        .exec<{ url_id: number }>('SELECT url_id FROM pages')
        .toArray()
        .map((row) => row.url_id),
    )
    const known = new Set(
      this.sql
        .exec<{ id: number }>(
          "SELECT id FROM urls WHERE alias IS NOT NULL OR state = 'checked'",
        )
        .toArray()
        .map((row) => row.id),
    )
    const counts = new Map<number, number>()
    for (const row of this.sql
      .exec<{ record: string }>('SELECT record FROM pages')
      .toArray()) {
      const record = JSON.parse(row.record) as Pick<
        CrawledPage,
        'contextual' | 'other'
      >
      for (const id of [...record.contextual, ...record.other]) {
        if (crawled.has(id) || known.has(id)) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    const ids = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, left)
      .map(([id]) => id)
    if (!ids.length) return false
    const urls = new Map(
      this.sql
        .exec<{ id: number; url: string }>(
          'SELECT id, url FROM urls WHERE id IN (SELECT value FROM json_each(?))',
          JSON.stringify(ids),
        )
        .toArray()
        .map((row) => [row.id, row.url]),
    )
    const robots = robotsParser(
      `${run.origin}/robots.txt`,
      run.robots_txt ?? '',
    )
    const gap = Math.max(GAP_MS, run.crawl_delay_ms)
    const deadline = Date.now() + WAKE_MS
    for (const id of ids) {
      if (Date.now() >= deadline) return true
      const start = urls.get(id)
      if (!start) continue
      let url = start
      let reached = true
      for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
        if (robots.isAllowed(url, PRODUCT_TOKEN) === false) break
        await sleep(gap)
        this.sql.exec('UPDATE run SET requests = requests + 1')
        const response = await get(url).catch(() => null)
        await response?.body?.cancel()
        if (!response) {
          reached = false
          break
        }
        const location = response.headers.get('location')
        const next =
          response.status >= 300 && response.status < 400 && location
            ? crawlUrl(location, url)
            : undefined
        if (!next || !inScope(run, next)) break
        url = next
      }
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("UPDATE urls SET state = 'checked' WHERE id = ?", id)
        if (reached) {
          this.sql.exec(
            'UPDATE run SET redirects_checked = redirects_checked + 1',
          )
        }
        if (url !== start) {
          const target = this.idsOf([url]).get(url)
          this.sql.exec('UPDATE urls SET alias = ? WHERE id = ?', target, id)
        }
      })
    }
    return false
  }

  private checkedCount(): number {
    return (
      this.one<{ n: number }>(
        "SELECT count(*) AS n FROM urls WHERE state = 'checked'",
      )?.n ?? 0
    )
  }

  // The crawl as the shared report reads it, then the report, then the
  // trimmed result. The crawl is dropped once the result is saved.
  private async analyse(run: Run): Promise<void> {
    const urls: string[] = []
    const aliases = new Map<number, number>()
    for (const row of this.sql
      .exec<{ id: number; url: string; alias: number | null }>(
        'SELECT id, url, alias FROM urls ORDER BY id',
      )
      .toArray()) {
      urls[row.id - 1] = row.url
      if (row.alias !== null) aliases.set(row.id - 1, row.alias - 1)
    }
    for (let at = 0; at < urls.length; at += 1) urls[at] ??= ''
    const pages: CrawledPage[] = []
    const pageOfUrl = new Map<number, number>()
    const index = new SiteIndex()
    for (const row of this.sql
      .exec<{ id: number; url_id: number; record: string; terms: string }>(
        'SELECT id, url_id, record, terms FROM pages ORDER BY id',
      )
      .toArray()) {
      const record = JSON.parse(row.record) as Omit<CrawledPage, 'text'>
      const at = pages.length
      pages.push({
        ...record,
        contextual: record.contextual.map((id) => id - 1),
        other: record.other.map((id) => id - 1),
        text: { offset: row.id, length: 1 },
      })
      pageOfUrl.set(row.url_id - 1, at)
      index.addPage(JSON.parse(row.terms) as Record<string, number>)
    }
    resolveAliases(urls.length, pageOfUrl, aliases)
    index.finish()
    const pageNumber = new Map(pages.map((page, at) => [page.text.offset, at]))
    const genericAnchors = this.sql
      .exec<{ source: number; href: string; text: string }>(
        'SELECT source, href, text FROM anchors ORDER BY rowid',
      )
      .toArray()
      .map((row) => ({ ...row, source: pageNumber.get(row.source) ?? 0 }))
    const queuedLeft =
      this.one<{ n: number }>(
        "SELECT count(*) AS n FROM (SELECT 1 FROM urls WHERE state = 'queued' LIMIT 1)",
      )?.n ?? 0
    const crawl: SiteCrawl = {
      origin: run.origin ?? startOf(run.property).origin,
      method: run.method,
      pages,
      urls,
      pageOfUrl,
      index,
      sentences: {
        read: async (ref) =>
          (
            JSON.parse(
              this.one<{ sentences: string }>(
                'SELECT sentences FROM pages WHERE id = ?',
                ref.offset,
              )?.sentences ?? '[]',
            ) as [string, string][]
          ).map(([text, section]) => ({ text, section, hasLink: false })),
        close: async () => undefined,
      },
      genericAnchors,
      stats: {
        maxPages: run.max_pages,
        pageLimit: run.page_limit || run.max_pages,
        urlsFound: Math.max(run.queued, run.sitemap_urls),
        pagesCrawled: pages.length,
        capReached:
          pages.length >= run.page_limit &&
          (queuedLeft > 0 || run.overflow > 0),
        skipped: JSON.parse(run.skipped) as SiteCrawl['stats']['skipped'],
        crawlDelaySeconds: run.crawl_delay_ms
          ? run.crawl_delay_ms / 1000
          : null,
        blockedByRobots: run.blocked === 1,
        redirectsChecked: run.redirects_checked,
      },
      warnings: JSON.parse(run.warnings) as string[],
    }
    const accounts = await accountsOf(this.env, run.user_id)
    const searchConsole: InternalLinksDependencies['searchConsole'] = {
      property: run.property,
      maxRows: GSC_MAX_ROWS,
      query: (request) =>
        directory(this.env, accounts).searchAnalytics()(run.property, request),
    }
    const decisionModel: InternalLinksDependencies['decisionModel'] = this.env
      .TYPESAFE_API_KEY
      ? {
          model: typesafeDecisionModel({ apiKey: this.env.TYPESAFE_API_KEY }),
          keySource: 'environment',
        }
      : { unavailable: 'Jev is not set up on this server' }
    const report = await internalLinksReportWith(
      { site: run.property, maxPages: run.max_pages },
      { crawl: async () => crawl, searchConsole, decisionModel },
    )
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      this.dropCrawl()
      this.sql.exec(
        `UPDATE run SET status = 'done', finished_at = ?, keep_until = ?, result = ?,
           robots_txt = NULL, pages = ?, cost_usd = ?`,
        now,
        now + KEEP_MS,
        JSON.stringify(resultOf(run.property, report)),
        report.crawl.pagesCrawled,
        report.judge.costUsd,
      )
    })
    await this.afterRun(run, now + KEEP_MS)
  }
}

// Whether a URL is in the crawl: the site's origin and, for a URL-prefix
// property, its path, and not a file such as an image or a PDF.
function inScope(run: Pick<Run, 'origin' | 'scope'>, href: string): boolean {
  const url = URL.parse(href)
  return Boolean(
    url &&
      url.origin === run.origin &&
      url.pathname.startsWith(run.scope) &&
      !ASSET.test(url.pathname) &&
      !url.pathname.startsWith('/cdn-cgi/'),
  )
}
