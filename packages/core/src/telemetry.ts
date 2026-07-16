import { existsSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { getSeoCliPaths } from './paths.js'
import { readJsonFile, writeJsonAtomic } from './storage/files.js'
import { SEO_VERSION } from './version.js'

export const TELEMETRY_ENDPOINT = 'https://seoskill.dev/api/t'
export const TELEMETRY_SCHEMA_VERSION = 1
export const TELEMETRY_TIMEOUT_MS = 2_000

export const TELEMETRY_EVENTS = [
  'first_run',
  'setup_complete',
  'audit_start',
  'audit_complete',
  'audit_failed',
  'first_audit_complete',
  'active_d1',
  'active_d7',
  'active_d30',
] as const

export const TELEMETRY_AGENTS = [
  'claude-code',
  'cursor',
  'codex',
  'cli',
  'unknown',
] as const

export const TELEMETRY_ERROR_CATEGORIES = [
  'auth',
  'crawl_timeout',
  'network',
  'config',
  'unknown',
] as const

export const TELEMETRY_REPORTS = [
  'affected-urls',
  'agent-readiness',
  'ai-readiness',
  'ai-referrals',
  'ai-search-scorecard',
  'audit-page',
  'audit-urls',
  'cannibalisation',
  'community-intent',
  'compare-crawls',
  'content-optimization',
  'crawl-diff',
  'site-crawl',
  'ctr-underperformers',
  'decaying-pages',
  'setup-check',
  'entity-readiness',
  'explain-crawl-issue',
  'geo-gaps',
  'crawl-report',
  'index-coverage',
  'index-coverage-plan',
  'index-monitor',
  'index-watch',
  'internal-links',
  'link-recovery',
  'crawl-history',
  'crawler-rules',
  'llms-txt-audit',
  'generate-llms-txt',
  'measure-change',
  'monthly-report',
  'okf-build',
  'okf-validate',
  'page-opportunities',
  'performance-audit',
  'pseo-audit',
  'query-clusters',
  'quick-wins',
  'redirect-trace',
  'narrative-report',
  'second-page',
  'segment-impact',
  'striking-distance',
  'seo-to-ai-query',
  'top-fixes',
  'traffic-anomaly',
  'update-correlation',
  'search-performance-overview',
  'monthly-action-plan',
  'refresh-priorities',
  'technical-watch',
  'update-postmortem',
] as const

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number]
export type TelemetryAgent = (typeof TELEMETRY_AGENTS)[number]
export type TelemetryErrorCategory = (typeof TELEMETRY_ERROR_CATEGORIES)[number]
export type TelemetryReport = (typeof TELEMETRY_REPORTS)[number]

export type TelemetryState = {
  telemetryEnabled: boolean
  firstRunAt: string
  cohort: string
  sentMilestones: TelemetryMilestone[]
}

export type TelemetryPayload = {
  event: TelemetryEvent
  version: string
  agent: TelemetryAgent
  os: string
  arch: string
  node: string
  cohort: string
  schema: 1
  errorCategory?: TelemetryErrorCategory
  report?: TelemetryReport
}

type TelemetryMilestone =
  | 'first_run'
  | 'setup_complete'
  | 'first_audit_complete'
  | 'active_d1'
  | 'active_d7'
  | 'active_d30'

type TelemetryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type TelemetryOptions = {
  agent?: TelemetryAgent
  clientName?: string
  endpoint?: string
  env?: NodeJS.ProcessEnv
  fetch?: TelemetryFetch
  nodeVersion?: string
  now?: Date
  notice?: (message: string) => void
  processArch?: string
  processPlatform?: string
  stateFile?: string
  version?: string
}

export type TelemetryDisableReason =
  | 'ci'
  | 'do_not_track'
  | 'environment'
  | 'local_setting'
  | 'invalid_state'

export type TelemetryStatus = {
  enabled: boolean
  reason?: TelemetryDisableReason
  stateFile: string
  state?: TelemetryState
}

const RETENTION_MILESTONES = [
  { days: 1, event: 'active_d1' },
  { days: 7, event: 'active_d7' },
  { days: 30, event: 'active_d30' },
] as const

const CI_ENVIRONMENT_KEYS = [
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'JENKINS_URL',
  'TEAMCITY_VERSION',
  'TF_BUILD',
  'BITBUCKET_BUILD_NUMBER',
  'CODEBUILD_BUILD_ID',
] as const

export const TELEMETRY_NOTICE = `SEO Skill collects anonymous usage data to improve the tool (event name,
report id, version, agent, OS, architecture, Node major, and install week;
never URLs, report data, or identifiers of any kind).
Docs: https://seoskill.dev/telemetry
Disable: seo telemetry disable (or set DO_NOT_TRACK=1)\n`

function optionEnv(options: TelemetryOptions): NodeJS.ProcessEnv {
  return options.env ?? process.env
}

function optionNow(options: TelemetryOptions): Date {
  return options.now ?? new Date()
}

function optionStateFile(options: TelemetryOptions): string {
  return options.stateFile ?? getSeoCliPaths().telemetryStateFile
}

function isEnvEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

