import { Hono } from 'hono'
import { reportIds } from '../src/content/telemetry/report-ids.mjs'
import { site } from '../src/lib/site.ts'
import {
  clickyTraffic,
  type NpmDay,
  npmDownloads,
  percentage,
  recordSkills,
  rowCount,
  rowString,
  type Signups,
  type StatsRow,
  signupSources,
  type Traffic,
} from './discovery.ts'
import { founderCounts, refreshFounderCounts } from './founder.ts'
import { applyDailyToolQuota } from './tools/daily-tool-quota.ts'
import { handleDomainAge } from './tools/domain-age.ts'
import { handleFaviconCheck } from './tools/favicon-checker.ts'
import { handleLlmsTxtFetch } from './tools/llms-txt.ts'
import { handleNoindexCheck } from './tools/noindex-checker.ts'
import { handleOpenGraphCheck } from './tools/open-graph.ts'
import {
  handleBacklinks,
  handleCompetitorKeywords,
  handleDomainRating,
  handlePeopleAlsoAsk,
  handleSerpChecker,
  handleSpamScore,
  handleTitleWords,
  handleWebsiteTraffic,
} from './tools/paid-tool-routes.ts'
import { handleRedirectMap, REDIRECT_CHECKER } from './tools/redirect-map.ts'
import { handleRobotsTxtFetch } from './tools/robots-txt.ts'
import { handleSerpPreviewFetch } from './tools/serp-preview.ts'
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

// "hosted" marks runs from the hosted MCP at seoskill.dev/mcp.
const PLATFORMS = [
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'hosted',
  'linux',
  'openbsd',
  'sunos',
  'win32',
] as const

