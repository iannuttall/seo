import { Hono } from 'hono'
import { reportIds } from '../src/content/reports/manifest.mjs'
import { applyDailyToolQuota } from './tools/daily-tool-quota.ts'
import { handleFaviconCheck } from './tools/favicon-checker.ts'
import { handleLlmsTxtFetch } from './tools/llms-txt.ts'
import {
  handleDomainRating,
  handleSpamScore,
  handleWebsiteTraffic,
} from './tools/paid-tool-routes.ts'
import { handleRobotsTxtFetch } from './tools/robots-txt.ts'
import { handleSitemapImport } from './tools/sitemap.ts'
import { handleSitemapExtraction } from './tools/sitemap-extractor.ts'
import { handleSitemapValidation } from './tools/sitemap-validator.ts'
import { applyToolRateLimit } from './tools/tool-rate-limit.ts'

export { PaidToolGuard } from './tools/paid-tool-guard.ts'

export const TELEMETRY_EVENTS = [
  'first_run',
  'setup_complete',
  'audit_start',
  'audit_complete',
  'audit_failed',
  'command_failed',
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
  'data',
  'database',
  'filesystem',
  'internal',
  'unknown',
] as const

const TELEMETRY_V1_ERROR_CATEGORIES = [
  'auth',
  'crawl_timeout',
  'network',
  'config',
  'unknown',
] as const

export const TELEMETRY_FAILURE_REASONS = [
  'access_denied',
  'auth_config_required',
  'auth_expired',
  'auth_required',
  'crawl_timeout',
  'database_constraint',
  'database_corrupt',
  'database_locked',
  'database_read_only',
  'database_unique_constraint',
  'filesystem_full',
  'filesystem_not_found',
  'filesystem_permission',
  'insufficient_data',
  'internal_error',
  'invalid_input',
  'network_connection',
  'network_dns',
  'network_timeout',
  'network_tls',
  'optional_provider_unavailable',
  'property_not_found',
  'provider_unavailable',
  'rate_limited',
  'unknown',
] as const

export const TELEMETRY_FAILURE_CONTEXTS = ['crawl_pages_run_id_url'] as const

export const TELEMETRY_OPERATIONS = [
  'analytics',
  'auth',
  'cache',
  'change-log',
  'client',
  'content',
  'content-groups',
  'crawl-reports',
  'diagnose',
  'export',
  'gsc-query',
  'indexnow',
  'init',
  'llms',
  'logs',
  'mcp',
  'monitoring',
  'okf',
  'perf',
  'privacy',
  'project',
  'projects',
  'providers',
  'pseo',
  'reports',
  'reset',
  'schedule',
  'server-logs',
  'setup',
  'skill',
  'sites',
  'start',
  'telemetry',
  'tests',
  'updates',
  'url-inspect',
] as const

const PLATFORMS = [
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
] as const

const ARCHITECTURES = [
  'arm',
  'arm64',
  'ia32',
  'loong64',
  'mips',
  'mipsel',
  'ppc',
  'ppc64',
  'riscv64',
  's390',
  's390x',
  'x64',
] as const

type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number]
type TelemetryAgent = (typeof TELEMETRY_AGENTS)[number]
type TelemetryErrorCategory = (typeof TELEMETRY_ERROR_CATEGORIES)[number]
type TelemetryFailureReason = (typeof TELEMETRY_FAILURE_REASONS)[number]
type TelemetryFailureContext = (typeof TELEMETRY_FAILURE_CONTEXTS)[number]
type TelemetryOperation = (typeof TELEMETRY_OPERATIONS)[number]

export type TelemetryPayload = {
  event: TelemetryEvent
  version: string
  agent: TelemetryAgent
  os: string
  arch: string
  node: string
  cohort: string
  schema: 1 | 2
  errorCategory?: TelemetryErrorCategory
  failureReason?: TelemetryFailureReason
  failureContext?: TelemetryFailureContext
  operation?: TelemetryOperation
  report?: string
}

type StatsRow = Record<string, unknown>

