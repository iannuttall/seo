import { createHash } from 'node:crypto'
import type { fetch } from 'undici'
import { fetchPage } from '../fetch/page-fetcher.js'
import { normalizeHttpUrl } from '../gsc/property-url.js'
import { getDb, noteCacheWrite } from '../storage/database.js'
import { performanceActions } from './performance-analysis.js'
import { fetchCruxFieldData } from './performance-crux.js'
import {
  classifyLighthouseFailure,
  runLighthouse,
} from './performance-lighthouse.js'
import type {
  LighthouseFailureCode,
  PerformanceAuditReport,
} from './performance-types.js'

export * from './performance-crux.js'
export * from './performance-types.js'

const CACHE_TTL_MS = 86_400_000

function reportId(input: {
  url: string
  strategy: string
  fieldDataEnabled: boolean
}): string {
  return `perf_${createHash('sha256')
    .update(JSON.stringify({ methodology: 'performance-v2', ...input }))
    .digest('hex')
    .slice(0, 20)}`
}

function cacheGet(id: string, now: number): PerformanceAuditReport | undefined {
  const row = getDb()
    .prepare(
      'SELECT report_json FROM performance_reports WHERE id = ? AND expires_at > ?',
    )
    .get(id, now) as { report_json?: string } | undefined
  if (!row?.report_json) return undefined
  try {
    const report = JSON.parse(row.report_json) as unknown
    return isStoredPerformanceReport(report) &&
      performanceReportIsCacheable({ report })
      ? report
      : undefined
  } catch {
    return undefined
  }
}

function cacheSet(report: PerformanceAuditReport, now: number): void {
  const stored = { ...report, raw: undefined }
  const reportJson = JSON.stringify(stored)
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO performance_reports
      (id, url, strategy, report_json, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      report.id,
      report.url,
      report.strategy,
      reportJson,
      Date.parse(report.generatedAt),
      now + CACHE_TTL_MS,
    )
  noteCacheWrite(Buffer.byteLength(reportJson))
}

async function fallbackReport(input: {
  id: string
  url: string
  strategy: 'mobile' | 'desktop'
  generatedAt: string
  cacheStatus: 'bypass' | 'miss'
  lighthouseFailure: {
    failureCode: LighthouseFailureCode
    reason: string
  }
}): Promise<PerformanceAuditReport> {
  const fetched = await fetchPage(input.url, {
    js: false,
    refresh: true,
  })
  const responseTime = fetched.diagnostics.durationMs
  const report: PerformanceAuditReport = {
    schemaVersion: 1,
    methodology: 'performance-v2',
    dataStatus: 'partial',
    id: input.id,
    url: input.url,
    finalUrl: fetched.finalUrl,
    strategy: input.strategy,
    generatedAt: input.generatedAt,
    cache: { status: input.cacheStatus, ttlHours: 24 },
    source: 'fetch-fallback',
    grade: 'unknown',
    headline:
      'Lighthouse lab data was unavailable; fallback evidence is unscored HTTP transport data.',
    metrics: {
      fallbackFetchDuration: {
        value: responseTime,
        displayValue: `${responseTime}ms`,
        source: 'fetch-fallback',
      },
    },
    labInsights: [],
    labDataStatus: {
      provider: 'lighthouse',
      status: 'unavailable',
      reason: input.lighthouseFailure.reason,
      failureCode: input.lighthouseFailure.failureCode,
    },
    fallbackEvidence: {
      requestedUrl: input.url,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      blocked: fetched.diagnostics.blocked,
      redirectCount: fetched.diagnostics.redirectChain?.length ?? 0,
    },
    fieldDataStatus: {
      provider: 'crux',
      status: 'not_configured',
      reason: 'Field Core Web Vitals were not checked yet.',
      checkedUrl: input.url,
      checkedOrigin: new URL(input.url).origin,
      formFactor: input.strategy === 'desktop' ? 'DESKTOP' : 'PHONE',
    },
    caveats: [
      'Fallback response duration includes the complete local fetch workflow and is not TTFB, Lighthouse, or Core Web Vitals.',
      'Fallback mode does not measure JavaScript execution, LCP, CLS, TBT, or INP and never receives a performance score.',
      ...fetched.warnings,
    ],
    topActions: [],
  }
  return { ...report, topActions: performanceActions(report) }
}

