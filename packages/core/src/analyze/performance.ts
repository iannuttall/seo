import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { fetch } from 'undici'
import { fetchPage } from '../fetch/page-fetcher.js'
import { getDb } from '../storage/database.js'

const execFileAsync = promisify(execFile)

export type PerformanceMetric = {
  value?: number
  displayValue?: string
  score?: number
}

export type PerformanceAuditReport = {
  id: string
  url: string
  strategy: 'mobile' | 'desktop'
  generatedAt: string
  source: 'lighthouse' | 'fetch-fallback'
  score?: number
  grade: 'good' | 'needs-work' | 'poor' | 'unknown'
  headline: string
  metrics: {
    firstContentfulPaint?: PerformanceMetric
    largestContentfulPaint?: PerformanceMetric
    totalBlockingTime?: PerformanceMetric
    cumulativeLayoutShift?: PerformanceMetric
    speedIndex?: PerformanceMetric
    responseTime?: PerformanceMetric
  }
  fieldData?: {
    source: 'crux'
    url?: string
    origin?: string
    metrics: Record<string, unknown>
  }
  topActions: Array<{
    title: string
    plainEnglish: string
    action: string
    evidence?: Record<string, unknown>
  }>
  caveats: string[]
  raw?: unknown
}

function reportId(input: { url: string; strategy: string }): string {
  return `perf_${createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 20)}`
}

function grade(score?: number): PerformanceAuditReport['grade'] {
  if (score === undefined) return 'unknown'
  if (score >= 90) return 'good'
  if (score >= 50) return 'needs-work'
  return 'poor'
}

function metric(audit?: {
  numericValue?: number
  displayValue?: string
  score?: number
}): PerformanceMetric | undefined {
  if (!audit) return undefined
  return {
    value:
      typeof audit.numericValue === 'number'
        ? Math.round(audit.numericValue * 1000) / 1000
        : undefined,
    displayValue: audit.displayValue,
    score: audit.score,
  }
}

function cacheGet(id: string): PerformanceAuditReport | undefined {
  const row = getDb()
    .prepare(
      'SELECT report_json FROM performance_reports WHERE id = ? AND expires_at > ?',
    )
    .get(id, Date.now()) as { report_json?: string } | undefined
  return row?.report_json
    ? (JSON.parse(row.report_json) as PerformanceAuditReport)
    : undefined
}

function cacheSet(report: PerformanceAuditReport): void {
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
      JSON.stringify(report),
      Date.parse(report.generatedAt),
      Date.now() + 86_400_000,
    )
}

function actions(
  report: PerformanceAuditReport,
): PerformanceAuditReport['topActions'] {
  const actions: PerformanceAuditReport['topActions'] = []
  const lcp = report.metrics.largestContentfulPaint
  const tbt = report.metrics.totalBlockingTime
  const cls = report.metrics.cumulativeLayoutShift
  const response = report.metrics.responseTime
  if ((lcp?.value ?? 0) > 2500) {
    actions.push({
      title: 'Improve the largest visible content',
      plainEnglish: `Largest Contentful Paint is ${lcp?.displayValue ?? `${lcp?.value}ms`}.`,
      action:
        'Optimize the hero image/text, remove render-blocking work, and make above-the-fold HTML fast and cacheable.',
      evidence: { largestContentfulPaint: lcp },
    })
  }
  if ((tbt?.value ?? 0) > 200) {
    actions.push({
      title: 'Reduce main-thread blocking',
      plainEnglish: `Total Blocking Time is ${tbt?.displayValue ?? `${tbt?.value}ms`}.`,
      action:
        'Defer non-critical JavaScript, split heavy bundles, and avoid hydration work that blocks initial interaction.',
      evidence: { totalBlockingTime: tbt },
    })
  }
  if ((cls?.value ?? 0) > 0.1) {
    actions.push({
      title: 'Reduce layout shifts',
      plainEnglish: `Cumulative Layout Shift is ${cls?.displayValue ?? cls?.value}.`,
      action:
        'Reserve dimensions for images, ads, embeds, banners, and late-loading UI before they render.',
      evidence: { cumulativeLayoutShift: cls },
    })
  }
  if ((response?.value ?? 0) > 800) {
    actions.push({
      title: 'Speed up the HTML response',
      plainEnglish: `The HTML response took ${response?.displayValue ?? `${response?.value}ms`}.`,
      action:
        'Check server work, database queries, CDN caching, and edge cache rules for public pages.',
      evidence: { responseTime: response },
    })
  }
  if (!actions.length) {
    actions.push({
      title: 'Keep monitoring performance',
      plainEnglish:
        'No obvious performance blocker was found in this local run.',
      action:
        'Re-run after deploys and check field data for high-traffic URLs before calling performance done.',
    })
  }
  return actions
}

