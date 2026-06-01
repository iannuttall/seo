import { createHash, randomUUID } from 'node:crypto'
import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { inspectUrl, type UrlInspectionResult } from '../gsc/client.js'
import { getDb } from '../storage/database.js'

export type CrawlPageSnapshot = {
  url: string
  finalUrl: string
  status: number
  title?: string
  metaDescription?: string
  canonical?: string
  metaRobots?: string
  xRobotsTag?: string
  h1?: string
  indexable: boolean
  wordCount: number
  contentHash: string
  outgoingInternalCount: number
}

export type CrawlRun = {
  id: string
  site: string
  startUrl: string
  createdAt: string
  limit: number
  urlCount: number
}

export type CrawlDiffItem = {
  url: string
  kind: 'added' | 'removed' | 'changed'
  changes: string[]
  before?: Partial<CrawlPageSnapshot>
  after?: Partial<CrawlPageSnapshot>
}

export type CrawlDiffReport = {
  run: CrawlRun
  previousRun?: CrawlRun
  summary: {
    crawled: number
    added: number
    removed: number
    changed: number
    newErrors: number
    indexabilityFlips: number
  }
  items: CrawlDiffItem[]
  warnings: string[]
}

export type IndexWatchItem = {
  url: string
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
  lastCrawlTime?: string
  previous?: {
    verdict?: string
    coverageState?: string
    indexingState?: string
    robotsTxtState?: string
  }
  changed: boolean
  alert: boolean
}

export type IndexWatchReport = {
  site: string
  generatedAt: string
  summary: {
    inspected: number
    changed: number
    alerts: number
  }
  items: IndexWatchItem[]
}

type CrawlRunRow = {
  id: string
  site_url: string
  start_url: string
  created_at: number
  limit_count: number
  url_count: number
}

type CrawlPageRow = {
  run_id: string
  url: string
  final_url: string
  status: number
  title?: string | null
  meta_description?: string | null
  canonical?: string | null
  meta_robots?: string | null
  x_robots_tag?: string | null
  h1?: string | null
  indexable: number
  word_count: number
  content_hash: string
  outgoing_internal_count: number
}

type IndexWatchRow = {
  verdict?: string | null
  coverage_state?: string | null
  indexing_state?: string | null
  robots_txt_state?: string | null
}

function toRun(row: CrawlRunRow): CrawlRun {
  return {
    id: row.id,
    site: row.site_url,
    startUrl: row.start_url,
    createdAt: new Date(row.created_at).toISOString(),
    limit: row.limit_count,
    urlCount: row.url_count,
  }
}

function toPage(row: CrawlPageRow): CrawlPageSnapshot {
  return {
    url: row.url,
    finalUrl: row.final_url,
    status: row.status,
    title: row.title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    canonical: row.canonical ?? undefined,
    metaRobots: row.meta_robots ?? undefined,
    xRobotsTag: row.x_robots_tag ?? undefined,
    h1: row.h1 ?? undefined,
    indexable: row.indexable === 1,
    wordCount: row.word_count,
    contentHash: row.content_hash,
    outgoingInternalCount: row.outgoing_internal_count,
  }
}

