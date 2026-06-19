import { getDb } from '../../storage/database.js'
import { type CrawlReport, normalizeLoadedCrawlReport } from './report.js'

export const CRAWL_REPORT_STORAGE_VERSION = 1

export type CrawlReportMeta = {
  id: string
  configHash: string
  site?: string
  url: string
  status: CrawlReport['status']
  totalPages: number
  issueCount: number
  createdAt: string
  storageVersion: number
}

export type CrawlReportStorageEnvelope = {
  kind: 'seo.crawl_report'
  version: typeof CRAWL_REPORT_STORAGE_VERSION
  savedAt: string
  tenant?: {
    projectId?: string
    site?: string
  }
  report: CrawlReport
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
    storageVersion: storageVersionFromJson(row.report_json),
  }
}

function storageEnvelope(report: CrawlReport): CrawlReportStorageEnvelope {
  const tenant: CrawlReportStorageEnvelope['tenant'] = {}
  if (report.projectId) tenant.projectId = report.projectId
  if (report.site) tenant.site = report.site

  return {
    kind: 'seo.crawl_report',
    version: CRAWL_REPORT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    ...(tenant.projectId || tenant.site ? { tenant } : {}),
    report,
  }
}

function storageVersionFromJson(value: string): number {
  try {
    const parsed = JSON.parse(value) as Partial<CrawlReportStorageEnvelope>
    return parsed.kind === 'seo.crawl_report' &&
      typeof parsed.version === 'number'
      ? parsed.version
      : 0
  } catch {
    return 0
  }
}

function reportFromJson(value: string): CrawlReport {
  const parsed = JSON.parse(value) as
    | CrawlReport
    | Partial<CrawlReportStorageEnvelope>
  if (
    parsed &&
    typeof parsed === 'object' &&
    'kind' in parsed &&
    parsed.kind === 'seo.crawl_report' &&
    'report' in parsed
  ) {
    return normalizeLoadedCrawlReport(parsed.report as CrawlReport)
  }
  return normalizeLoadedCrawlReport(parsed as CrawlReport)
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
      JSON.stringify(storageEnvelope(report)),
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
    storageVersion: CRAWL_REPORT_STORAGE_VERSION,
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
  return reportFromJson(row.report_json)
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
  return reportFromJson(row.report_json)
}