async function lighthouseReport(input: {
  url: string
  strategy: 'mobile' | 'desktop'
  lighthouseBin?: string
  timeoutMs?: number
}): Promise<PerformanceAuditReport> {
  const bin =
    input.lighthouseBin ?? process.env.SEO_LIGHTHOUSE_BIN ?? 'lighthouse'
  const { stdout } = await execFileAsync(
    bin,
    [
      input.url,
      '--quiet',
      '--output=json',
      '--output-path=stdout',
      `--preset=${input.strategy === 'desktop' ? 'desktop' : 'perf'}`,
      '--chrome-flags=--headless=new',
    ],
    {
      timeout: input.timeoutMs ?? 120_000,
      maxBuffer: 30 * 1024 * 1024,
    },
  )
  const jsonStart = stdout.indexOf('{')
  const parsed = JSON.parse(stdout.slice(jsonStart)) as {
    categories?: { performance?: { score?: number } }
    audits?: Record<
      string,
      { numericValue?: number; displayValue?: string; score?: number }
    >
  }
  const score =
    parsed.categories?.performance?.score === undefined
      ? undefined
      : Math.round(parsed.categories.performance.score * 100)
  const report: PerformanceAuditReport = {
    id: reportId({ url: input.url, strategy: input.strategy }),
    url: input.url,
    strategy: input.strategy,
    generatedAt: new Date().toISOString(),
    source: 'lighthouse',
    score,
    grade: grade(score),
    headline:
      score === undefined
        ? 'Lighthouse ran, but no performance score was returned.'
        : `Lighthouse performance score is ${score}/100.`,
    metrics: {
      firstContentfulPaint: metric(parsed.audits?.['first-contentful-paint']),
      largestContentfulPaint: metric(
        parsed.audits?.['largest-contentful-paint'],
      ),
      totalBlockingTime: metric(parsed.audits?.['total-blocking-time']),
      cumulativeLayoutShift: metric(parsed.audits?.['cumulative-layout-shift']),
      speedIndex: metric(parsed.audits?.['speed-index']),
      responseTime: metric(parsed.audits?.['server-response-time']),
    },
    caveats: [],
    raw: parsed,
    topActions: [],
  }
  return { ...report, topActions: actions(report) }
}

async function fallbackReport(input: {
  url: string
  strategy: 'mobile' | 'desktop'
  refresh?: boolean
  warning: string
}): Promise<PerformanceAuditReport> {
  const fetched = await fetchPage(input.url, {
    js: false,
    refresh: input.refresh ?? false,
  })
  const responseTime = fetched.diagnostics.durationMs
  const score =
    responseTime <= 300
      ? 90
      : responseTime <= 800
        ? 70
        : responseTime <= 1500
          ? 45
          : 25
  const report: PerformanceAuditReport = {
    id: reportId({ url: input.url, strategy: input.strategy }),
    url: input.url,
    strategy: input.strategy,
    generatedAt: new Date().toISOString(),
    source: 'fetch-fallback',
    score,
    grade: grade(score),
    headline:
      'Lighthouse was not available, so this report used a lightweight HTML fetch fallback.',
    metrics: {
      responseTime: {
        value: responseTime,
        displayValue: `${responseTime}ms`,
        score: score / 100,
      },
    },
    caveats: [
      input.warning,
      'Fallback mode does not measure JavaScript execution, LCP, CLS, TBT, or field Core Web Vitals.',
    ],
    topActions: [],
  }
  return { ...report, topActions: actions(report) }
}

async function cruxFieldData(input: {
  url: string
  apiKey?: string
}): Promise<PerformanceAuditReport['fieldData'] | undefined> {
  if (!input.apiKey) return undefined
  const response = await fetch(
    `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: 'POST',
      body: JSON.stringify({ url: input.url }),
      headers: { 'content-type': 'application/json' },
    },
  )
  if (!response.ok) return undefined
  const json = (await response.json()) as {
    record?: {
      key?: { url?: string; origin?: string }
      metrics?: Record<string, unknown>
    }
  }
  return json.record
    ? {
        source: 'crux',
        url: json.record.key?.url,
        origin: json.record.key?.origin,
        metrics: json.record.metrics ?? {},
      }
    : undefined
}

export async function performanceAudit(input: {
  url: string
  strategy?: 'mobile' | 'desktop'
  lighthouseBin?: string
  cruxApiKey?: string
  refresh?: boolean
  timeoutMs?: number
}): Promise<PerformanceAuditReport> {
  const strategy = input.strategy ?? 'mobile'
  const url = new URL(input.url).toString()
  const id = reportId({ url, strategy })
  if (!input.refresh) {
    const cached = cacheGet(id)
    if (cached) return cached
  }

  let report: PerformanceAuditReport
  try {
    report = await lighthouseReport({
      url,
      strategy,
      lighthouseBin: input.lighthouseBin,
      timeoutMs: input.timeoutMs,
    })
  } catch (error) {
    report = await fallbackReport({
      url,
      strategy,
      refresh: input.refresh,
      warning: `Lighthouse unavailable: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  const fieldData = await cruxFieldData({ url, apiKey: input.cruxApiKey })
  report = {
    ...report,
    ...(fieldData ? { fieldData } : {}),
    caveats: [
      ...report.caveats,
      fieldData
        ? 'CrUX field data was attached from the Chrome UX Report API.'
        : 'No CrUX field data was attached. Pass a CrUX API key when field Core Web Vitals are needed.',
    ],
  }
  cacheSet(report)
  return report
}
