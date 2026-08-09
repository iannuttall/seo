import { arch, platform } from 'node:os'
import {
  classifyTelemetryFailure,
  isTelemetryOperation,
  isTelemetryReport,
  SEO_VERSION,
  type TelemetryOperation,
  toSeoError,
} from '@seo/core'

const BUG_REPORT_URL = 'https://github.com/iannuttall/seo/issues/new'
const ACTIONABLE_CATEGORIES = new Set([
  'database',
  'filesystem',
  'internal',
  'unknown',
])

type ErrorFeedbackOptions = {
  args: string[]
  error: unknown
  nodeVersion?: string
  processArch?: string
  processPlatform?: string
  report?: string
  version?: string
}

function nodeMajor(version: string): string {
  return version.replace(/^v/, '').split('.')[0] || 'unknown'
}

export function telemetryOperation(
  args: string[],
): TelemetryOperation | undefined {
  return isTelemetryOperation(args[0]) ? args[0] : undefined
}

function feedbackSubject(
  report: string | undefined,
  operation: TelemetryOperation | undefined,
): string {
  if (isTelemetryReport(report)) return `seo ${report}`
  if (operation) return `seo ${operation}`
  return 'seo command'
}

export function buildErrorFeedbackUrl(
  options: ErrorFeedbackOptions,
): string | undefined {
  const failure = classifyTelemetryFailure(options.error)
  if (!ACTIONABLE_CATEGORIES.has(failure.errorCategory)) return undefined

  const operation = telemetryOperation(options.args)
  const subject = feedbackSubject(options.report, operation)
  const normalized = toSeoError(options.error)
  const diagnostics = [
    normalized.code,
    failure.errorCategory,
    failure.failureReason,
    failure.failureContext,
  ]
    .filter(Boolean)
    .join(' | ')
  const url = new URL(BUG_REPORT_URL)
  url.searchParams.set('template', 'bug.yml')
  url.searchParams.set('title', `bug: ${subject} failed`)
  url.searchParams.set('version', options.version ?? SEO_VERSION)
  url.searchParams.set(
    'runtime',
    `Node ${nodeMajor(options.nodeVersion ?? process.version)} on ${
      options.processPlatform ?? platform()
    } (${options.processArch ?? arch()})`,
  )
  url.searchParams.set('diagnostics', diagnostics)
  return url.toString()
}
