import { previousWeek, type WeekData } from '@seo/core/commands'
import { queueAlert } from '../alerts/deliver.ts'
import { auditSites, siteId, siteObject } from './schedule.ts'

// The weekly summary (seo report with no site, and the Monday email): the last full week,
// Monday to Sunday in UTC, of every site a person audits. Each site's
// object answers for its own week; the rest comes from D1.

const ACCOUNTS_PER_TICK = 25
// The first hourly tick on a Monday that sends summaries (07:17 UTC).
const SEND_FROM_HOUR = 7

export async function weekData(
  env: Env,
  userId: string,
  now = Date.now(),
): Promise<WeekData> {
  const week = previousWeek(now)
  const sites = await auditSites(env, userId)
  return {
    start: week.start,
    end: week.end,
    account: `${env.PUBLIC_URL}/account`,
    sites: await Promise.all(
      sites.map(async (site) => {
        const found = await siteObject(env, userId, site.property)
          .week(week.startMs, week.endMs)
          .catch(() => null)
        return {
          property: site.property,
          link: `${env.PUBLIC_URL}/account/sites/${await siteId(userId, site.property)}`,
          added_at: site.addedAt,
          crawl: found?.crawl ?? null,
          start_error: site.lastError,
          index: found?.index ?? null,
          clicks: found?.clicks ?? null,
        }
      }),
    ),
  }
}

// From the hourly cron on a Monday: one summary per beta account with a
// site, a few accounts a tick. weekly_summaries records each account's week
// before it is queued, so an account is never sent the same week twice;
// delivery then retries through the alerts table like any alert.
export async function sendWeeklySummaries(env: Env, now = Date.now()) {
  const date = new Date(now)
  if (date.getUTCDay() !== 1 || date.getUTCHours() < SEND_FROM_HOUR) return
  const week = previousWeek(now).start
  const due = await env.DB.prepare(
    `SELECT DISTINCT s.user_id FROM audit_sites s
     JOIN beta_flags f ON f.user_id = s.user_id AND f.flag = 'weekly-audit'
     WHERE NOT EXISTS (SELECT 1 FROM weekly_summaries w WHERE w.user_id = s.user_id AND w.week = ?)
     ORDER BY s.user_id LIMIT ?`,
  )
    .bind(week, ACCOUNTS_PER_TICK)
    .all<{ user_id: string }>()
  for (const { user_id: userId } of due.results) {
    const data = await weekData(env, userId, now).catch(() => null)
    if (!data) continue
    const claimed = await env.DB.prepare(
      `INSERT INTO weekly_summaries (user_id, week, sent_at) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING RETURNING week`,
    )
      .bind(userId, week, now)
      .first()
    if (!claimed) continue
    await queueAlert(
      env,
      { userId, type: 'weekly-summary', site: '', data },
      now,
    ).catch(() => null)
  }
  await env.DB.prepare('DELETE FROM weekly_summaries WHERE sent_at < ?')
    .bind(now - 90 * 86_400_000)
    .run()
}
