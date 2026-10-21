// A weekly count of where new hosted sign-ups came from, sent to Ian's
// Telegram chat by the cron trigger. Counts only, the same groupings as
// scripts/signups.mjs, never a row for one person.

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

const line = (title: string, rows: Count[]) =>
  rows.length
    ? `${title}: ${rows.map((row) => `${row.name} ${row.n}`).join(', ')}`
    : ''

export async function signupReport(db: D1Database, now: Date): Promise<string> {
  const since = now.getTime() - DAYS * 86_400_000
  const total = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM signup_sources WHERE created_at >= ?1) AS week,
         (SELECT COUNT(*) FROM users) AS people`,
    )
    .bind(since)
    .first<{ week: number; people: number }>()
  const from = new Date(since).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)
  const head = `SEO Skill sign-ups, ${from} to ${to} (UTC): ${total?.week ?? 0}. People in total: ${total?.people ?? 0}.`
  if (!total?.week) return head
  const [entry, client, referrer, landing, utm] = await Promise.all([
    counts(db, 'entry', since),
    counts(db, "COALESCE(client_name, client, '(unknown)')", since),
    counts(
      db,
      "CASE WHEN landing_path IS NULL THEN '(no site visit)' WHEN referrer_host IS NULL THEN '(direct)' ELSE referrer_host END",
      since,
    ),
    counts(db, 'landing_path', since),
    counts(
      db,
      "utm_source || COALESCE('/' || utm_medium, '') || COALESCE('/' || utm_campaign, '')",
      since,
    ),
  ])
  return [
    head,
    line('By entry', entry),
    line('By client', client),
    line('By referrer', referrer),
    line('By landing page', landing),
    line('By utm', utm),
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