type TelemetryWriteStatement = {
  bind(...values: unknown[]): TelemetryWriteStatement
  run(): Promise<unknown>
}

type TelemetryWriteDatabase = {
  prepare(query: string): TelemetryWriteStatement
}

export type Stats = {
  schema: 1
  generatedAt: string
  window: {
    kind: 'all_time'
    firstMonth: string | null
    currentMonth: string
  }
  totals: {
    installs: number
    setupCompletions: number
    firstAuditCompletions: number
    auditsStarted: number
    auditsCompleted: number
    auditsFailed: number
    commandsFailed: number
    auditsThisMonth: number
    firstAuditConversionPercent: number | null
  }
  agents: {
    installs: Array<{ agent: string; count: number; percent: number }>
    audits: Array<{ agent: string; count: number; percent: number }>
  }
  retentionD7: Array<{
    cohort: string
    installs: number
    retained: number
    percent: number | null
    complete: boolean
  }>
  reports: Array<{ report: string; count: number }>
  failures: {
    categories: Array<{ category: string; count: number }>
    details: Array<{
      event: 'audit_failed' | 'command_failed'
      report: string | null
      operation: string | null
      category: string
      reason: string
      context: string | null
      version: string
      count: number
    }>
  }
}

const REPORT_IDS = new Set<string>(reportIds)
const BASE_FIELDS = [
  'event',
  'version',
  'agent',
  'os',
  'arch',
  'node',
  'cohort',
  'schema',
] as const
const AUDIT_EVENTS = new Set<TelemetryEvent>([
  'audit_start',
  'audit_complete',
  'audit_failed',
  'first_audit_complete',
])
const FAILURE_EVENTS = new Set<TelemetryEvent>([
  'audit_failed',
  'command_failed',
])
const MAX_BODY_BYTES = 2_048
const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function exactFields(value: Record<string, unknown>, schema: 1 | 2): boolean {
  const allowed = new Set(
    schema === 1
      ? [...BASE_FIELDS, 'errorCategory', 'report']
      : [
          ...BASE_FIELDS,
          'errorCategory',
          'failureReason',
          'failureContext',
          'operation',
          'report',
        ],
  )
  return Object.keys(value).every((field) => allowed.has(field))
}

export function validateTelemetryPayload(
  value: unknown,
): value is TelemetryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  if (payload.schema !== 1 && payload.schema !== 2) return false
  if (!exactFields(payload, payload.schema)) return false
  if (!includes(TELEMETRY_EVENTS, payload.event)) return false
  if (!includes(TELEMETRY_AGENTS, payload.agent)) return false
  if (!includes(PLATFORMS, payload.os)) return false
  if (!includes(ARCHITECTURES, payload.arch)) return false
  if (
    typeof payload.version !== 'string' ||
    payload.version.length > 64 ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      payload.version,
    )
  ) {
    return false
  }
  if (typeof payload.node !== 'string' || !/^\d{1,3}$/.test(payload.node)) {
    return false
  }
  if (
    typeof payload.cohort !== 'string' ||
    !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(payload.cohort)
  ) {
    return false
  }
  if (payload.schema === 1 && payload.event === 'command_failed') return false

  const isAuditEvent = AUDIT_EVENTS.has(payload.event)
  if (isAuditEvent !== (typeof payload.report === 'string')) return false
  if (typeof payload.report === 'string' && !REPORT_IDS.has(payload.report)) {
    return false
  }
  const isFailureEvent = FAILURE_EVENTS.has(payload.event)
  if (!isFailureEvent) {
    return (
      payload.errorCategory === undefined &&
      payload.failureReason === undefined &&
      payload.failureContext === undefined &&
      payload.operation === undefined
    )
  }
  if (!includes(TELEMETRY_ERROR_CATEGORIES, payload.errorCategory)) return false
  if (payload.schema === 1) {
    return (
      payload.event === 'audit_failed' &&
      includes(TELEMETRY_V1_ERROR_CATEGORIES, payload.errorCategory)
    )
  }
  if (!includes(TELEMETRY_FAILURE_REASONS, payload.failureReason)) return false
  if (
    payload.failureContext !== undefined &&
    !includes(TELEMETRY_FAILURE_CONTEXTS, payload.failureContext)
  ) {
    return false
  }
  if (
    payload.failureContext !== undefined &&
    payload.failureReason !== 'database_unique_constraint'
  ) {
    return false
  }
  if (payload.event === 'command_failed') {
    return includes(TELEMETRY_OPERATIONS, payload.operation)
  }
  return payload.operation === undefined
}