const ARCHITECTURES = [
  'arm',
  'arm64',
  'hosted',
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

type TelemetryWriteStatement = {
  bind(...values: unknown[]): TelemetryWriteStatement
  run(): Promise<unknown>
}

type TelemetryWriteDatabase = {
  prepare(query: string): TelemetryWriteStatement
}

// Day by day use since days were recorded, month by month before that, and
// the daily skills.sh check.
export type Timeline = {
  // Hosted MCP accounts that exist now, and the day each was created.
  // Deleted accounts are gone from both.
  hostedAccounts: number
  hostedSignups: Array<{ day: string; count: number }>
  daily: Array<{
    day: string
    installs: number
    cliRuns: number
    hostedRuns: number
  }>
  monthly: Array<{ month: string; installs: number; runs: number }>
  // npm's daily downloads of the package, or null when npm did not answer.
  npm: NpmDay[] | null
  skills: {
    installs: Array<{ day: string; installs: number }>
    // The place on each skills.sh leaderboard. checked is how many places
    // were read, so a null rank means "below checked", not "not listed".
    ranks: Array<{
      day: string
      board: 'all-time' | 'trending'
      rank: number | null
      checked: number
      total: number | null
    }>
    queries: Array<{
      query: string
      day: string
      position: number | null
      weekAgo: number | null
      history: Array<{ day: string; position: number | null }>
    }>
  }
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
    firstAuditCompletions: number
    auditsCompleted: number
    auditsThisMonth: number
  }
  agents: {
    installs: Array<{ agent: string; count: number; percent: number }>
    audits: Array<{ agent: string; count: number; percent: number }>
  }
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
  const receivedDay = now.toISOString().slice(0, 10)
  try {
    await env.TELEMETRY_DB.prepare(
      `INSERT INTO telemetry_events (
        received_month,
        received_day,
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
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    )
      .bind(
        receivedMonth,
        receivedDay,
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

export function aggregateStats(
  input: {
    events: StatsRow[]
    month: StatsRow[]
    agents: StatsRow[]
    reports: StatsRow[]
  },
  now = new Date(),
): Stats {
  const eventCounts = new Map(
    input.events.map((row) => [rowString(row, 'event'), rowCount(row)]),
  )
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
      firstAuditCompletions,
      auditsCompleted: eventCounts.get('audit_complete') ?? 0,
      auditsThisMonth: input.month.reduce((sum, row) => sum + rowCount(row), 0),
    },
    agents: {
      installs: distribution(input.agents, 'first_run'),
      audits: distribution(input.agents, 'audit_start'),
    },
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

const TIMELINE_DAYS = 90

export function timeline(input: {
  daily: StatsRow[]
  monthly: StatsRow[]
  skills: StatsRow[]
  ranks?: StatsRow[]
  signups: StatsRow[]
  npm?: Timeline['npm']
}): Timeline {
  const days = new Map<string, Timeline['daily'][number]>()
  for (const row of input.daily) {
    const day = rowString(row, 'day')
    const entry = days.get(day) ?? {
      day,
      installs: 0,
      cliRuns: 0,
      hostedRuns: 0,
    }
    const event = rowString(row, 'event')
    if (event === 'first_run') entry.installs += rowCount(row)
    else if (row.hosted === 1) entry.hostedRuns += rowCount(row)
    else entry.cliRuns += rowCount(row)
    days.set(day, entry)
  }
  const months = new Map<string, Timeline['monthly'][number]>()
  for (const row of input.monthly) {
    const month = rowString(row, 'month')
    const entry = months.get(month) ?? { month, installs: 0, runs: 0 }
    if (rowString(row, 'event') === 'first_run') entry.installs += rowCount(row)
    else entry.runs += rowCount(row)
    months.set(month, entry)
  }
  const position = (value: unknown) =>
    typeof value === 'number' && value >= 1 ? value : null
  const installs = input.skills
    .filter((row) => rowString(row, 'query') === '')
    .map((row) => ({
      day: rowString(row, 'day'),
      installs: typeof row.installs === 'number' ? row.installs : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const latestDay = input.skills
    .map((row) => rowString(row, 'day'))
    .sort()
    .at(-1)
  const weekBefore = latestDay
    ? new Date(Date.parse(`${latestDay}T00:00:00Z`) - 7 * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null
  const queries = input.skills
    .filter(
      (row) => rowString(row, 'day') === latestDay && rowString(row, 'query'),
    )
    .map((row) => {
      const query = rowString(row, 'query')
      const checks = input.skills.filter(
        (item) => rowString(item, 'query') === query,
      )
      const before = checks.find(
        (item) => rowString(item, 'day') === weekBefore,
      )
      return {
        query,
        day: latestDay ?? '',
        position: position(row.position),
        weekAgo: before ? position(before.position) : null,
        history: checks
          .map((item) => ({
            day: rowString(item, 'day'),
            position: position(item.position),
          }))
          .sort((a, b) => a.day.localeCompare(b.day)),
      }
    })
    .sort(
      (a, b) =>
        (a.position ?? 999) - (b.position ?? 999) ||
        a.query.localeCompare(b.query),
    )
  const hostedSignups = input.signups
    .map((row) => ({ day: rowString(row, 'day'), count: rowCount(row) }))
    .filter((row) => row.day)
    .sort((a, b) => a.day.localeCompare(b.day))
  return {
    hostedAccounts: hostedSignups.reduce((total, row) => total + row.count, 0),
    hostedSignups,
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    monthly: [...months.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    npm: input.npm ?? null,
    skills: {
      installs,
      ranks: (input.ranks ?? [])
        .flatMap((row) => {
          const board = rowString(row, 'board')
          if (board !== 'all-time' && board !== 'trending') return []
          return [
            {
              day: rowString(row, 'day'),
              board,
              rank: position(row.rank),
              checked: typeof row.checked === 'number' ? row.checked : 0,
              total: typeof row.total === 'number' ? row.total : null,
            } as const,
          ]
        })
        .sort(
          (a, b) =>
            a.day.localeCompare(b.day) || a.board.localeCompare(b.board),
        ),
      queries,
    },
  }
}

async function liveStats(env: Env): Promise<
  Stats & {
    timeline: Timeline
    signups: Signups | null
    traffic: Traffic | null
  }
> {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const sinceDay = new Date(Date.now() - TIMELINE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
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
      `SELECT report, COUNT(*) AS count
       FROM telemetry_events
       WHERE event = 'audit_start'
       GROUP BY report`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT received_day AS day, event, (os = 'hosted') AS hosted,
              COUNT(*) AS count
       FROM telemetry_events
       WHERE received_day >= ?1 AND event IN ('first_run', 'audit_start')
       GROUP BY received_day, event, hosted`,
    ).bind(sinceDay),
    env.TELEMETRY_DB.prepare(
      `SELECT received_month AS month, event, COUNT(*) AS count
       FROM telemetry_events
       WHERE event IN ('first_run', 'audit_start')
       GROUP BY received_month, event`,
    ),
    env.TELEMETRY_DB.prepare(
      `SELECT day, query, position, installs
       FROM skills_daily
       WHERE day >= ?1`,
    ).bind(sinceDay),
    env.TELEMETRY_DB.prepare(
      `SELECT day, board, rank, checked, total
       FROM skills_ranks
       WHERE day >= ?1`,
    ).bind(sinceDay),
  ])
  const [events, month, agents, reports, daily, monthly, skills, ranks] =
    results.map((result) => result.results)
  const npm = npmDownloads(sinceDay)
  const traffic = clickyTraffic(site.clickySiteId, env.CLICKY_SITEKEY)
  // Every account counts toward the total; the chart shows the last 90 days.
  const signups = await env.ACCOUNTS_DB.prepare(
    `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
     FROM users
     GROUP BY day`,
  )
    .all<StatsRow>()
    .then((result) => result.results)
    .catch(() => [] as StatsRow[])
  // One row per distinct combination; there are a few hundred at most.
  const sources = await env.ACCOUNTS_DB.prepare(
    `SELECT entry, client, client_name, referrer_host, landing_path,
            utm_source, COUNT(*) AS count,
            MIN(date(created_at / 1000, 'unixepoch')) AS first_day
     FROM signup_sources
     GROUP BY 1, 2, 3, 4, 5, 6
     LIMIT 5000`,
  )
    .all<StatsRow>()
    .then((result) => signupSources(result.results))
    .catch(() => null)
  return {
    ...aggregateStats({
      events,
      month,
      agents,
      reports,
    }),
    timeline: timeline({
      daily,
      monthly,
      skills,
      ranks,
      signups,
      npm: await npm,
    }),
    signups: sources,
    traffic: await traffic,
  }
}

