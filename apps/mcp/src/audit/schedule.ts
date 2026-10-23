import type { AuditAccess } from '@seo/core/commands'
import type { AuditMonitor } from './checks.ts'

// The weekly-audit schedule in D1: add and remove a site, list an account's
// sites without waking their objects, and the hourly cron that starts the
// runs that are due.

const WEEK_MS = 7 * 86_400_000
const DUE_PER_TICK = 50
// A run that has not reported back after this long is woken again; start()
// on a running site only re-arms its alarm, so this never doubles a run.
const STALE_MS = 6 * 3_600_000
// Sites per account in the beta.
export const MAX_SITES = 5

export type AuditSite = {
  property: string
  addedAt: number
  nextRunAt: number
  lastFinishedAt: number | null
  lastStatus: string | null
  complete: boolean | null
  pagesFetched: number | null
  openFindings: number | null
  newFindings: number | null
  resolvedFindings: number | null
  lastError: string | null
  // Pushed by the site object once a day; null before its first checks.
  coverage: AuditCoverage | null
  // Pushed by the site object after each run of its checks.
  monitor: AuditMonitor | null
}

export type AuditCoverage = {
  // Checks Search Console allows each property a day.
  perDay: number
  // The properties that check the site's URLs, and how many each holds.
  properties: { property: string; urls: number }[]
  // Folders to add as URL-prefix properties, best first; added says the
  // Sites tab's button already created it.
  suggestions: {
    property: string
    urls: number
    gain: number
    added?: 'verified' | 'unverified'
  }[]
}

type Row = {
  user_id: string
  property: string
  added_at: number
  next_run_at: number
  attempts: number
  last_finished_at: number | null
  last_status: string | null
  complete: number | null
  pages_fetched: number | null
  open_findings: number | null
  new_findings: number | null
  resolved_findings: number | null
  last_error: string | null
  coverage: string | null
  monitor: string | null
}

// One object per person and property, so two people who audit the same
// site never share data or sign-ins.
export function siteObject(env: Env, userId: string, property: string) {
  return env.SITE_AUDIT.get(
    env.SITE_AUDIT.idFromName(JSON.stringify([userId, property])),
  )
}

export async function auditSites(
  env: Env,
  userId: string,
): Promise<AuditSite[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM audit_sites WHERE user_id = ? ORDER BY property',
  )
    .bind(userId)
    .all<Row>()
  return rows.results.map((row) => ({
    property: row.property,
    addedAt: row.added_at,
    nextRunAt: row.next_run_at,
    lastFinishedAt: row.last_finished_at,
    lastStatus: row.last_status,
    complete: row.complete === null ? null : row.complete === 1,
    pagesFetched: row.pages_fetched,
    openFindings: row.open_findings,
    newFindings: row.new_findings,
    resolvedFindings: row.resolved_findings,
    lastError: row.last_error,
    coverage: row.coverage ? (JSON.parse(row.coverage) as AuditCoverage) : null,
    monitor: row.monitor ? (JSON.parse(row.monitor) as AuditMonitor) : null,
  }))
}

// Adds a site and starts its first run now. The caller checks the beta flag
// and that the person's Google accounts can read the property.
export async function addAuditSite(
  env: Env,
  userId: string,
  property: string,
): Promise<'added' | 'exists' | 'full'> {
  const now = Date.now()
  const count = await env.DB.prepare(
    'SELECT count(*) AS n FROM audit_sites WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ n: number }>()
  const result = await env.DB.prepare(
    `INSERT INTO audit_sites (user_id, property, added_at, next_run_at)
     SELECT ?, ?, ?, ? WHERE ? < ?
     ON CONFLICT (user_id, property) DO NOTHING`,
  )
    .bind(userId, property, now, now, count?.n ?? 0, MAX_SITES)
    .run()
  if (!result.meta.changes) {
    const exists = await env.DB.prepare(
      'SELECT 1 AS n FROM audit_sites WHERE user_id = ? AND property = ?',
    )
      .bind(userId, property)
      .first()
    return exists ? 'exists' : 'full'
  }
  await startDue(env, now, userId)
  return 'added'
}

// Removes a site and everything its object holds.
export async function removeAuditSite(
  env: Env,
  userId: string,
  property: string,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT 1 AS n FROM audit_sites WHERE user_id = ? AND property = ?',
  )
    .bind(userId, property)
    .first()
  if (!row) return
  await siteObject(env, userId, property).destroy()
  await env.DB.prepare(
    'DELETE FROM audit_sites WHERE user_id = ? AND property = ?',
  )
    .bind(userId, property)
    .run()
}