async function readBoundedText(
  request: Request,
  maximumBytes: number,
): Promise<string | undefined> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > maximumBytes) return undefined
  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    total += chunk.value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      return undefined
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
  return text + decoder.decode()
}

function jsonResponse(value: unknown, status = 200, cacheControl = 'no-store') {
  return Response.json(value, {
    status,
    headers: { ...RESPONSE_HEADERS, 'cache-control': cacheControl },
  })
}

export async function handleTelemetryIngest(
  request: Request,
  env: { TELEMETRY_DB: TelemetryWriteDatabase },
  now = new Date(),
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }

  const text = await readBoundedText(request, MAX_BODY_BYTES)
  if (text === undefined) return jsonResponse({ error: 'Invalid payload' }, 400)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }
  if (!validateTelemetryPayload(value)) {
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }

  const receivedMonth = now.toISOString().slice(0, 7)
  try {
    await env.TELEMETRY_DB.prepare(
      `INSERT INTO telemetry_events (
        received_month,
        event,
        version,
        agent,
        os,
        arch,
        node,
        cohort,
        schema,
        error_category,
        report,
        failure_reason,
        failure_context,
        operation
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
      .bind(
        receivedMonth,
        value.event,
        value.version,
        value.agent,
        value.os,
        value.arch,
        value.node,
        value.cohort,
        value.schema,
        value.errorCategory ?? null,
        value.report ?? null,
        value.failureReason ?? null,
        value.failureContext ?? null,
        value.operation ?? null,
      )
      .run()
  } catch {
    return jsonResponse({ error: 'Telemetry is temporarily unavailable' }, 503)
  }
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

function rowString(row: StatsRow, field: string): string {
  return typeof row[field] === 'string' ? row[field] : ''
}

function rowCount(row: StatsRow): number {
  const value = row.count
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function nullableRowString(row: StatsRow, field: string): string | null {
  const value = row[field]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1_000) / 10
}

function distribution(
  rows: StatsRow[],
  event: string,
): Array<{ agent: string; count: number; percent: number }> {
  const items = rows
    .filter((row) => rowString(row, 'event') === event)
    .map((row) => ({ agent: rowString(row, 'agent'), count: rowCount(row) }))
    .filter((row) => TELEMETRY_AGENTS.includes(row.agent as TelemetryAgent))
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return items
    .map((item) => ({
      ...item,
      percent: percentage(item.count, total) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent))
}

function cohortStart(cohort: string): Date | undefined {
  const match = /^(\d{4})-W(\d{2})$/.exec(cohort)
  if (!match) return undefined
  const year = Number(match[1])
  const week = Number(match[2])
  const januaryFourth = new Date(Date.UTC(year, 0, 4))
  const weekday = januaryFourth.getUTCDay() || 7
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + 1)
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() + (week - 1) * 7)
  return januaryFourth
}

export function aggregateStats(
  input: {
    events: StatsRow[]
    month: StatsRow[]
    agents: StatsRow[]
    cohorts: StatsRow[]
    reports: StatsRow[]
    failureCategories: StatsRow[]
    failureDetails: StatsRow[]
  },
  now = new Date(),
): Stats {
  const eventCounts = new Map(
    input.events.map((row) => [rowString(row, 'event'), rowCount(row)]),
  )
  const cohortCounts = new Map<string, { installs: number; retained: number }>()
  for (const row of input.cohorts) {
    const cohort = rowString(row, 'cohort')
    const current = cohortCounts.get(cohort) ?? { installs: 0, retained: 0 }
    if (rowString(row, 'event') === 'first_run')
      current.installs += rowCount(row)
    if (rowString(row, 'event') === 'active_d7')
      current.retained += rowCount(row)
    cohortCounts.set(cohort, current)
  }

  const installs = eventCounts.get('first_run') ?? 0
  const firstAuditCompletions = eventCounts.get('first_audit_complete') ?? 0
  const firstMonth = input.events
    .map((row) => rowString(row, 'first_month'))
    .filter((value) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))
    .sort()[0]
  return {
    schema: 1,
    generatedAt: now.toISOString(),
    window: {
      kind: 'all_time',
      firstMonth: firstMonth ?? null,
      currentMonth: now.toISOString().slice(0, 7),
    },
    totals: {
      installs,
      setupCompletions: eventCounts.get('setup_complete') ?? 0,
      firstAuditCompletions,
      auditsStarted: eventCounts.get('audit_start') ?? 0,
      auditsCompleted: eventCounts.get('audit_complete') ?? 0,
      auditsFailed: eventCounts.get('audit_failed') ?? 0,
      commandsFailed: eventCounts.get('command_failed') ?? 0,
      auditsThisMonth: input.month.reduce((sum, row) => sum + rowCount(row), 0),
      firstAuditConversionPercent: percentage(firstAuditCompletions, installs),
    },
    agents: {
      installs: distribution(input.agents, 'first_run'),
      audits: distribution(input.agents, 'audit_start'),
    },
    retentionD7: [...cohortCounts.entries()]
      .filter(([, counts]) => counts.installs > 0)
      .map(([cohort, counts]) => {
        const start = cohortStart(cohort)
        const complete = Boolean(
          start && now.getTime() >= start.getTime() + 14 * 86_400_000,
        )
        return {
          cohort,
          ...counts,
          percent: complete
            ? percentage(counts.retained, counts.installs)
            : null,
          complete,
        }
      })
      .sort((a, b) => b.cohort.localeCompare(a.cohort)),
    reports: reportIds
      .map((report) => ({
        report,
        count: rowCount(
          input.reports.find((row) => rowString(row, 'report') === report) ??
            {},
        ),
      }))
      .sort((a, b) => b.count - a.count || a.report.localeCompare(b.report)),
    failures: {
      categories: input.failureCategories
        .map((row) => ({
          category: rowString(row, 'category'),
          count: rowCount(row),
        }))
        .filter((row) =>
          TELEMETRY_ERROR_CATEGORIES.includes(
            row.category as TelemetryErrorCategory,
          ),
        )
        .sort(
          (a, b) => b.count - a.count || a.category.localeCompare(b.category),
        ),
      details: input.failureDetails
        .map((row) => ({
          event: rowString(row, 'event') as 'audit_failed' | 'command_failed',
          report: nullableRowString(row, 'report'),
          operation: nullableRowString(row, 'operation'),
          category: rowString(row, 'category'),
          reason: rowString(row, 'reason'),
          context: nullableRowString(row, 'context'),
          version: rowString(row, 'version'),
          count: rowCount(row),
        }))
        .filter(
          (row) =>
            FAILURE_EVENTS.has(row.event) &&
            TELEMETRY_ERROR_CATEGORIES.includes(
              row.category as TelemetryErrorCategory,
            ) &&
            TELEMETRY_FAILURE_REASONS.includes(
              row.reason as TelemetryFailureReason,
            ),
        )
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.event.localeCompare(b.event) ||
            (a.report ?? a.operation ?? '').localeCompare(
              b.report ?? b.operation ?? '',
            ) ||
            a.reason.localeCompare(b.reason),
        ),
    },
  }
}

async function liveStats(env: Env): Promise<Stats> {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const results = await env.TELEMETRY_DB.batch<StatsRow>([
    env.TELEMETRY_DB.prepare(
      `SELECT event, COUNT(*) AS count, MIN(received_month) AS first_month
       FROM telemetry_events
       GROUP BY event`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT COUNT(*) AS count
       FROM telemetry_events
       WHERE event = 'audit_start' AND received_month = ?1`,
    ).bind(currentMonth),
    env.TELEMETRY_DB.prepare(
      `SELECT event, agent, COUNT(*) AS count
       FROM telemetry_events
       WHERE event IN ('first_run', 'audit_start')
       GROUP BY event, agent`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT event, cohort, COUNT(*) AS count
       FROM telemetry_events
       WHERE event IN ('first_run', 'active_d7')
       GROUP BY event, cohort`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT report, COUNT(*) AS count
       FROM telemetry_events
       WHERE event = 'audit_start'
       GROUP BY report`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT error_category AS category, COUNT(*) AS count
       FROM telemetry_events
       WHERE event IN ('audit_failed', 'command_failed')
       GROUP BY error_category`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT
         event,
         report,
         operation,
         error_category AS category,
         failure_reason AS reason,
         failure_context AS context,
         version,
         COUNT(*) AS count
       FROM telemetry_events
       WHERE schema = 2 AND event IN ('audit_failed', 'command_failed')
       GROUP BY
         event,
         report,
         operation,
         error_category,
         failure_reason,
         failure_context,
         version
       ORDER BY count DESC, event, report, operation, reason, version
       LIMIT 20`,
    ),
  ])
  const [
    events,
    month,
    agents,
    cohorts,
    reports,
    failureCategories,
    failureDetails,
  ] = results.map((result) => result.results)
  return aggregateStats({
    events,
    month,
    agents,
    cohorts,
    reports,
    failureCategories,
    failureDetails,
  })
}

