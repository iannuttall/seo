import {
  analyticsBeside,
  brandNames,
  brandSplit,
  MEASURES_PER_RUN,
  measureFixed,
  notBrand,
  previousWeek,
  type SearchAnalyticsQuery,
  searchConsoleDay,
  type WeekData,
  weekMeasured,
  weekWork,
} from '@seo/core/commands'
import { queueAlert } from '../alerts/deliver.ts'
import { hasWeeklyAudit } from '../beta.ts'
import { siteContext } from '../context.ts'
import { directory, signInHint } from '../google.ts'
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
  // A failed account read leaves out AI visits, never the summary.
  const google = directory(env, await accountsOf(env, userId).catch(() => []))
  const analytics = {
    accounts: async () => google.accounts(),
    signIn: signInHint(env),
  }
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const range = { startDate: week.start, endDate: week.end }
  const before = {
    startDate: day(Date.parse(week.start) - 7 * 86_400_000),
    endDate: day(Date.parse(week.end) - 7 * 86_400_000),
  }
  return {
    start: week.start,
    end: week.end,
    account: `${env.PUBLIC_URL}/account`,
    sites: await Promise.all(
      sites.map(async (site) => {
        const found = await siteObject(env, userId, site.property)
          .week(week.startMs, week.endMs)
          .catch(() => null)
        const kept = (await issues.read(site.property).catch(() => null)) ?? []
        return {
          property: site.property,
          link: `${env.PUBLIC_URL}/account/sites/${await siteId(userId, site.property)}`,
          added_at: site.addedAt,
          measured: weekMeasured(kept, now),
          work: weekWork(kept, week.startMs, week.endMs),
          crawl: found?.crawl ?? null,
          start_error: site.lastError,
          unread: !found,
          index: found?.index ?? null,
          clicks: found?.clicks ?? null,
          not_brand: found?.clicks
            ? await weekNotBrand(
                env,
                userId,
                google.searchAnalytics(),
                site.property,
                found.clicks,
              )
            : null,
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
          ai_visits: await aiVisits(analytics, site.property, range, before),
        }
      }),
    ),
  }
}

// Not-brand clicks for the site's 7 days of clicks and the 7 before: the
// shared brand split (Google's classification, else the saved brand
// names), or null without either or when it could not be read.
async function weekNotBrand(
  env: Env,
  userId: string,
  read: SearchAnalyticsQuery,
  property: string,
  clicks: { start: string; end: string },
): Promise<WeekData['sites'][number]['not_brand']> {
  const context = await siteContext(env, userId)
    .read(property)
    .catch(() => null)
  const shift = (date: string) =>
    new Date(Date.parse(date) - 7 * 86_400_000).toISOString().slice(0, 10)
  const split = await brandSplit(
    read,
    property,
    { startDate: clicks.start, endDate: clicks.end },
    { startDate: shift(clicks.start), endDate: shift(clicks.end) },
    context ? brandNames(context.text) : [],
  ).catch(() => null)
  const side = split ? notBrand(split) : null
  return side
    ? {
        by: side.by,
        clicks: side.current.clicks,
        previous: side.previous.clicks,
      }
    : null
}

