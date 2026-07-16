import { reportIds } from '../src/content/reports/manifest.mjs'

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

type Stats = {
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

function exactFields(value: Record<string, unknown>): boolean {
  const allowed = new Set([...BASE_FIELDS, 'errorCategory', 'report'])
  return Object.keys(value).every((field) => allowed.has(field))
}

export function validateTelemetryPayload(
  value: unknown,
): value is TelemetryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  if (!exactFields(payload)) return false
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
  if (payload.schema !== 1) return false

  const isAuditEvent = AUDIT_EVENTS.has(payload.event)
  if (isAuditEvent !== (typeof payload.report === 'string')) return false
  if (typeof payload.report === 'string' && !REPORT_IDS.has(payload.report)) {
    return false
  }
  if (payload.event === 'audit_failed') {
    return includes(TELEMETRY_ERROR_CATEGORIES, payload.errorCategory)
  }
  return payload.errorCategory === undefined
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
        report
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
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
  ])
  const [events, month, agents, cohorts, reports] = results.map(
    (result) => result.results,
  )
  return aggregateStats({ events, month, agents, cohorts, reports })
}

async function handleStats(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (pathname === '/api/t') return handleTelemetryIngest(request, env)
    if (pathname === '/api/stats') return handleStats(request, env, ctx)
    if (pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'Not found' }, 404)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
