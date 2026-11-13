import {
  MEASURES_PER_RUN,
  measureFixed,
  previousWeek,
  searchConsoleDay,
  type WeekData,
  weekMeasured,
} from '@seo/core/commands'
import { queueAlert } from '../alerts/deliver.ts'
import { hasWeeklyAudit } from '../beta.ts'
import { directory } from '../google.ts'
import { accountsOf } from '../store.ts'
import { withWeekUpdates } from './google-updates.ts'
import { isMonday, unsentIndexChanges } from './index-roundup.ts'
import { auditSites, siteId, siteIssues, siteObject } from './schedule.ts'

// The weekly summary (seo report with no site, and the Monday email): the last full week,
// Monday to Sunday in UTC, of every site a person audits. Each site's
// object answers for its own week; the rest comes from D1.

const ACCOUNTS_PER_TICK = 25
// The first report waits this long for a site's first competitor check
// after its first crawl, and a day for a first crawl that has not finished.
const FIRST_WAIT_MS = 6 * 3_600_000
const FIRST_LATEST_MS = 86_400_000

type Window = ReturnType<typeof previousWeek>

// The 7 days to now, for an account's first report.
function lastSevenDays(now: number): Window {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const startMs = now - 7 * 86_400_000
  return { start: iso(startMs), end: iso(now), startMs, endMs: now }
}

export async function weekData(
  env: Env,
  userId: string,
  now = Date.now(),
  week: Window = previousWeek(now),
): Promise<WeekData> {
  const sites = await auditSites(env, userId)
  const issues = siteIssues(env, userId)
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
          measured: weekMeasured(
            (await issues.read(site.property).catch(() => null)) ?? [],
            now,
          ),
          crawl: found?.crawl ?? null,
          start_error: site.lastError,
          index: found?.index ?? null,
          clicks: found?.clicks ?? null,
          opportunities: site.opportunities && {
            ...site.opportunities,
            items: site.opportunities.items
              .filter(
                (item) =>
                  item.surfaced_at >= week.startMs &&
                  item.surfaced_at < week.endMs,
              )
              .map(({ surfaced_at: _, ...item }) => item),
          },
          ai_answers: site.aiAnswers,
        }
      }),
    ),
  }
}

// Measures each audited site's fixed issues that are due, before the
// summary reads them: at most MEASURES_PER_RUN Search Console calls for
// the whole account, sites in order. A call that fails, or a fix past the
// cap, waits for the next run (the issues section, or next week).
async function measureSites(env: Env, userId: string, now: number) {
  const store = siteIssues(env, userId)
  const read = directory(env, await accountsOf(env, userId)).searchAnalytics()
  let left = MEASURES_PER_RUN
  for (const site of await auditSites(env, userId)) {
    if (left <= 0) return
    const issues = await store.read(site.property)
    if (!issues?.some((issue) => issue.mark === 'fixed')) continue
    const measured = await measureFixed(
      issues,
      site.property,
      read,
      new Date(now),
      left,
    )
    left -= measured.calls
    if (JSON.stringify(measured.issues) !== JSON.stringify(issues)) {
      await store.write(site.property, measured.issues)
    }
  }
}

// From the hourly cron once the Search Console Monday starts (07:17 or
// 08:17 UTC), so Sunday's index checks are done: one summary per beta
// account that was sent its first report, a few accounts a tick. It carries the day's index
// roundup (audit/index-roundup.ts), whose pages are marked sent only when
// the summary is queued; otherwise Tuesday's roundup has them.
// weekly_summaries records each account's week before it is queued, so an
// account is never sent the same week twice; delivery then retries through
// the alerts table like any alert.
export async function sendWeeklySummaries(env: Env, now = Date.now()) {
  if (!isMonday(searchConsoleDay(now))) return
  const week = previousWeek(now)
  const due = await env.DB.prepare(
    `SELECT DISTINCT s.user_id FROM audit_sites s
     WHERE ${hasWeeklyAudit('s.user_id')}
       AND EXISTS (SELECT 1 FROM weekly_summaries w WHERE w.user_id = s.user_id)
       AND NOT EXISTS (SELECT 1 FROM weekly_summaries w WHERE w.user_id = s.user_id AND w.week = ?)
     ORDER BY s.user_id LIMIT ?`,
  )
    .bind(week.start, ACCOUNTS_PER_TICK)
    .all<{ user_id: string }>()
  for (const { user_id: userId } of due.results) {
    await sendSummary(env, userId, now, week)
  }
  // The first report's row stays, so it is never sent twice.
  await env.DB.prepare(
    "DELETE FROM weekly_summaries WHERE sent_at < ? AND week <> 'first'",
  )
    .bind(now - 90 * 86_400_000)
    .run()
}

// From the hourly cron: an account's first summary, of the 7 days to now,
// as soon as a site's first crawl is done and its first competitor check is
// in (or FIRST_WAIT_MS has passed), so a new account sees its results the
// day it joins, not the next Monday. A crawl that has not finished a day
// after the site was added does not hold it back. Only accounts never sent
// a summary; the Monday summaries start after it.
export async function sendFirstSummaries(env: Env, now = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT DISTINCT s.user_id FROM audit_sites s
     WHERE ${hasWeeklyAudit('s.user_id')}
       AND ((s.last_finished_at IS NOT NULL AND (s.opportunities IS NOT NULL OR s.last_finished_at < ?))
         OR s.added_at < ?)
       AND NOT EXISTS (SELECT 1 FROM weekly_summaries w WHERE w.user_id = s.user_id)
     ORDER BY s.user_id LIMIT ?`,
  )
    .bind(now - FIRST_WAIT_MS, now - FIRST_LATEST_MS, ACCOUNTS_PER_TICK)
    .all<{ user_id: string }>()
  for (const { user_id: userId } of due.results) {
    await sendSummary(env, userId, now, lastSevenDays(now), true)
  }
}

// Builds one account's summary for the window and queues it once: the
// row in weekly_summaries is claimed first (the window's Monday, or
// "first"). The Monday summary also carries the day's index roundup.
async function sendSummary(
  env: Env,
  userId: string,
  now: number,
  week: Window,
  first = false,
) {
  await measureSites(env, userId, now).catch(() => undefined)
  const [summary, unsent] = await Promise.all([
    weekData(env, userId, now, week).catch(() => null),
    first ? null : unsentIndexChanges(env, userId).catch(() => null),
  ])
  if (!summary) return
  const withUpdates = await withWeekUpdates(env, userId, summary, now).catch(
    () => summary,
  )
  const data = {
    ...withUpdates,
    index_changes: unsent?.sites ?? [],
    ...(first ? { first: true } : {}),
  }
  const claimed = await env.DB.prepare(
    `INSERT INTO weekly_summaries (user_id, week, sent_at) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING RETURNING week`,
  )
    .bind(userId, first ? 'first' : week.start, now)
    .first()
  if (!claimed) return
  const queued = await queueAlert(
    env,
    { userId, type: 'weekly-summary', site: '', data },
    now,
  ).catch(() => null)
  if (queued && unsent) await unsent.markSent()
}