// Google Analytics sessions from AI assistants for the summary, or null
// when no property matches the site or it could not be read.
async function aiVisits(
  ...args: Parameters<typeof analyticsBeside>
): Promise<WeekData['sites'][number]['ai_visits']> {
  const found = await analyticsBeside(...args).catch(() => null)
  const ai = (
    found?.data as {
      aiAssistants?: {
        sessions: number
        previousSessions: number
        bySource: { source?: unknown; sessions: number }[]
      }
    } | null
  )?.aiAssistants
  if (!ai) return null
  return {
    sessions: ai.sessions,
    previous: ai.previousSessions,
    by_source: ai.bySource.map((row) => ({
      source: String(row.source ?? ''),
      sessions: row.sessions,
    })),
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
// 08:17 UTC), so Sunday's index checks are done: one summary per audited
// site that was sent its first report, like Search Console's email per
// property, a few accounts a tick. Each carries its site's part of the
// day's index roundup (audit/index-roundup.ts), whose pages are marked sent
// only when that summary is queued; otherwise Tuesday's roundup has them.
// site_summaries records each site's week before it is queued, so a site
// is never sent the same week twice; delivery then retries through the
// alerts table like any alert.
export async function sendWeeklySummaries(env: Env, now = Date.now()) {
  if (!isMonday(searchConsoleDay(now))) return
  const week = previousWeek(now)
  const due = await env.DB.prepare(
    `SELECT s.user_id, s.property FROM audit_sites s
     WHERE s.user_id IN (
       SELECT DISTINCT d.user_id FROM audit_sites d
       WHERE ${hasWeeklyAudit('d.user_id')} AND ${weekDue('d')}
       ORDER BY d.user_id LIMIT ?)
       AND ${weekDue('s')}
     ORDER BY s.user_id, s.property`,
  )
    .bind(week.start, ACCOUNTS_PER_TICK, week.start)
    .all<{ user_id: string; property: string }>()
  for (const [userId, properties] of byAccount(due.results)) {
    await sendSummaries(env, userId, properties, now, week)
  }
  // Each site's first report row stays, so it is never sent twice.
  await env.DB.prepare(
    "DELETE FROM site_summaries WHERE sent_at < ? AND week <> 'first'",
  )
    .bind(now - 90 * 86_400_000)
    .run()
}

// SQL that is true when the audit_sites row (alias) was sent a summary
// before, and not yet the week bound in its place. Any earlier row counts,
// not only "first": sites audited before site_summaries have only weeks.
const weekDue = (alias: string) =>
  `EXISTS (SELECT 1 FROM site_summaries w WHERE w.user_id = ${alias}.user_id AND w.property = ${alias}.property)
   AND NOT EXISTS (SELECT 1 FROM site_summaries w WHERE w.user_id = ${alias}.user_id AND w.property = ${alias}.property AND w.week = ?)`

const byAccount = (rows: { user_id: string; property: string }[]) => {
  const accounts = new Map<string, string[]>()
  for (const row of rows) {
    accounts.set(row.user_id, [
      ...(accounts.get(row.user_id) ?? []),
      row.property,
    ])
  }
  return accounts
}

// From the hourly cron: a site's first summary, of the 7 days to now, as
// soon as its first crawl is done and its first competitor check is in (or
// FIRST_WAIT_MS has passed), so a new site's results come the day it is
// added, not the next Monday. A crawl that has not finished a day after
// the site was added does not hold it back. Only sites never sent a
// summary; their Monday summaries start after it.
export async function sendFirstSummaries(env: Env, now = Date.now()) {
  const ready = (alias: string) =>
    `((${alias}.last_finished_at IS NOT NULL AND (${alias}.opportunities IS NOT NULL OR ${alias}.last_finished_at < ?1))
       OR ${alias}.added_at < ?2)
     AND NOT EXISTS (SELECT 1 FROM site_summaries w WHERE w.user_id = ${alias}.user_id AND w.property = ${alias}.property)`
  const due = await env.DB.prepare(
    `SELECT s.user_id, s.property FROM audit_sites s
     WHERE s.user_id IN (
       SELECT DISTINCT d.user_id FROM audit_sites d
       WHERE ${hasWeeklyAudit('d.user_id')} AND ${ready('d')}
       ORDER BY d.user_id LIMIT ?3)
       AND ${ready('s')}
     ORDER BY s.user_id, s.property`,
  )
    .bind(now - FIRST_WAIT_MS, now - FIRST_LATEST_MS, ACCOUNTS_PER_TICK)
    .all<{ user_id: string; property: string }>()
  for (const [userId, properties] of byAccount(due.results)) {
    await sendSummaries(env, userId, properties, now, lastSevenDays(now), true)
  }
}

// Builds one account's week once and queues one summary for each of the
// named sites, each once: its row in site_summaries is claimed first (the
// window's Monday, or "first"). A Monday summary also carries its site's
// part of the day's index roundup.
async function sendSummaries(
  env: Env,
  userId: string,
  properties: string[],
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
  for (const site of withUpdates.sites) {
    if (!properties.includes(site.property)) continue
    const data = {
      ...withUpdates,
      sites: [site],
      index_changes: (unsent?.sites ?? []).filter(
        (changes) => changes.property === site.property,
      ),
      ...(first ? { first: true } : {}),
    }
    const claimed = await env.DB.prepare(
      `INSERT INTO site_summaries (user_id, property, week, sent_at) VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING RETURNING week`,
    )
      .bind(userId, site.property, first ? 'first' : week.start, now)
      .first()
    if (!claimed) continue
    const queued = await queueAlert(
      env,
      { userId, type: 'weekly-summary', site: site.property, data },
      now,
    ).catch(() => null)
    if (queued && unsent) await unsent.markSent([site.property])
  }
}
