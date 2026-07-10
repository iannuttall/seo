import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { labMetric, ratingAt } from './performance-analysis.js'
import type {
  LighthouseFailureCode,
  PerformanceAuditReport,
} from './performance-types.js'

const execFileAsync = promisify(execFile)

type LighthouseAudit = {
  title?: string
  numericValue?: number
  displayValue?: string
  score?: number | null
  details?: {
    overallSavingsMs?: number
    items?: unknown[]
    debugData?: Record<string, unknown>
  }
}

type LighthouseResult = {
  lighthouseVersion?: string
  requestedUrl?: string
  finalUrl?: string
  fetchTime?: string
  runWarnings?: unknown[]
  categories?: { performance?: { score?: number | null } }
  audits?: Record<string, LighthouseAudit>
}

const INSIGHT_BYTE_BUDGET = 24_000

function compactRecord(
  value: unknown,
): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string | number | boolean] => {
        const item = entry[1]
        return (
          typeof item === 'number' ||
          typeof item === 'boolean' ||
          (typeof item === 'string' && item.length <= 160)
        )
      })
      .slice(0, 4),
  )
}

function labInsights(
  audits: Record<string, LighthouseAudit>,
): PerformanceAuditReport['labInsights'] {
  const candidates = Object.entries(audits)
    .filter(([id, audit]) => {
      const insight = id.endsWith('-insight')
      const opportunity = (audit.details?.overallSavingsMs ?? 0) > 0
      return (insight || opportunity) && audit.score !== 1
    })
    .map(([id, audit]) => {
      const evidence = [
        compactRecord(audit.details?.debugData),
        ...(audit.details?.items ?? []).slice(0, 2).map(compactRecord),
      ].filter((item) => Object.keys(item).length > 0)
      return {
        id,
        title: audit.title ?? id,
        displayValue: audit.displayValue,
        score: audit.score,
        estimatedSavingsMs: audit.details?.overallSavingsMs,
        evidence,
      }
    })
    .sort(
      (a, b) =>
        (b.estimatedSavingsMs ?? 0) - (a.estimatedSavingsMs ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8)
  const selected: PerformanceAuditReport['labInsights'] = []
  for (const candidate of candidates) {
    if (
      Buffer.byteLength(JSON.stringify([...selected, candidate]), 'utf8') >
      INSIGHT_BYTE_BUDGET
    ) {
      break
    }
    selected.push(candidate)
  }
  return selected
}

function responseAudit(
  audits: Record<string, LighthouseAudit>,
): LighthouseAudit | undefined {
  const legacy = audits['server-response-time']
  if (legacy?.numericValue !== undefined) return legacy
  const insight = audits['document-latency-insight']
  const responseTime = insight?.details?.debugData?.serverResponseTime
  return typeof responseTime === 'number'
    ? {
        numericValue: responseTime,
        displayValue: `${Math.round(responseTime)} ms`,
        score: insight?.score,
      }
    : undefined
}

function defaultLighthouseCommand(): { bin: string; prefixArgs: string[] } {
  const cli = fileURLToPath(import.meta.resolve('lighthouse/cli/index.js'))
  return { bin: process.execPath, prefixArgs: [cli] }
}

class LighthouseRunError extends Error {
  constructor(readonly failureCode: LighthouseFailureCode) {
    super(failureCode)
  }
}

function classifyExternalFailure(error: unknown): LighthouseFailureCode {
  const value = error as {
    code?: string
    killed?: boolean
    message?: string
    signal?: string
  }
  const message = value?.message?.toLowerCase() ?? ''
  if (value?.code === 'ENOENT' || message.includes('cannot find package')) {
    return 'binary_missing'
  }
  if (
    value?.code === 'ETIMEDOUT' ||
    value?.killed ||
    value?.signal === 'SIGTERM' ||
    message.includes('timed out')
  ) {
    return 'timeout'
  }
  if (
    message.includes('chrome') &&
    (message.includes('not found') ||
      message.includes('no usable') ||
      message.includes('install'))
  ) {
    return 'chrome_missing'
  }
  if (error instanceof SyntaxError) return 'invalid_result'
  return 'run_failed'
}

export function classifyLighthouseFailure(error: unknown): {
  failureCode: LighthouseFailureCode
  reason: string
} {
  const failureCode =
    error instanceof LighthouseRunError
      ? error.failureCode
      : classifyExternalFailure(error)
  const reasons: Record<LighthouseFailureCode, string> = {
    binary_missing:
      'The Lighthouse runtime could not be found. Reinstall seo or remove the custom binary override.',
    chrome_missing:
      'Lighthouse could not find a compatible local Chrome browser.',
    invalid_result:
      'Lighthouse completed without a usable navigation performance result.',
    run_failed: 'Lighthouse could not complete the navigation lab run.',
    timeout: 'Lighthouse exceeded the bounded lab-run timeout.',
  }
  return { failureCode, reason: reasons[failureCode] }
}

export async function runLighthouse(input: {
  url: string
  strategy: 'mobile' | 'desktop'
  lighthouseBin?: string
  timeoutMs?: number
  generatedAt: string
  id: string
  includeRaw?: boolean
}): Promise<PerformanceAuditReport> {
  const command = input.lighthouseBin
    ? { bin: input.lighthouseBin, prefixArgs: [] }
    : defaultLighthouseCommand()
  const { stdout } = await execFileAsync(
    command.bin,
    [
      ...command.prefixArgs,
      input.url,
      '--quiet',
      '--output=json',
      '--output-path=stdout',
      '--only-categories=performance',
      `--preset=${input.strategy === 'desktop' ? 'desktop' : 'perf'}`,
      '--chrome-flags=--headless=new',
    ],
    {
      timeout: input.timeoutMs ?? 120_000,
      maxBuffer: 30 * 1024 * 1024,
    },
  )
  const jsonStart = stdout.indexOf('{')
  if (jsonStart < 0) throw new LighthouseRunError('invalid_result')
  const parsed = JSON.parse(stdout.slice(jsonStart)) as LighthouseResult
  const audits = parsed.audits ?? {}
  const categoryScore = parsed.categories?.performance?.score
  const score =
    typeof categoryScore === 'number'
      ? Math.round(categoryScore * 100)
      : undefined
  const hasEssentialMetric = [
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'cumulative-layout-shift',
  ].some((id) => typeof audits[id]?.numericValue === 'number')
  if (!hasEssentialMetric) {
    throw new LighthouseRunError('invalid_result')
  }
  const report: PerformanceAuditReport = {
    schemaVersion: 1,
    methodology: 'performance-v2',
    dataStatus: 'complete',
    id: input.id,
    url: input.url,
    finalUrl: parsed.finalUrl,
    strategy: input.strategy,
    generatedAt: input.generatedAt,
    cache: { status: 'miss', ttlHours: 24 },
    source: 'lighthouse',
    score,
    grade:
      score === undefined
        ? 'unknown'
        : score >= 90
          ? 'good'
          : score >= 50
            ? 'needs-work'
            : 'poor',
    headline:
      score === undefined
        ? 'Lighthouse ran, but no lab performance score was returned.'
        : `Lighthouse lab performance score is ${score}/100.`,
    metrics: {
      firstContentfulPaint: labMetric({
        audit: audits['first-contentful-paint'],
        rating: (value) => ratingAt(value, 1_800, 3_000),
      }),
      largestContentfulPaint: labMetric({
        audit: audits['largest-contentful-paint'],
        rating: (value) => ratingAt(value, 2_500, 4_000),
      }),
      totalBlockingTime: labMetric({
        audit: audits['total-blocking-time'],
        rating: (value) => ratingAt(value, 200, 600),
      }),
      cumulativeLayoutShift: labMetric({
        audit: audits['cumulative-layout-shift'],
        rating: (value) => ratingAt(value, 0.1, 0.25),
      }),
      interactionToNextPaint: labMetric({
        audit: audits['interaction-to-next-paint'],
        rating: (value) => ratingAt(value, 200, 500),
      }),
      speedIndex: labMetric({ audit: audits['speed-index'] }),
      serverResponseTime: labMetric({
        audit: responseAudit(audits),
        rating: (value) => ratingAt(value, 600, 600),
      }),
    },
    labInsights: labInsights(audits),
    labDataStatus: {
      provider: 'lighthouse',
      status: 'available',
      reason: `Lighthouse ${parsed.lighthouseVersion ?? 'unknown version'} completed a ${input.strategy} navigation lab run.`,
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
      'Lighthouse is one controlled lab run; its score and timings can vary between runs and are not field Core Web Vitals.',
      'Navigation Lighthouse uses Total Blocking Time as a lab responsiveness diagnostic; field INP comes from CrUX when available.',
    ],
    topActions: [],
    ...(input.includeRaw ? { raw: parsed } : {}),
  }
  if (parsed.runWarnings?.length) {
    report.caveats.push(
      `Lighthouse returned ${parsed.runWarnings.length} run warning${parsed.runWarnings.length === 1 ? '' : 's'}; inspect the compact lab insights or rerun before relying on the score.`,
    )
    report.dataStatus = 'partial'
  }
  if (score === undefined) {
    report.dataStatus = 'partial'
    report.caveats.push(
      'Lighthouse returned usable lab metrics without a numeric performance category score.',
    )
  }
  return report
}
