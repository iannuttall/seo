// A weekly count of failed runs from the anonymous usage events, sent to
// Ian's Telegram chat by the cron trigger. It reads the site's telemetry D1
// (SELECT only) and sends totals, never a row. Failures are split into
// expected states, network or provider trouble, and errors, by version, so
// old 0.2 installs stay apart from current releases. It also sends the
// install numbers the public stats page leaves out: how many new installs
// complete a first audit, and day 7 retention by install week.

const DAYS = 7
const VERSIONS = 8
const TOP = 6

// A person's setup, not a fault: not signed in, no key saved, no access to
// the site, input the command rejects, or too little data to report on.
const EXPECTED = [
  'access_denied',
  'auth_config_required',
  'auth_expired',
  'auth_required',
  'insufficient_data',
  'invalid_input',
  'property_not_found',
]
// Something outside seo: the network, a slow site or a provider.
const OUTSIDE = [
  'crawl_timeout',
  'network_connection',
  'network_dns',
  'network_timeout',
  'network_tls',
  'optional_provider_unavailable',
  'provider_unavailable',
  'rate_limited',
]

const list = (values: string[]) =>
  values.map((value) => `'${value}'`).join(', ')
// Schema 1 events (before 0.2.31) carry only a category.
const KIND = `CASE
  WHEN failure_reason IN (${list(EXPECTED)})
    OR (failure_reason IS NULL AND error_category IN ('auth', 'config'))
    THEN 'expected'
  WHEN failure_reason IN (${list(OUTSIDE)})
    OR (failure_reason IS NULL AND error_category = 'network')
    THEN 'outside'
  ELSE 'error' END`
const FAILED = `event IN ('audit_failed', 'command_failed')`
const WINDOW = 'received_day >= ?1 AND received_day < ?2'
const CURRENT = `version NOT LIKE '0.2.%'`

type VersionRow = {
  version: string
  started: number
  expected: number
  outside: number
  errors: number
}
type ReasonRow = { what: string | null; reason: string | null; n: number }

const count = (value: number) => value.toLocaleString('en-GB')