// Every site of an account, for Delete everything.
export async function removeAllAuditSites(
  env: Env,
  userId: string,
): Promise<void> {
  for (const site of await auditSites(env, userId)) {
    await removeAuditSite(env, userId, site.property)
  }
}

// The audit as the tools read it, for an account in the beta. A site that
// is not audited has no object, and asking would create one, so D1 is
// checked first (once per site per request).
export function auditAccess(
  env: Env,
  userId: string,
): AuditAccess & {
  // One URL's Google result through the site's store (null when the
  // property has no checks left today), or null when the site is not
  // audited.
  inspect(
    property: string,
    url: string,
  ): Promise<{ result: unknown | null } | null>
} {
  const seen = new Map<string, Promise<boolean>>()
  const audited = (property: string) => {
    let found = seen.get(property)
    if (!found) {
      found = env.DB.prepare(
        'SELECT 1 AS n FROM audit_sites WHERE user_id = ? AND property = ?',
      )
        .bind(userId, property)
        .first()
        .then(Boolean)
      seen.set(property, found)
    }
    return found
  }
  const object = (property: string) => siteObject(env, userId, property)
  return {
    snapshot: async (property) =>
      (await audited(property)) ? object(property).snapshot() : null,
    checks: async (property, offset, limit) =>
      (await audited(property)) ? object(property).checks(offset, limit) : null,
    add: async (property) => {
      seen.delete(property)
      return addAuditSite(env, userId, property)
    },
    inspect: async (property, url) =>
      (await audited(property))
        ? { result: await object(property).inspect(url) }
        : null,
  }
}

// Starts one site's run and moves its schedule only once the object said
// yes. A failed wake backs off 15 minutes, 1 hour, then 4 hours.
async function wake(env: Env, row: Row, now: number): Promise<boolean> {
  try {
    await siteObject(env, row.user_id, row.property).start(
      row.user_id,
      row.property,
    )
    await env.DB.prepare(
      `UPDATE audit_sites SET next_run_at = ?, last_requested_at = ?, attempts = 0,
         last_error = NULL WHERE user_id = ? AND property = ?`,
    )
      .bind(now + WEEK_MS, now, row.user_id, row.property)
      .run()
    return true
  } catch (error) {
    const backoff = [15, 60, 240][Math.min(row.attempts, 2)] as number
    await env.DB.prepare(
      `UPDATE audit_sites SET next_run_at = ?, attempts = attempts + 1, last_error = ?
       WHERE user_id = ? AND property = ?`,
    )
      .bind(
        now + backoff * 60_000,
        String(error).slice(0, 200),
        row.user_id,
        row.property,
      )
      .run()
    return false
  }
}

// The hourly cron. Only sites whose owner still has the beta flag run, so
// revoking the flag stops new runs at the next tick.
export async function startDue(env: Env, now = Date.now(), userId?: string) {
  const owner = userId ? 'AND s.user_id = ?' : ''
  const flagged = `EXISTS (SELECT 1 FROM beta_flags f
    WHERE f.user_id = s.user_id AND f.flag = 'weekly-audit')`
  const binds = (...values: unknown[]) =>
    userId ? [...values, userId] : values
  const due = await env.DB.prepare(
    `SELECT s.* FROM audit_sites s WHERE s.next_run_at <= ? AND ${flagged} ${owner}
     ORDER BY s.next_run_at, s.user_id, s.property LIMIT ?`,
  )
    .bind(...binds(now), DUE_PER_TICK)
    .all<Row>()
  const stale = await env.DB.prepare(
    `SELECT s.* FROM audit_sites s WHERE s.last_requested_at < ?
       AND (s.last_finished_at IS NULL OR s.last_finished_at < s.last_requested_at)
       AND ${flagged} ${owner}
     ORDER BY s.last_requested_at, s.user_id, s.property LIMIT ?`,
  )
    .bind(...binds(now - STALE_MS), DUE_PER_TICK)
    .all<Row>()
  let started = 0
  for (const row of due.results) if (await wake(env, row, now)) started += 1
  // Stale runs: re-arm only, without moving the schedule.
  for (const row of stale.results) {
    await siteObject(env, row.user_id, row.property)
      .start(row.user_id, row.property)
      .catch(() => null)
  }
  return { due: due.results.length, started, stale: stale.results.length }
}
