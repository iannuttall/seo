// A weekly count of where new hosted sign-ups and new paid audits came
// from, sent to Ian's Telegram chat by the cron trigger. Counts only, the
// same groupings as scripts/signups.mjs, never a row for one person. A paid
// audit is counted from the day its plan first became active (billing
// paid_at), by the person's first site visit.

import { ACTIVE_SQL } from './billing.ts'

const DAYS = 7
const TOP = 5

type Count = { name: string; n: number }

async function counts(db: D1Database, column: string, since: number) {
  const { results } = await db
    .prepare(
      `SELECT ${column} AS name, COUNT(*) AS n FROM signup_sources
       WHERE created_at >= ? GROUP BY 1 HAVING name IS NOT NULL ORDER BY n DESC, 1 LIMIT ${TOP}`,
    )
    .bind(since)
    .all<Count>()
  return results
}

const REFERRER =
  "CASE WHEN landing_path IS NULL THEN '(no site visit)' WHEN referrer_host IS NULL THEN '(direct)' ELSE referrer_host END"

// New paid audits by a column of the person's sign-up source.
async function paidCounts(db: D1Database, column: string, since: number) {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(${column}, '(unknown)') AS name, COUNT(*) AS n
       FROM billing LEFT JOIN signup_sources USING (user_id)
       WHERE billing.paid_at >= ? GROUP BY 1 ORDER BY n DESC, 1 LIMIT ${TOP}`,
    )
    .bind(since)
    .all<Count>()
  return results
}

const line = (title: string, rows: Count[]) =>
  rows.length
    ? `${title}: ${rows.map((row) => `${row.name} ${row.n}`).join(', ')}`
    : ''

export async function signupReport(db: D1Database, now: Date): Promise<string> {
  const since = now.getTime() - DAYS * 86_400_000
  const total = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM signup_sources WHERE created_at >= ?1) AS week,
         (SELECT COUNT(*) FROM users) AS people,
         (SELECT COUNT(*) FROM billing WHERE paid_at >= ?1) AS paid,
         (SELECT COUNT(*) FROM billing WHERE status IN ${ACTIVE_SQL}) AS paying,
         (SELECT COALESCE(SUM(sites), 0) FROM billing WHERE status IN ${ACTIVE_SQL}) AS sites,
         (SELECT COUNT(*) FROM billing WHERE status IN ${ACTIVE_SQL} AND plan IS NOT NULL) AS plans`,
    )
    .bind(since)
    .first<{
      week: number
      people: number
      paid: number
      paying: number
      sites: number
      plans: number
    }>()
  const from = new Date(since).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)
  const head = `SEO Skill sign-ups, ${from} to ${to} (UTC): ${total?.week ?? 0}. People in total: ${total?.people ?? 0}.`
  const paidHead = `New paid audits: ${total?.paid ?? 0}. Paying now: ${total?.paying ?? 0} ${total?.paying === 1 ? 'person' : 'people'}, ${total?.sites ?? 0} ${total?.sites === 1 ? 'site' : 'sites'} on the per-site plan${total?.plans ? `, ${total.plans} on a usage plan` : ''}.`
  const [entry, client, referrer, landing, utm, paidReferrer, paidLanding] =
    await Promise.all([
      total?.week ? counts(db, 'entry', since) : [],
      total?.week
        ? counts(
            db,
            "COALESCE(client_name, client, CASE entry WHEN 'web' THEN '(website, no agent)' WHEN 'cli' THEN '(cli, agent not found)' ELSE '(unknown)' END)",
            since,
          )
        : [],
      total?.week ? counts(db, REFERRER, since) : [],
      total?.week ? counts(db, 'landing_path', since) : [],
      total?.week
        ? counts(
            db,
            "utm_source || COALESCE('/' || utm_medium, '') || COALESCE('/' || utm_campaign, '')",
            since,
          )
        : [],
      total?.paid ? paidCounts(db, REFERRER, since) : [],
      total?.paid
        ? paidCounts(db, "COALESCE(landing_path, '(no site visit)')", since)
        : [],
    ])
  return [
    head,
    line('By entry', entry),
    line('By client', client),
    line('By referrer', referrer),
    line('By landing page', landing),
    line('By utm', utm),
    paidHead,
    line('Paid by referrer', paidReferrer),
    line('Paid by landing page', paidLanding),
  ]
    .filter(Boolean)
    .join('\n')
}

// Sends text to Ian's Telegram chat when both Telegram secrets are set;
// otherwise does nothing.
export async function sendTelegram(
  env: Env,
  text: () => Promise<string>,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: await text(),
        disable_web_page_preview: true,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`Telegram answered ${response.status}`)
  }
}

export function sendSignupReport(env: Env, now: Date): Promise<void> {
  return sendTelegram(env, () => signupReport(env.DB, now))
}