function parts(version: string): number[] {
  return (version.split('-')[0] ?? '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

// Newest first, 0.2.x last.
function byVersion(a: VersionRow, b: VersionRow): number {
  if (a.version === '0.2.x') return 1
  if (b.version === '0.2.x') return -1
  const left = parts(a.version)
  const right = parts(b.version)
  for (let index = 0; index < 3; index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0)
    if (diff) return diff
  }
  return a.version.localeCompare(b.version)
}

function versionLine(row: VersionRow): string {
  const failed = row.expected + row.outside + row.errors
  return `${row.version}: ${count(row.started)} audits, ${count(failed)} failed (${count(row.expected)} expected, ${count(row.outside)} network or provider, ${count(row.errors)} errors)`
}

function reasonLines(title: string, rows: ReasonRow[]): string[] {
  if (!rows.length) return []
  return [
    title,
    ...rows.map(
      (row) =>
        `- ${row.what ?? 'unknown'}: ${row.reason ?? 'unknown'} ${count(row.n)}`,
    ),
  ]
}

async function reasons(
  db: D1Database,
  kind: string,
  from: string,
  to: string,
): Promise<ReasonRow[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(report, operation) AS what, failure_reason AS reason,
         COUNT(*) AS n
       FROM telemetry_events
       WHERE ${WINDOW} AND ${FAILED} AND ${CURRENT} AND (${KIND}) = ?3
       GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT ${TOP}`,
    )
    .bind(from, to, kind)
    .all<ReasonRow>()
  return results
}

type InstallRow = { line: string; installs: number; first: number }
type CohortRow = {
  cohort: string
  installs: number
  retained: number
}

const LINE = `CASE WHEN version LIKE '0.2.%' THEN '0.2.x' ELSE '0.3+' END`

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 1_000) / 10}%` : 'n/a'

// Monday of an ISO week such as 2026-W41.
function weekStart(cohort: string): number | undefined {
  const match = /^(\d{4})-W(\d{2})$/.exec(cohort)
  if (!match) return undefined
  const start = new Date(Date.UTC(Number(match[1]), 0, 4))
  start.setUTCDate(
    start.getUTCDate() -
      (start.getUTCDay() || 7) +
      1 +
      (Number(match[2]) - 1) * 7,
  )
  return start.getTime()
}

async function installLines(
  db: D1Database,
  now: Date,
  from: string,
  to: string,
): Promise<string[]> {
  const [installs, cohorts] = await Promise.all([
    db
      .prepare(
        `SELECT ${LINE} AS line,
           SUM(event = 'first_run') AS installs,
           SUM(event = 'first_audit_complete') AS first
         FROM telemetry_events
         WHERE ${WINDOW} AND event IN ('first_run', 'first_audit_complete')
         GROUP BY 1 ORDER BY 1 DESC`,
      )
      .bind(from, to)
      .all<InstallRow>(),
    db
      .prepare(
        `SELECT cohort,
           SUM(event = 'first_run') AS installs,
           SUM(event = 'active_d7') AS retained
         FROM telemetry_events
         WHERE event IN ('first_run', 'active_d7') AND cohort >= ?1
         GROUP BY 1 ORDER BY 1 DESC`,
      )
      // Week ids sort as text, so this keeps this year and last year's end.
      .bind(`${now.getUTCFullYear() - 1}-W40`)
      .all<CohortRow>(),
  ])
  // A week is complete once its last install has had seven days to return.
  const complete = cohorts.results
    .filter((row) => {
      const start = weekStart(row.cohort)
      return start !== undefined && now.getTime() >= start + 14 * 86_400_000
    })
    .slice(0, 3)
  return [
    'Installs this week (first audits / installs, same days):',
    ...installs.results.map(
      (row) =>
        `- ${row.line}: ${count(row.installs)} installs, ${count(row.first)} first audits (${percent(row.first, row.installs)})`,
    ),
    // An install keeps its first week but reports day 7 from whatever
    // version it runs then, so retention is not split by version.
    'Day 7 retention, all versions, last complete install weeks:',
    ...complete.map(
      (row) =>
        `- ${row.cohort}: ${count(row.retained)} of ${count(row.installs)} (${percent(row.retained, row.installs)})`,
    ),
  ]
}

export async function failureReport(
  db: D1Database,
  now: Date,
): Promise<string> {
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN version LIKE '0.2.%' THEN '0.2.x' ELSE version END
           AS version,
         SUM(event = 'audit_start') AS started,
         SUM(${FAILED} AND (${KIND}) = 'expected') AS expected,
         SUM(${FAILED} AND (${KIND}) = 'outside') AS outside,
         SUM(${FAILED} AND (${KIND}) = 'error') AS errors
       FROM telemetry_events
       WHERE ${WINDOW}
         AND event IN ('audit_start', 'audit_failed', 'command_failed')
       GROUP BY 1`,
    )
    .bind(from, to)
    .all<VersionRow>()
  const rows = results.sort(byVersion)
  const head = `SEO Skill failures, ${from} to ${to} (UTC, last day not included).`
  if (!rows.length) return `${head} No runs recorded.`

  const current = rows.filter((row) => row.version !== '0.2.x')
  const shown = current.slice(0, VERSIONS)
  const rest = current.slice(VERSIONS)
  const older = rest.length
    ? [
        {
          version: `${rest.length} older 0.3+ versions`,
          started: rest.reduce((sum, row) => sum + row.started, 0),
          expected: rest.reduce((sum, row) => sum + row.expected, 0),
          outside: rest.reduce((sum, row) => sum + row.outside, 0),
          errors: rest.reduce((sum, row) => sum + row.errors, 0),
        },
      ]
    : []
  const legacy = rows.filter((row) => row.version === '0.2.x')
  const [errors, expected, installs] = await Promise.all([
    reasons(db, 'error', from, to),
    reasons(db, 'expected', from, to),
    installLines(db, now, from, to),
  ])
  return [
    head,
    'Expected: not signed in, no key, no access, bad input, too little data.',
    '',
    ...[...shown, ...older, ...legacy].map(versionLine),
    '',
    ...reasonLines('Top errors, 0.3 and later:', errors),
    ...reasonLines('Top expected states, 0.3 and later:', expected),
    '',
    ...installs,
  ]
    .join('\n')
    .trim()
}