async function handleStats(
  request: Request,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  const cacheKey = new Request(new URL('/api/stats?v=4', request.url), {
    method: 'GET',
  })
  const cached = await caches.default.match(cacheKey)
  if (cached) return cached

  try {
    const stats = await liveStats(env)
    const response = jsonResponse(stats, 200, 'public, max-age=30, s-maxage=60')
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    return response
  } catch {
    return jsonResponse({ error: 'Stats are temporarily unavailable' }, 503)
  }
}

// Ian's follower counts for the founder badge and the About page. They
// change once a day, so each Cloudflare location keeps them for six hours.
async function handleFounder(
  request: Request,
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  const cacheKey = new Request(new URL('/api/founder?v=1', request.url), {
    method: 'GET',
  })
  const cached = await caches.default.match(cacheKey)
  if (cached) return cached
  try {
    const counts = await founderCounts(env.TELEMETRY_DB)
    const response = jsonResponse(
      counts,
      200,
      'public, max-age=3600, s-maxage=21600',
    )
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    return response
  } catch {
    return jsonResponse({ error: 'Counts are temporarily unavailable' }, 503)
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
app.all('/api/founder', (context) =>
  handleFounder(context.req.raw, context.env, context.executionCtx),
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
app.all('/api/tools/serp-preview', (context) =>
  handleSerpPreviewFetch(context.req.raw),
)
app.all('/api/tools/favicon-checker', (context) =>
  handleFaviconCheck(context.req.raw),
)
app.all('/api/tools/open-graph', (context) =>
  handleOpenGraphCheck(context.req.raw),
)
app.all('/api/tools/domain-age', (context) => handleDomainAge(context.req.raw))
app.all('/api/tools/noindex-checker', (context) =>
  handleNoindexCheck(context.req.raw),
)
app.all('/api/tools/redirect-map', (context) =>
  handleRedirectMap(context.req.raw),
)
app.all('/api/tools/redirect-checker', (context) =>
  handleRedirectMap(context.req.raw, fetch, Date.now, REDIRECT_CHECKER),
)
app.all('/api/tools/spam-score', (context) =>
  handleSpamScore(context.req.raw, context.env),
)
app.all('/api/tools/domain-rating', (context) =>
  handleDomainRating(context.req.raw, context.env),
)
app.all('/api/tools/backlinks', (context) =>
  handleBacklinks(context.req.raw, context.env),
)
app.all('/api/tools/website-traffic', (context) =>
  handleWebsiteTraffic(context.req.raw, context.env),
)
app.all('/api/tools/competitor-keywords', (context) =>
  handleCompetitorKeywords(context.req.raw, context.env),
)
app.all('/api/tools/serp-checker', (context) =>
  handleSerpChecker(context.req.raw, context.env),
)
app.all('/api/tools/title-words', (context) =>
  handleTitleWords(context.req.raw, context.env),
)
app.all('/api/tools/people-also-ask', (context) =>
  handlePeopleAlsoAsk(context.req.raw, context.env),
)
app.all('/api/*', () => jsonResponse({ error: 'Not found' }, 404))
app.all('*', (context) => context.env.ASSETS.fetch(context.req.raw))

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recordSkills(env))
    ctx.waitUntil(refreshFounderCounts(env).catch(() => undefined))
  },
} satisfies ExportedHandler<Env>
