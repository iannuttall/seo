import { getDb } from '../../storage/database.js'
import type {
  CrawlDiffRecommendation,
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
  recommendations: Array<CrawlDiffRecommendation & { url: string }> = [],
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
  const insertRecommendation = db.prepare(
    `INSERT INTO crawl_recommendations
    (run_id, site_url, url, severity, category, title, action, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const createdAt = Date.parse(run.createdAt)

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
    for (const recommendation of recommendations) {
      insertRecommendation.run(
        run.id,
        run.site,
        recommendation.url,
        recommendation.severity,
        recommendation.category,
        recommendation.title,
        recommendation.action,
        recommendation.confidence,
        createdAt,
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
    recommendations: number
    highPriorityRecommendations: number
    topRecommendation?: {
      url: string
      title: string
      action: string
      severity: string
    }
  }
> {
  const rows = getDb()
    .prepare(
      `WITH page_counts AS (
        SELECT
          run_id,
          COALESCE(SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS status_errors,
          COALESCE(SUM(CASE WHEN indexable = 0 THEN 1 ELSE 0 END), 0) AS non_indexable
        FROM crawl_pages
        GROUP BY run_id
      ),
      recommendation_counts AS (
        SELECT
          run_id,
          COUNT(*) AS recommendation_count,
          COALESCE(SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END), 0) AS high_recommendation_count
        FROM crawl_recommendations
        GROUP BY run_id
      ),
      recommendation_rank AS (
        SELECT
          crawl_recommendations.*,
          ROW_NUMBER() OVER (
            PARTITION BY run_id
            ORDER BY
              CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              created_at DESC
          ) AS rank
        FROM crawl_recommendations
      )
      SELECT
        crawl_runs.*,
        COALESCE(page_counts.status_errors, 0) AS status_errors,
        COALESCE(page_counts.non_indexable, 0) AS non_indexable,
        COALESCE(recommendation_counts.recommendation_count, 0) AS recommendation_count,
        COALESCE(recommendation_counts.high_recommendation_count, 0) AS high_recommendation_count,
        top.url AS top_recommendation_url,
        top.title AS top_recommendation_title,
        top.action AS top_recommendation_action,
        top.severity AS top_recommendation_severity
      FROM crawl_runs
      LEFT JOIN page_counts ON page_counts.run_id = crawl_runs.id
      LEFT JOIN recommendation_counts ON recommendation_counts.run_id = crawl_runs.id
      LEFT JOIN recommendation_rank top ON top.run_id = crawl_runs.id AND top.rank = 1
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
    recommendations: row.recommendation_count,
    highPriorityRecommendations: row.high_recommendation_count,
    topRecommendation: row.top_recommendation_url
      ? {
          url: row.top_recommendation_url,
          title: row.top_recommendation_title ?? '',
          action: row.top_recommendation_action ?? '',
          severity: row.top_recommendation_severity ?? 'medium',
        }
      : undefined,
  }))
}
