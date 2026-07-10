import { getDb } from '../../storage/database.js'
import { type CrawlReport, normalizeLoadedCrawlReport } from './report.js'

export const CRAWL_REPORT_STORAGE_VERSION = 4

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

export type CrawlReportStoreAdapter = {
  save: (report: CrawlReport) => CrawlReportMeta
  list: (input?: { site?: string; limit?: number }) => CrawlReportMeta[]
  load: (id: string) => CrawlReport | undefined
  delete: (id: string) => boolean
  latest: (site?: string) => CrawlReport | undefined
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

function saveCrawlReportToSqlite(report: CrawlReport): CrawlReportMeta {
  const result = getDb()
    .prepare(
      `INSERT INTO crawl_reports
      (id, config_hash, site_url, url, status, total_pages, issue_count, created_at, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
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
  if (result.changes === 0) {
    const existing = getDb()
      .prepare('SELECT * FROM crawl_reports WHERE id = ?')
      .get(report.id) as CrawlReportRow | undefined
    if (existing) return toMeta(existing)
  }
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

function listCrawlReportsFromSqlite(
  input: { site?: string; limit?: number } = {},
): CrawlReportMeta[] {
  const limit = input.limit ?? 20
  const rows = input.site
    ? (getDb()
        .prepare(
          `SELECT * FROM crawl_reports
          WHERE site_url = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        )
        .all(input.site, limit) as CrawlReportRow[])
    : (getDb()
        .prepare(
          `SELECT * FROM crawl_reports
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        )
        .all(limit) as CrawlReportRow[])
  return rows.map(toMeta)
}

function loadCrawlReportFromSqlite(id: string): CrawlReport | undefined {
  const row = getDb()
    .prepare('SELECT report_json FROM crawl_reports WHERE id = ?')
    .get(id) as { report_json: string } | undefined
  if (!row) return undefined
  return reportFromJson(row.report_json)
}

function deleteCrawlReportFromSqlite(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM crawl_reports WHERE id = ?')
    .run(id)
  return result.changes > 0
}

function latestCrawlReportFromSqlite(site?: string): CrawlReport | undefined {
  const row = site
    ? (getDb()
        .prepare(
          `SELECT report_json FROM crawl_reports
          WHERE site_url = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        )
        .get(site) as { report_json: string } | undefined)
    : (getDb()
        .prepare(
          `SELECT report_json FROM crawl_reports
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        )
        .get() as { report_json: string } | undefined)
  if (!row) return undefined
  return reportFromJson(row.report_json)
}

export const sqliteCrawlReportStore: CrawlReportStoreAdapter = {
  save: saveCrawlReportToSqlite,
  list: listCrawlReportsFromSqlite,
  load: loadCrawlReportFromSqlite,
  delete: deleteCrawlReportFromSqlite,
  latest: latestCrawlReportFromSqlite,
}

export const crawlReportStore: CrawlReportStoreAdapter = sqliteCrawlReportStore

export function saveCrawlReport(
  report: CrawlReport,
  store: CrawlReportStoreAdapter = crawlReportStore,
): CrawlReportMeta {
  return store.save(report)
}

export function listCrawlReports(
  input: { site?: string; limit?: number } = {},
  store: CrawlReportStoreAdapter = crawlReportStore,
): CrawlReportMeta[] {
  return store.list(input)
}

export function loadCrawlReport(
  id: string,
  store: CrawlReportStoreAdapter = crawlReportStore,
): CrawlReport | undefined {
  return store.load(id)
}

export function deleteCrawlReport(
  id: string,
  store: CrawlReportStoreAdapter = crawlReportStore,
): boolean {
  return store.delete(id)
}

export function latestCrawlReport(
  site?: string,
  store: CrawlReportStoreAdapter = crawlReportStore,
): CrawlReport | undefined {
  return store.latest(site)
}
