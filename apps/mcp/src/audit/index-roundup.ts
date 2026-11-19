import { searchConsoleDay } from '@seo/core/commands'
import { queueAlert } from '../alerts/deliver.ts'
import { type IndexSiteChanges, MAX_LISTED } from '../alerts/registry.ts'
import { hasWeeklyAudit } from '../beta.ts'
import { auditSites, siteObject } from './schedule.ts'

// The daily Google index roundup: from the first hourly tick of each Search
// Console day (Pacific time), once the day before has spent its checks, one
// index-changes alert per site with changes, like the weekly summary, with
// that site's drops and newly indexed pages not sent yet. index_roundups
// records each account's day before its alerts are queued, so its sites
// are read once a day; a site's pages are marked sent only once its alert
// is queued, so a failure carries them to the next day. Those marks keep a
// page from going out twice, so the day needs no record per site. On a
// Monday the weekly summary carries them instead (audit/week.ts).

const ACCOUNTS_PER_TICK = 25

// Monday's roundup goes in the weekly summary.
export const isMonday = (day: string) =>
  new Date(`${day}T00:00:00Z`).getUTCDay() === 1

// Every site's index changes not sent yet (only sites with changes), and
// how to mark them sent once an alert with them is queued: every site's, or
// only the named ones'.
export async function unsentIndexChanges(env: Env, userId: string) {
  const found = await Promise.all(
    (await auditSites(env, userId)).map(async ({ property }) => {
      const site = siteObject(env, userId, property)
      const changes = await site.unalertedIndex(MAX_LISTED).catch(() => null)
      if (!changes || changes.upto === null) return null
      const { upto, ...rest } = changes
      return { site, upto, changes: { property, ...rest } }
    }),
  )
  const changed = found.filter((item) => item !== null)
  return {
    sites: changed.map((item): IndexSiteChanges => item.changes),
    markSent: (properties?: string[]) =>
      Promise.all(
        changed
          .filter(
            (item) => !properties || properties.includes(item.changes.property),
          )
          .map(({ site, upto }) =>
            site.markIndexAlerted(upto).catch(() => null),
          ),
      ),
  }
}

export async function sendIndexRoundups(env: Env, now = Date.now()) {
  const day = searchConsoleDay(now)
  if (isMonday(day)) return
  const due = await env.DB.prepare(
    `SELECT DISTINCT s.user_id FROM audit_sites s
     WHERE ${hasWeeklyAudit('s.user_id')} AND NOT EXISTS (SELECT 1 FROM index_roundups r WHERE r.user_id = s.user_id AND r.day = ?)
     ORDER BY s.user_id LIMIT ?`,
  )
    .bind(day, ACCOUNTS_PER_TICK)
    .all<{ user_id: string }>()
  for (const { user_id: userId } of due.results) {
    const unsent = await unsentIndexChanges(env, userId).catch(() => null)
    if (!unsent) continue
    const claimed = await env.DB.prepare(
      `INSERT INTO index_roundups (user_id, day, sent_at) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING RETURNING day`,
    )
      .bind(userId, day, now)
      .first()
    if (!claimed) continue
    for (const changes of unsent.sites) {
      const queued = await queueAlert(
        env,
        {
          userId,
          type: 'index-changes',
          site: changes.property,
          data: { sites: [changes] },
        },
        now,
      ).then(
        () => true,
        () => false,
      )
      if (queued) await unsent.markSent([changes.property])
    }
  }
  await env.DB.prepare('DELETE FROM index_roundups WHERE sent_at < ?')
    .bind(now - 30 * 86_400_000)
    .run()
}
