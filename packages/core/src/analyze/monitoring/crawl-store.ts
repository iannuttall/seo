import { getDb } from '../../storage/database.js'
import type {
  CrawlPageRow,
  CrawlPageSnapshot,
  CrawlRun,
  CrawlRunRow,
  LatestCrawlSummaryRow,
} from './types.js'

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

export function getPreviousRun(input: {
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

export function getRunPages(runId: string): Map<string, CrawlPageSnapshot> {
  const rows = getDb()
    .prepare('SELECT * FROM crawl_pages WHERE run_id = ?')
    .all(runId) as CrawlPageRow[]
  return new Map(rows.map((row) => [row.url, toPage(row)]))
}

export function insertCrawlRun(
  run: CrawlRun,
  pages: CrawlPageSnapshot[],
): void {
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

export function latestCrawlSummaries(
  site: string,
  limit = 5,
): Array<
  CrawlRun & {
    statusErrors: number
    nonIndexable: number
  }
> {
  const rows = getDb()
    .prepare(
      `SELECT
        crawl_runs.*,
        COALESCE(SUM(CASE WHEN crawl_pages.status >= 400 THEN 1 ELSE 0 END), 0) AS status_errors,
        COALESCE(SUM(CASE WHEN crawl_pages.indexable = 0 THEN 1 ELSE 0 END), 0) AS non_indexable
      FROM crawl_runs
      LEFT JOIN crawl_pages ON crawl_pages.run_id = crawl_runs.id
      WHERE crawl_runs.site_url = ?
      GROUP BY crawl_runs.id
      ORDER BY crawl_runs.created_at DESC
      LIMIT ?`,
    )
    .all(site, limit) as LatestCrawlSummaryRow[]

  return rows.map((row) => ({
    ...toRun(row),
    statusErrors: row.status_errors,
    nonIndexable: row.non_indexable,
  }))
}
