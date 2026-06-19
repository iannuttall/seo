import { getDb } from '../../storage/database.js'
import { type CrawlReport, normalizeLoadedCrawlReport } from './report.js'

export type CrawlReportMeta = {
  id: string
  configHash: string
  site?: string
  url: string
  status: CrawlReport['status']
  totalPages: number
  issueCount: number
  createdAt: string
}

type CrawlReportRow = {
  id: string
  config_hash: string
  site_url?: string | null
  url: string
  status: CrawlReport['status']
  total_pages: number
  issue_count: number
  created_at: number
  report_json: string
}

function toMeta(row: CrawlReportRow): CrawlReportMeta {
  return {
    id: row.id,
    configHash: row.config_hash,
    site: row.site_url ?? undefined,
    url: row.url,
    status: row.status,
    totalPages: row.total_pages,
    issueCount: row.issue_count,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export function saveCrawlReport(report: CrawlReport): CrawlReportMeta {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO crawl_reports
      (id, config_hash, site_url, url, status, total_pages, issue_count, created_at, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      report.id,
      report.configHash,
      report.site ?? null,
      report.config.url,
      report.status,
      report.summary.totalPages,
      report.issues.length,
      Date.parse(report.generatedAt),
      JSON.stringify(report),
    )
  return {
    id: report.id,
    configHash: report.configHash,
    site: report.site,
    url: report.config.url,
    status: report.status,
    totalPages: report.summary.totalPages,
    issueCount: report.issues.length,
    createdAt: report.generatedAt,
  }
}

export function listCrawlReports(
  input: { site?: string; limit?: number } = {},
): CrawlReportMeta[] {
  const limit = input.limit ?? 20
  const rows = input.site
    ? (getDb()
        .prepare(
          `SELECT * FROM crawl_reports
          WHERE site_url = ?
          ORDER BY created_at DESC
          LIMIT ?`,
        )
        .all(input.site, limit) as CrawlReportRow[])
    : (getDb()
        .prepare(
          `SELECT * FROM crawl_reports
          ORDER BY created_at DESC
          LIMIT ?`,
        )
        .all(limit) as CrawlReportRow[])
  return rows.map(toMeta)
}

export function loadCrawlReport(id: string): CrawlReport | undefined {
  const row = getDb()
    .prepare('SELECT report_json FROM crawl_reports WHERE id = ?')
    .get(id) as { report_json: string } | undefined
  if (!row) return undefined
  return normalizeLoadedCrawlReport(JSON.parse(row.report_json) as CrawlReport)
}

export function deleteCrawlReport(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM crawl_reports WHERE id = ?')
    .run(id)
  return result.changes > 0
}

export function latestCrawlReport(site?: string): CrawlReport | undefined {
  const row = site
    ? (getDb()
        .prepare(
          `SELECT report_json FROM crawl_reports
          WHERE site_url = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        )
        .get(site) as { report_json: string } | undefined)
    : (getDb()
        .prepare(
          `SELECT report_json FROM crawl_reports
          ORDER BY created_at DESC
          LIMIT 1`,
        )
        .get() as { report_json: string } | undefined)
  if (!row) return undefined
  return normalizeLoadedCrawlReport(JSON.parse(row.report_json) as CrawlReport)
}