function fieldHeadline(report: PerformanceAuditReport): string {
  const field = report.fieldData
  if (!field) return report.headline
  const scope = `${field.formFactor.toLowerCase()} ${field.scope}-level`
  if (field.assessment.status === 'incomplete') {
    return `CrUX ${scope} field data is incomplete (${field.assessment.availableMetrics}/3 Core Web Vitals); ${report.headline}`
  }
  return `CrUX ${scope} Core Web Vitals are ${field.assessment.status}; ${report.headline}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredPerformanceReport(
  value: unknown,
): value is PerformanceAuditReport {
  if (!isRecord(value)) return false
  const cache = value.cache
  const fieldDataStatus = value.fieldDataStatus
  const labDataStatus = value.labDataStatus
  return (
    value.schemaVersion === 1 &&
    value.methodology === 'performance-v2' &&
    (value.dataStatus === 'complete' || value.dataStatus === 'partial') &&
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    (value.strategy === 'mobile' || value.strategy === 'desktop') &&
    typeof value.generatedAt === 'string' &&
    isRecord(cache) &&
    typeof cache.ttlHours === 'number' &&
    (value.source === 'lighthouse' || value.source === 'fetch-fallback') &&
    typeof value.headline === 'string' &&
    isRecord(value.metrics) &&
    Array.isArray(value.labInsights) &&
    isRecord(labDataStatus) &&
    (labDataStatus.status === 'available' ||
      labDataStatus.status === 'unavailable') &&
    isRecord(fieldDataStatus) &&
    [
      'not_configured',
      'available',
      'unavailable_no_coverage',
      'request_failed',
    ].includes(String(fieldDataStatus.status)) &&
    Array.isArray(value.topActions) &&
    Array.isArray(value.caveats)
  )
}

export function performanceReportIsCacheable(input: {
  report: PerformanceAuditReport
  customCrux?: boolean
  customLighthouse?: boolean
  includeRaw?: boolean
}): boolean {
  const { report } = input
  return (
    !input.includeRaw &&
    !input.customLighthouse &&
    !input.customCrux &&
    report.dataStatus === 'complete' &&
    report.source === 'lighthouse' &&
    report.labDataStatus.status === 'available' &&
    report.fieldDataStatus.status !== 'request_failed' &&
    (report.fieldDataStatus.status !== 'available' ||
      (report.fieldData?.status === 'available' &&
        report.fieldData.assessment.status !== 'incomplete')) &&
    report.raw === undefined
  )
}

export async function performanceAudit(input: {
  url: string
  strategy?: 'mobile' | 'desktop'
  lighthouseBin?: string
  cruxApiKey?: string
  refresh?: boolean
  timeoutMs?: number
  cruxFetch?: typeof fetch
  cruxTimeoutMs?: number
  includeRaw?: boolean
  now?: () => Date
}): Promise<PerformanceAuditReport> {
  const strategy = input.strategy ?? 'mobile'
  const url = normalizeHttpUrl(input.url)
  const cruxApiKey =
    input.cruxApiKey ?? process.env.SEO_CRUX_API_KEY ?? process.env.CRUX_API_KEY
  const id = reportId({
    url,
    strategy,
    fieldDataEnabled: Boolean(cruxApiKey),
  })
  const now = input.now?.() ?? new Date()
  const bypassCache = Boolean(
    input.refresh || input.includeRaw || input.lighthouseBin || input.cruxFetch,
  )
  if (!bypassCache) {
    const cached = cacheGet(id, now.getTime())
    if (cached) {
      return { ...cached, cache: { ...cached.cache, status: 'hit' } }
    }
  }

  const generatedAt = now.toISOString()
  const cacheStatus = bypassCache ? 'bypass' : 'miss'
  let report: PerformanceAuditReport
  try {
    report = await runLighthouse({
      id,
      url,
      strategy,
      lighthouseBin: input.lighthouseBin,
      timeoutMs: input.timeoutMs,
      generatedAt,
      includeRaw: input.includeRaw,
    })
    report.cache.status = cacheStatus
  } catch (error) {
    report = await fallbackReport({
      id,
      url,
      strategy,
      generatedAt,
      cacheStatus,
      lighthouseFailure: classifyLighthouseFailure(error),
    })
  }

  const fieldData = await fetchCruxFieldData({
    url,
    strategy,
    apiKey: cruxApiKey,
    fetchImpl: input.cruxFetch,
    timeoutMs: input.cruxTimeoutMs,
  })
  report = {
    ...report,
    ...(fieldData.fieldData ? { fieldData: fieldData.fieldData } : {}),
    fieldDataStatus: fieldData.status,
    caveats: [...new Set([...report.caveats, fieldData.caveat])],
  }
  report = {
    ...report,
    dataStatus:
      report.labDataStatus.status === 'unavailable' ||
      fieldData.status.status === 'request_failed' ||
      fieldData.fieldData?.assessment.status === 'incomplete'
        ? 'partial'
        : report.dataStatus,
    headline: fieldHeadline(report),
    topActions: performanceActions(report),
  }
  const cacheable = performanceReportIsCacheable({
    report,
    customCrux: Boolean(input.cruxFetch),
    customLighthouse: Boolean(input.lighthouseBin),
    includeRaw: Boolean(input.includeRaw),
  })
  if (cacheable) cacheSet(report, now.getTime())
  return report
}