async function handleStats(
  request: Request,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  const cacheKey = new Request(new URL('/api/stats', request.url), {
    method: 'GET',
  })
  const cached = await caches.default.match(cacheKey)
  if (cached) return cached

  try {
    const stats = await liveStats(env)
    const response = jsonResponse(
      stats,
      200,
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    )
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    return response
  } catch {
    return jsonResponse({ error: 'Stats are temporarily unavailable' }, 503)
  }
}

export const app = new Hono<{ Bindings: Env }>()

app.use('/api/tools/*', async (context, next) => {
  const limited = await applyToolRateLimit(context.req.raw, context.env)
  if (limited) return limited
  const dailyLimited = await applyDailyToolQuota(context.req.raw, context.env)
  if (dailyLimited) return dailyLimited
  await next()
})

app.all('/api/t', (context) =>
  handleTelemetryIngest(context.req.raw, context.env),
)
app.all('/api/stats', (context) =>
  handleStats(context.req.raw, context.env, context.executionCtx),
)
app.all('/api/tools/llms-txt', (context) => handleLlmsTxtFetch(context.req.raw))
app.all('/api/tools/sitemap', (context) => handleSitemapImport(context.req.raw))
app.all('/api/tools/sitemap-extractor', (context) =>
  handleSitemapExtraction(context.req.raw, fetch, (promise) =>
    context.executionCtx.waitUntil(promise),
  ),
)
app.all('/api/tools/sitemap-validator', (context) =>
  handleSitemapValidation(context.req.raw),
)
app.all('/api/tools/robots-txt', (context) =>
  handleRobotsTxtFetch(context.req.raw),
)
app.all('/api/tools/favicon-checker', (context) =>
  handleFaviconCheck(context.req.raw),
)
app.all('/api/tools/spam-score', (context) =>
  handleSpamScore(context.req.raw, context.env),
)
app.all('/api/tools/domain-rating', (context) =>
  handleDomainRating(context.req.raw, context.env),
)
app.all('/api/tools/website-traffic', (context) =>
  handleWebsiteTraffic(context.req.raw, context.env),
)
app.all('/api/*', () => jsonResponse({ error: 'Not found' }, 404))
app.all('*', (context) => context.env.ASSETS.fetch(context.req.raw))

export default app
