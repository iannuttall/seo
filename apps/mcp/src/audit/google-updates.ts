import {
  asImpactUpdate,
  impactReady,
  rankingUpdates,
  type UpdateImpact,
  updateImpact,
  type WeekData,
  type WeekGoogleUpdate,
} from '@seo/core/commands'
import { readJson, searchUpdatesFromIncidents } from '@seo/core/hosted'
import { queueAlert } from '../alerts/deliver.ts'
import type { GoogleUpdate, GoogleUpdateAlert } from '../alerts/registry.ts'
import { hasWeeklyAudit } from '../beta.ts'
import { directory } from '../google.ts'
import { accountsOf } from '../store.ts'
import { auditSites } from './schedule.ts'

// Google ranking update alerts: each hourly tick reads Google's Search
// Status feed once and, for a ranking update that started or finished in
// the last 7 days, queues one google-update alert per account in the
// weekly site audit, covering all its sites. An update that has finished
// before an account was alerted gets only the finished alert. The 7 days
// keep a first run, or a gap in the cron, from alerting on old updates.
// google_update_alerts claims each account's alert before it is queued.
//
// Then the impact phase: once final Search Console data covers a ranking
// update that finished in the last IMPACT_MS, one alert per account with
// what moved on each audited site (core updates.ts, the same result as
// seo_report section google-updates). Five Search Console calls a site,
// a few accounts a tick.

const FEED = 'https://status.search.google.com/incidents.json'
const FEED_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 8000
const RECENT_MS = 7 * 86_400_000
const KEEP_MS = 90 * 86_400_000
const ACCOUNTS_PER_TICK = 100
const IMPACT_MS = 14 * 86_400_000
const IMPACT_ACCOUNTS_PER_TICK = 5
const IMPACT_SITES = 100

type Incident = Parameters<typeof searchUpdatesFromIncidents>[0][number]

const isIncident = (value: unknown): value is Incident => {
  const item = (value ?? {}) as Record<string, unknown>
  return ['id', 'begin', 'external_desc', 'service_name', 'uri'].every(
    (key) => typeof item[key] === 'string',
  )
}

// Finished ranking updates whose impact can be sent now, oldest first.
export function impactUpdates(
  incidents: unknown[],
  now: number,
): GoogleUpdate[] {
  return searchUpdatesFromIncidents(incidents.filter(isIncident), {
    product: 'Ranking',
    limit: Number.POSITIVE_INFINITY,
  })
    .filter(
      (update) =>
        update.end &&
        now - Date.parse(update.end) <= IMPACT_MS &&
        impactReady(
          {
            id: update.id,
            name: update.name,
            start: update.start,
            end: update.end,
            url: update.sourceUrl,
          },
          new Date(now),
        ),
    )
    .map(
      (update): GoogleUpdate => ({
        id: update.id,
        name: update.name,
        phase: 'impact',
        start: update.start,
        end: update.end ?? null,
        url: update.sourceUrl,
      }),
    )
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
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
  let impactLeft = IMPACT_ACCOUNTS_PER_TICK
  for (const update of [
    ...dueUpdates(incidents, now),
    ...impactUpdates(incidents, now),
  ]) {
    const impact = update.phase === 'impact'
    if (impact ? impactLeft <= 0 : left <= 0) continue
    const due = await env.DB.prepare(
      `SELECT DISTINCT s.user_id FROM audit_sites s
       WHERE ${hasWeeklyAudit('s.user_id')} AND NOT EXISTS (
         SELECT 1 FROM google_update_alerts a
         WHERE a.user_id = s.user_id AND a.update_id = ? AND a.phase = ?)
       ORDER BY s.user_id LIMIT ?`,
    )
      .bind(update.id, update.phase, impact ? impactLeft : left)
      .all<{ user_id: string }>()
    if (impact) impactLeft -= due.results.length
    else left -= due.results.length
    for (const { user_id: userId } of due.results) {
      const claimed = await env.DB.prepare(
        `INSERT INTO google_update_alerts (update_id, phase, user_id, sent_at)
         VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING user_id`,
      )
        .bind(update.id, update.phase, userId, now)
        .first()
      if (!claimed) continue
      const release = () =>
        env.DB.prepare(
          'DELETE FROM google_update_alerts WHERE update_id = ? AND phase = ? AND user_id = ?',
        )
          .bind(update.id, update.phase, userId)
          .run()
          .catch(() => null)
      const sites = (await auditSites(env, userId)).map((site) => site.property)
      const data: GoogleUpdateAlert | null = impact
        ? await impactsFor(env, userId, update, sites, now).catch(() => null)
        : { update, sites }
      if (!data) {
        await release()
        continue
      }
      if (impact && !data.impacts?.length) {
        // Search Console could not be read for any site: try next tick. An
        // account with no sites has nothing to send.
        if (sites.length) await release()
        continue
      }
      // A failed queue releases the claim, so the next tick tries again.
      await queueAlert(
        env,
        { userId, type: 'google-update', site: '', data },
        now,
      ).catch(release)
    }
  }
  await env.DB.prepare('DELETE FROM google_update_alerts WHERE sent_at < ?')
    .bind(now - KEEP_MS)
    .run()
}