export function isTelemetryCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'test' ||
    Boolean(env.NODE_TEST_CONTEXT) ||
    isEnvEnabled(env.CI) ||
    CI_ENVIRONMENT_KEYS.some((key) => Boolean(env[key]))
  )
}

function environmentDisableReason(
  env: NodeJS.ProcessEnv,
): TelemetryDisableReason | undefined {
  if (isTelemetryCi(env)) return 'ci'
  if (isEnvEnabled(env.DO_NOT_TRACK)) return 'do_not_track'
  if (
    isEnvEnabled(env.SEOSKILL_TELEMETRY_DISABLED) ||
    isEnvEnabled(env.SEO_TELEMETRY_DISABLED)
  ) {
    return 'environment'
  }
  return undefined
}

function isTelemetryMilestone(value: unknown): value is TelemetryMilestone {
  return (
    typeof value === 'string' &&
    [
      'first_run',
      'setup_complete',
      'first_audit_complete',
      'active_d1',
      'active_d7',
      'active_d30',
    ].includes(value)
  )
}

export function isTelemetryReport(value: unknown): value is TelemetryReport {
  return (
    typeof value === 'string' &&
    TELEMETRY_REPORTS.includes(value as TelemetryReport)
  )
}

function isValidCohort(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value)
  )
}

function isTelemetryState(value: unknown): value is TelemetryState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Partial<TelemetryState>
  return (
    typeof state.telemetryEnabled === 'boolean' &&
    typeof state.firstRunAt === 'string' &&
    Number.isFinite(Date.parse(state.firstRunAt)) &&
    isValidCohort(state.cohort) &&
    Array.isArray(state.sentMilestones) &&
    state.sentMilestones.every(isTelemetryMilestone)
  )
}

function readState(
  path: string,
):
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'valid'; state: TelemetryState } {
  if (!existsSync(path)) return { kind: 'missing' }
  const value = readJsonFile<unknown>(path)
  return isTelemetryState(value)
    ? { kind: 'valid', state: value }
    : { kind: 'invalid' }
}

function writeState(path: string, state: TelemetryState): void {
  writeJsonAtomic(path, state, 0o600)
}

export function isoWeek(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function newState(options: TelemetryOptions, enabled = true): TelemetryState {
  const now = optionNow(options)
  return {
    telemetryEnabled: enabled,
    firstRunAt: now.toISOString(),
    cohort: isoWeek(now),
    sentMilestones: [],
  }
}

export function detectTelemetryAgent(
  input: { clientName?: string; env?: NodeJS.ProcessEnv } = {},
): TelemetryAgent {
  const env = input.env ?? process.env
  const clientName = input.clientName?.toLowerCase() ?? ''
  if (clientName.includes('claude')) return 'claude-code'
  if (clientName.includes('cursor')) return 'cursor'
  if (clientName.includes('codex')) return 'codex'
  if (input.clientName) return 'unknown'
  if (env.CLAUDECODE || env.CLAUDE_CODE) return 'claude-code'
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_SESSION_ID) {
    return 'cursor'
  }
  if (env.CODEX_HOME || env.CODEX_THREAD_ID || env.CODEX_SANDBOX) return 'codex'
  return 'cli'
}

function telemetryAgent(options: TelemetryOptions): TelemetryAgent {
  return (
    options.agent ??
    detectTelemetryAgent({
      clientName: options.clientName,
      env: optionEnv(options),
    })
  )
}

function nodeMajor(version: string): string {
  return version.replace(/^v/, '').split('.')[0] || 'unknown'
}

export function buildTelemetryPayload(
  event: TelemetryEvent,
  state: TelemetryState,
  fields: {
    errorCategory?: TelemetryErrorCategory
    report?: TelemetryReport
  } = {},
  options: TelemetryOptions = {},
): TelemetryPayload {
  return {
    event,
    version: options.version ?? SEO_VERSION,
    agent: telemetryAgent(options),
    os: options.processPlatform ?? platform(),
    arch: options.processArch ?? arch(),
    node: nodeMajor(options.nodeVersion ?? process.version),
    cohort: state.cohort,
    schema: TELEMETRY_SCHEMA_VERSION,
    ...(fields.errorCategory ? { errorCategory: fields.errorCategory } : {}),
    ...(fields.report ? { report: fields.report } : {}),
  }
}

function dispatchTelemetry(
  payload: TelemetryPayload,
  options: TelemetryOptions,
): void {
  const fetchTelemetry = options.fetch ?? globalThis.fetch
  try {
    void fetchTelemetry(options.endpoint ?? TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    }).catch(() => undefined)
  } catch {
    // Telemetry must never affect the command that triggered it.
  }
}

function statusFromState(options: TelemetryOptions): TelemetryStatus {
  const stateFile = optionStateFile(options)
  const envReason = environmentDisableReason(optionEnv(options))
  const stored = readState(stateFile)
  if (envReason) {
    return {
      enabled: false,
      reason: envReason,
      stateFile,
      ...(stored.kind === 'valid' ? { state: stored.state } : {}),
    }
  }
  if (stored.kind === 'invalid') {
    return { enabled: false, reason: 'invalid_state', stateFile }
  }
  if (stored.kind === 'valid' && !stored.state.telemetryEnabled) {
    return {
      enabled: false,
      reason: 'local_setting',
      stateFile,
      state: stored.state,
    }
  }
  return {
    enabled: true,
    stateFile,
    ...(stored.kind === 'valid' ? { state: stored.state } : {}),
  }
}

