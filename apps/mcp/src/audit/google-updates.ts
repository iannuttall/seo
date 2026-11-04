import { readJson, searchUpdatesFromIncidents } from '@seo/core/hosted'
import { queueAlert } from '../alerts/deliver.ts'
import type { GoogleUpdate } from '../alerts/registry.ts'
import { hasWeeklyAudit } from '../beta.ts'
import { auditSites } from './schedule.ts'

// Google ranking update alerts: each hourly tick reads Google's Search
// Status feed once and, for a ranking update that started or finished in
// the last 7 days, queues one google-update alert per account in the
// weekly site audit, covering all its sites. An update that has finished
// before an account was alerted gets only the finished alert. The 7 days
// keep a first run, or a gap in the cron, from alerting on old updates.
// google_update_alerts claims each account's alert before it is queued.

const FEED = 'https://status.search.google.com/incidents.json'
const FEED_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 8000
const RECENT_MS = 7 * 86_400_000
const KEEP_MS = 90 * 86_400_000
const ACCOUNTS_PER_TICK = 100

type Incident = Parameters<typeof searchUpdatesFromIncidents>[0][number]

const isIncident = (value: unknown): value is Incident => {
  const item = (value ?? {}) as Record<string, unknown>
  return ['id', 'begin', 'external_desc', 'service_name', 'uri'].every(
    (key) => typeof item[key] === 'string',
  )
}

// The ranking updates with a phase to alert now, oldest first.
export function dueUpdates(incidents: unknown[], now: number): GoogleUpdate[] {
  const recent = (at: number) => at <= now && now - at <= RECENT_MS
  return searchUpdatesFromIncidents(incidents.filter(isIncident), {
    product: 'Ranking',
    limit: Number.POSITIVE_INFINITY,
  })
    .flatMap((update): GoogleUpdate[] => {
      const base = {
        id: update.id,
        name: update.name,
        start: update.start,
        end: update.end ?? null,
        url: update.sourceUrl,
      }
      if (update.end) {
        return recent(Date.parse(update.end))
          ? [{ ...base, phase: 'finished' }]
          : []
      }
      return recent(Date.parse(update.start))
        ? [{ ...base, phase: 'started' }]
        : []
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}

export async function sendGoogleUpdateAlerts(env: Env, now = Date.now()) {
  const incidents = await fetch(FEED, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then((response) =>
      response.ok
        ? readJson(response, 'Google Search Status', { maxBytes: FEED_BYTES })
        : null,
    )
    .catch(() => null)
  if (!Array.isArray(incidents)) return
  let left = ACCOUNTS_PER_TICK
  for (const update of dueUpdates(incidents, now)) {
    if (left <= 0) break
    const due = await env.DB.prepare(
      `SELECT DISTINCT s.user_id FROM audit_sites s
       WHERE ${hasWeeklyAudit('s.user_id')} AND NOT EXISTS (
         SELECT 1 FROM google_update_alerts a
         WHERE a.user_id = s.user_id AND a.update_id = ? AND a.phase = ?)
       ORDER BY s.user_id LIMIT ?`,
    )
      .bind(update.id, update.phase, left)
      .all<{ user_id: string }>()
    left -= due.results.length
    for (const { user_id: userId } of due.results) {
      const claimed = await env.DB.prepare(
        `INSERT INTO google_update_alerts (update_id, phase, user_id, sent_at)
         VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING user_id`,
      )
        .bind(update.id, update.phase, userId, now)
        .first()
      if (!claimed) continue
      const sites = (await auditSites(env, userId)).map((site) => site.property)
      // A failed queue releases the claim, so the next tick tries again.
      await queueAlert(
        env,
        { userId, type: 'google-update', site: '', data: { update, sites } },
        now,
      ).catch(() =>
        env.DB.prepare(
          'DELETE FROM google_update_alerts WHERE update_id = ? AND phase = ? AND user_id = ?',
        )
          .bind(update.id, update.phase, userId)
          .run()
          .catch(() => null),
      )
    }
  }
  await env.DB.prepare('DELETE FROM google_update_alerts WHERE sent_at < ?')
    .bind(now - KEEP_MS)
    .run()
}