// Each audited site's result for one update, in order, up to IMPACT_SITES.
async function impactsFor(
  env: Env,
  userId: string,
  update: GoogleUpdate,
  sites: string[],
  now: number,
) {
  const read = directory(env, await accountsOf(env, userId)).searchAnalytics()
  const impacts: UpdateImpact[] = []
  const unread: string[] = []
  for (const site of sites.slice(0, IMPACT_SITES)) {
    const found = await updateImpact(site, update, read, new Date(now)).catch(
      () => null,
    )
    if (found) impacts.push(found)
    else unread.push(site)
  }
  return { update, sites, impacts, unread }
}

// The Monday summary's Google update lines for each site: ranking updates
// that ran during the week, or whose result became ready in the last 7
// days. A ready result is computed for the first WEEK_SITES sites (five
// Search Console calls each); the rest, and any site that could not be
// read, get the line without a result.
const WEEK_SITES = 20

export async function withWeekUpdates(
  env: Env,
  userId: string,
  data: WeekData,
  now: number,
): Promise<WeekData> {
  const updates = await rankingUpdates().catch(() => 'unread')
  if (typeof updates === 'string') return data
  const week = { start: data.start, end: data.end }
  const weekAgo = new Date(now - 7 * 86_400_000)
  const chosen = updates
    .map(asImpactUpdate)
    .map((update) => ({
      update,
      ready:
        impactReady(update, new Date(now)) && !impactReady(update, weekAgo),
      ran:
        update.start.slice(0, 10) <= week.end &&
        (update.end === null || update.end.slice(0, 10) >= week.start),
    }))
    .filter((item) => item.ready || item.ran)
    .sort((a, b) => a.update.start.localeCompare(b.update.start))
  if (!chosen.length) return data
  const read = directory(env, await accountsOf(env, userId)).searchAnalytics()
  const sites = await Promise.all(
    data.sites.map(async (site, index) => ({
      ...site,
      google_updates: await Promise.all(
        chosen.map(async ({ update, ready }): Promise<WeekGoogleUpdate> => {
          const found =
            ready && index < WEEK_SITES
              ? await updateImpact(site.property, update, read, new Date(now))
                  .then((impact) => impact)
                  .catch(() => null)
              : null
          return {
            name: update.name,
            start: update.start,
            end: update.end,
            ready,
            result:
              found?.before && found.after
                ? {
                    verdict: found.verdict,
                    clicks: found.after.clicks,
                    previous: found.before.clicks,
                    days:
                      Math.round(
                        (Date.parse(found.after.endDate) -
                          Date.parse(found.after.startDate)) /
                          86_400_000,
                      ) + 1,
                  }
                : null,
          }
        }),
      ),
    })),
  )
  return { ...data, sites }
}