function sameOriginUrl(href: string, base: URL): string | undefined {
  try {
    const url = new URL(href, base)
    url.hash = ''
    if (url.origin !== base.origin) return undefined
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function pageIndexable(page: CrawlPageSnapshot): boolean {
  return (
    page.status >= 200 &&
    page.status < 300 &&
    !hasNoIndex(page.metaRobots) &&
    !hasNoIndex(page.xRobotsTag)
  )
}

async function crawlOne(
  url: string,
  opts: { refresh?: boolean; js?: boolean | 'auto' },
): Promise<{ page?: CrawlPageSnapshot; urls: string[]; warning?: string }> {
  try {
    const fetched = await fetchPage(url, { refresh: opts.refresh, js: opts.js })
    const extracted = await extractPage(fetched)
    const base = new URL(extracted.finalUrl)
    const internalLinks = extracted.links
      .map((link) => sameOriginUrl(link.href, base))
      .filter((value): value is string => Boolean(value))
    const h1 = extracted.headings.find((heading) => heading.level === 1)?.text
    const page: CrawlPageSnapshot = {
      url,
      finalUrl: extracted.finalUrl,
      status: fetched.status,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      canonical: extracted.canonical
        ? new URL(extracted.canonical, extracted.finalUrl).toString()
        : undefined,
      metaRobots: extracted.metaRobots,
      xRobotsTag: extracted.xRobotsTag,
      h1,
      indexable: false,
      wordCount: extracted.wordCount,
      contentHash: hashText(
        [
          extracted.title,
          extracted.metaDescription,
          h1,
          extracted.canonical,
          extracted.contentText,
        ].join('\n'),
      ),
      outgoingInternalCount: new Set(internalLinks).size,
    }
    page.indexable = pageIndexable(page)
    return { page, urls: [...new Set(internalLinks)] }
  } catch (error) {
    return {
      urls: [],
      warning: `${url}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function getPreviousRun(input: {
  site: string
  startUrl: string
  currentRunId: string
}): CrawlRun | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM crawl_runs
      WHERE site_url = ? AND start_url = ? AND id != ?
      ORDER BY created_at DESC LIMIT 1`,
    )
    .get(input.site, input.startUrl, input.currentRunId) as
    | CrawlRunRow
    | undefined
  return row ? toRun(row) : undefined
}

function getRunPages(runId: string): Map<string, CrawlPageSnapshot> {
  const rows = getDb()
    .prepare('SELECT * FROM crawl_pages WHERE run_id = ?')
    .all(runId) as CrawlPageRow[]
  return new Map(rows.map((row) => [row.url, toPage(row)]))
}

export function compareCrawlPages(input: {
  current: CrawlPageSnapshot[]
  previous: CrawlPageSnapshot[]
}): CrawlDiffItem[] {
  const current = new Map(input.current.map((page) => [page.url, page]))
  const previous = new Map(input.previous.map((page) => [page.url, page]))
  const items: CrawlDiffItem[] = []

  for (const [url, page] of current.entries()) {
    const before = previous.get(url)
    if (!before) {
      items.push({ url, kind: 'added', changes: ['url_added'], after: page })
      continue
    }

    const changes: string[] = []
    if (before.status !== page.status) changes.push('status')
    if (before.title !== page.title) changes.push('title')
    if (before.metaDescription !== page.metaDescription) {
      changes.push('meta_description')
    }
    if (before.canonical !== page.canonical) changes.push('canonical')
    if (before.h1 !== page.h1) changes.push('h1')
    if (before.indexable !== page.indexable) changes.push('indexability')
    if (before.contentHash !== page.contentHash) changes.push('content')

    if (changes.length) {
      items.push({ url, kind: 'changed', changes, before, after: page })
    }
  }

  for (const [url, page] of previous.entries()) {
    if (!current.has(url)) {
      items.push({
        url,
        kind: 'removed',
        changes: ['url_removed'],
        before: page,
      })
    }
  }

  return items
}

function insertCrawlRun(run: CrawlRun, pages: CrawlPageSnapshot[]): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO crawl_runs
    (id, site_url, start_url, created_at, limit_count, url_count)
    VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.site,
    run.startUrl,
    Date.parse(run.createdAt),
    run.limit,
    pages.length,
  )

  const insertPage = db.prepare(
    `INSERT INTO crawl_pages
    (run_id, url, final_url, status, title, meta_description, canonical,
     meta_robots, x_robots_tag, h1, indexable, word_count, content_hash,
     outgoing_internal_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const transaction = db.transaction(() => {
    for (const page of pages) {
      insertPage.run(
        run.id,
        page.url,
        page.finalUrl,
        page.status,
        page.title ?? null,
        page.metaDescription ?? null,
        page.canonical ?? null,
        page.metaRobots ?? null,
        page.xRobotsTag ?? null,
        page.h1 ?? null,
        page.indexable ? 1 : 0,
        page.wordCount,
        page.contentHash,
        page.outgoingInternalCount,
      )
    }
  })
  transaction()
}

export async function crawlDiff(input: {
  startUrl: string
  site?: string
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<CrawlDiffReport> {
  const startUrl = new URL(input.startUrl).toString()
  const site = input.site ?? new URL(startUrl).origin
  const limit = input.limit ?? 50
  const queue = [startUrl]
  const seen = new Set<string>()
  const pages: CrawlPageSnapshot[] = []
  const warnings: string[] = []

  while (queue.length && pages.length < limit) {
    const url = queue.shift()
    if (!url || seen.has(url)) continue
    seen.add(url)
    const result = await crawlOne(url, {
      refresh: input.refresh,
      js: input.js ?? 'auto',
    })
    if (result.warning) warnings.push(result.warning)
    if (result.page) pages.push(result.page)
    for (const next of result.urls) {
      if (!seen.has(next) && queue.length + pages.length < limit * 3) {
        queue.push(next)
      }
    }
  }

  const run: CrawlRun = {
    id: randomUUID(),
    site,
    startUrl,
    createdAt: new Date().toISOString(),
    limit,
    urlCount: pages.length,
  }
  insertCrawlRun(run, pages)

  const previousRun = getPreviousRun({ site, startUrl, currentRunId: run.id })
  const previousPages = previousRun
    ? [...getRunPages(previousRun.id).values()]
    : []
  const items = previousRun
    ? compareCrawlPages({ current: pages, previous: previousPages })
    : []

  return {
    run,
    previousRun,
    summary: {
      crawled: pages.length,
      added: items.filter((item) => item.kind === 'added').length,
      removed: items.filter((item) => item.kind === 'removed').length,
      changed: items.filter((item) => item.kind === 'changed').length,
      newErrors: items.filter(
        (item) =>
          item.kind !== 'removed' &&
          (item.after?.status ?? 0) >= 400 &&
          (item.before?.status ?? 200) < 400,
      ).length,
      indexabilityFlips: items.filter((item) =>
        item.changes.includes('indexability'),
      ).length,
    },
    items,
    warnings,
  }
}

function statusFromInspection(result: UrlInspectionResult): IndexWatchItem {
  const status = result.inspectionResult?.indexStatusResult
  return {
    url: '',
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    indexingState: status?.indexingState,
    robotsTxtState: status?.robotsTxtState,
    pageFetchState: status?.pageFetchState,
    googleCanonical: status?.googleCanonical,
    userCanonical: status?.userCanonical,
    lastCrawlTime: status?.lastCrawlTime,
    changed: false,
    alert: false,
  }
}

function latestIndexWatch(
  site: string,
  url: string,
): IndexWatchRow | undefined {
  return getDb()
    .prepare(
      `SELECT verdict, coverage_state, indexing_state, robots_txt_state
      FROM index_watch_snapshots
      WHERE site_url = ? AND url = ?
      ORDER BY inspected_at DESC LIMIT 1`,
    )
    .get(site, url) as IndexWatchRow | undefined
}

function insertIndexWatch(site: string, item: IndexWatchItem): void {
  getDb()
    .prepare(
      `INSERT INTO index_watch_snapshots
      (id, site_url, url, verdict, coverage_state, indexing_state,
       robots_txt_state, page_fetch_state, google_canonical, user_canonical,
       last_crawl_time, inspected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      site,
      item.url,
      item.verdict ?? null,
      item.coverageState ?? null,
      item.indexingState ?? null,
      item.robotsTxtState ?? null,
      item.pageFetchState ?? null,
      item.googleCanonical ?? null,
      item.userCanonical ?? null,
      item.lastCrawlTime ?? null,
      Date.now(),
    )
}

export async function indexWatch(input: {
  site: string
  urls: string[]
  languageCode?: string
}): Promise<IndexWatchReport> {
  const items: IndexWatchItem[] = []
  for (const url of input.urls) {
    const previous = latestIndexWatch(input.site, url)
    const result = await inspectUrl({
      siteUrl: input.site,
      inspectionUrl: url,
      languageCode: input.languageCode,
    })
    const item = { ...statusFromInspection(result), url }
    item.previous = previous
      ? {
          verdict: previous.verdict ?? undefined,
          coverageState: previous.coverage_state ?? undefined,
          indexingState: previous.indexing_state ?? undefined,
          robotsTxtState: previous.robots_txt_state ?? undefined,
        }
      : undefined
    item.changed = Boolean(
      previous &&
        (previous.verdict !== item.verdict ||
          previous.coverage_state !== item.coverageState ||
          previous.indexing_state !== item.indexingState ||
          previous.robots_txt_state !== item.robotsTxtState),
    )
    item.alert = Boolean(
      item.changed &&
        (item.verdict !== 'PASS' ||
          /not indexed|excluded|blocked|error/i.test(item.coverageState ?? '')),
    )
    insertIndexWatch(input.site, item)
    items.push(item)
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      inspected: items.length,
      changed: items.filter((item) => item.changed).length,
      alerts: items.filter((item) => item.alert).length,
    },
    items,
  }
}