export function getTelemetryStatus(
  options: TelemetryOptions = {},
): TelemetryStatus {
  return statusFromState(options)
}

export function setTelemetryEnabled(
  enabled: boolean,
  options: TelemetryOptions = {},
): TelemetryStatus {
  const stateFile = optionStateFile(options)
  const stored = readState(stateFile)
  const state =
    stored.kind === 'valid' ? stored.state : newState(options, enabled)
  state.telemetryEnabled = enabled
  writeState(stateFile, state)
  return statusFromState(options)
}

function enabledState(options: TelemetryOptions): TelemetryState | undefined {
  const status = statusFromState(options)
  return status.enabled ? status.state : undefined
}

export function initializeTelemetry(
  options: TelemetryOptions = {},
): TelemetryStatus {
  const initialStatus = statusFromState(options)
  if (!initialStatus.enabled) return initialStatus

  const stateFile = initialStatus.stateFile
  const state = initialStatus.state ?? newState(options)
  const events: TelemetryEvent[] = []

  if (!state.sentMilestones.includes('first_run')) {
    try {
      ;(options.notice ?? ((message) => process.stderr.write(message)))(
        TELEMETRY_NOTICE,
      )
    } catch {
      return { enabled: false, reason: 'invalid_state', stateFile }
    }
    state.sentMilestones.push('first_run')
    events.push('first_run')
  }

  const daysSinceFirstRun =
    (optionNow(options).getTime() - Date.parse(state.firstRunAt)) / 86_400_000
  for (const milestone of RETENTION_MILESTONES) {
    if (
      daysSinceFirstRun >= milestone.days &&
      !state.sentMilestones.includes(milestone.event)
    ) {
      state.sentMilestones.push(milestone.event)
      events.push(milestone.event)
    }
  }

  try {
    writeState(stateFile, state)
  } catch {
    return { enabled: false, reason: 'invalid_state', stateFile }
  }

  for (const event of events) {
    dispatchTelemetry(buildTelemetryPayload(event, state, {}, options), options)
  }
  return { enabled: true, stateFile, state }
}

function sendEvent(
  event: TelemetryEvent,
  fields: { errorCategory?: TelemetryErrorCategory; report?: TelemetryReport },
  options: TelemetryOptions,
): void {
  const state = enabledState(options)
  if (!state) return
  dispatchTelemetry(
    buildTelemetryPayload(event, state, fields, options),
    options,
  )
}

export function trackTelemetryReportStart(
  report: string,
  options: TelemetryOptions = {},
): void {
  if (!isTelemetryReport(report)) return
  sendEvent('audit_start', { report }, options)
}

export function trackTelemetryReportComplete(
  report: string,
  options: TelemetryOptions = {},
): void {
  if (!isTelemetryReport(report)) return
  const state = enabledState(options)
  if (!state) return
  dispatchTelemetry(
    buildTelemetryPayload('audit_complete', state, { report }, options),
    options,
  )
  if (state.sentMilestones.includes('first_audit_complete')) return
  state.sentMilestones.push('first_audit_complete')
  try {
    writeState(optionStateFile(options), state)
  } catch {
    return
  }
  dispatchTelemetry(
    buildTelemetryPayload('first_audit_complete', state, { report }, options),
    options,
  )
}

export function trackTelemetryReportFailed(
  report: string,
  errorCategory: TelemetryErrorCategory,
  options: TelemetryOptions = {},
): void {
  if (!isTelemetryReport(report)) return
  sendEvent('audit_failed', { errorCategory, report }, options)
}

export function trackTelemetrySetupComplete(
  options: TelemetryOptions = {},
): void {
  const state = enabledState(options)
  if (!state || state.sentMilestones.includes('setup_complete')) return
  state.sentMilestones.push('setup_complete')
  try {
    writeState(optionStateFile(options), state)
  } catch {
    return
  }
  dispatchTelemetry(
    buildTelemetryPayload('setup_complete', state, {}, options),
    options,
  )
}

export function telemetryErrorCategory(error: unknown): TelemetryErrorCategory {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'crawl_timeout'
  }
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : undefined
  if (
    code === 'ACCESS_DENIED' ||
    code === 'AUTH_CONFIG_REQUIRED' ||
    code === 'AUTH_EXPIRED' ||
    code === 'AUTH_REQUIRED'
  ) {
    return 'auth'
  }
  if (code === 'INVALID_INPUT' || code === 'PROPERTY_NOT_FOUND') return 'config'
  if (
    code === 'OPTIONAL_PROVIDER_UNAVAILABLE' ||
    code === 'PROVIDER_UNAVAILABLE' ||
    code === 'RATE_LIMITED'
  ) {
    return 'network'
  }
  return 'unknown'
}
