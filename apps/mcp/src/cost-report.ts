// What SEO Skill costs to run and what the paid weekly audit brings in, for
// Ian's Telegram (migrations/0016_cost_report.sql). The hourly cron reads
// the DataForSEO balance, saves the first reading of each UTC day, and
// alerts once a day when the balance is low or the Cloudflare estimate is
// high. The Monday cron sends the weekly report: totals only, never a row
// for one person.

import { dataForSeoList } from '@seo/core/commands'
import { ACTIVE_SQL, PRICE_PER_SITE_USD } from './billing.ts'
import {
  CLOUDFLARE_ALERT_USD,
  cloudflareLines,
  cloudflareUsage,
} from './cloudflare-usage.ts'
import { sendTelegram } from './signup-report.ts'

export const LOW_BALANCE_USD = 100
const DAYS = 7
const DAY_MS = 86_400_000
const KEEP_DAYS = 60

const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const count = (value: number) => value.toLocaleString('en-GB')
const accounts = (n: number) => `${count(n)} account${n === 1 ? '' : 's'}`
const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)
const utcTime = (at: number) =>
  `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`

type Money = { spent: number; balance: number }

// SEO Skill's own DataForSEO account: lifetime spend and balance, or null
// when its keys are not set. The call is free.
async function dataForSeoMoney(env: Env): Promise<Money | null> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return null
  const [user] = await dataForSeoList(
    [env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD],
    'v3/appendix/user_data',
  )
  const money = (user as { money?: { total?: unknown; balance?: unknown } })
    ?.money
  if (typeof money?.total !== 'number' || typeof money.balance !== 'number') {
    throw new Error('DataForSEO sent no balance')
  }
  return { spent: money.total - money.balance, balance: money.balance }
}

// Sends text once for (kind, day): claims the alert first so two runs
// cannot both send it, and lets it go when Telegram fails so the next hour
// tries again.
async function alertOnce(
  env: Env,
  kind: string,
  at: number,
  text: string,
): Promise<void> {
  const day = utcDay(at)
  const claimed = await env.DB.prepare(
    'INSERT INTO cost_alerts (kind, day, sent_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(kind, day, at)
    .run()
  if (!claimed.meta.changes) return
  try {
    await sendTelegram(env, async () => text)
  } catch (error) {
    await env.DB.prepare('DELETE FROM cost_alerts WHERE kind = ? AND day = ?')
      .bind(kind, day)
      .run()
    throw error
  }
}

// The hourly cron: today's DataForSEO reading and the two alerts. Each part
// fails on its own.
export async function checkCosts(env: Env, at: number): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return
  const oldest = utcDay(at - KEEP_DAYS * DAY_MS)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM dataforseo_days WHERE day < ?').bind(oldest),
    env.DB.prepare('DELETE FROM cost_alerts WHERE day < ?').bind(oldest),
  ])
  const results = await Promise.allSettled([
    (async () => {
      const money = await dataForSeoMoney(env)
      if (!money) return
      await env.DB.prepare(
        `INSERT INTO dataforseo_days (day, read_at, spent, balance)
         VALUES (?, ?, ?, ?) ON CONFLICT (day) DO NOTHING`,
      )
        .bind(utcDay(at), at, money.spent, money.balance)
        .run()
      if (money.balance < LOW_BALANCE_USD) {
        await alertOnce(
          env,
          'dataforseo_balance',
          at,
          `SEO Skill's DataForSEO balance is low: ${usd(money.balance)}, below ${usd(LOW_BALANCE_USD)}. Top up at https://app.dataforseo.com/payments`,
        )
      }
    })(),
    (async () => {
      const cloudflare = await cloudflareUsage(env, at)
      if (
        cloudflare.available &&
        cloudflare.estimatedUsd > CLOUDFLARE_ALERT_USD
      ) {
        await alertOnce(
          env,
          'cloudflare',
          at,
          [
            `Cloudflare cost estimate is above ${usd(CLOUDFLARE_ALERT_USD)}`,
            ...cloudflareLines(cloudflare),
          ].join('\n'),
        )
      }
    })(),
  ])
  for (const result of results) {
    if (result.status === 'rejected') console.error('cost check', result.reason)
  }
}

type UsageRow = { kind: string; amount: number; accounts: number }

// One line per metered kind, in the order and units a person reads them.
const USAGE_LINES: [string, (row: UsageRow) => string][] = [
  [
    'included_dataforseo_microusd',
    (row) =>
      `Weekly audit competitor check on SEO Skill's DataForSEO: ${usd(row.amount / 1e6)}, ${accounts(row.accounts)}`,
  ],
  [
    'included_typesafe_microusd',
    (row) =>
      `Internal linking tool on SEO Skill's TypeSafe key: ${usd(row.amount / 1e6)}, ${accounts(row.accounts)}`,
  ],
  [
    'browser_run_ms',
    (row) =>
      `Weekly audit Browser Run: ${count(row.amount / 60_000)} minutes, ${accounts(row.accounts)}`,
  ],
  [
    'browser_run_pages',
    (row) => `Weekly audit pages sent to Browser Run: ${count(row.amount)}`,
  ],
  [
    'url_inspections',
    (row) =>
      `Google URL Inspection checks: ${count(row.amount)}, ${accounts(row.accounts)}`,
  ],
  [
    'internal_links_free_runs',
    (row) =>
      `Internal linking tool free runs: ${count(row.amount)}, ${accounts(row.accounts)}`,
  ],
  [
    'internal_links_pages',
    (row) => `Internal linking tool pages fetched: ${count(row.amount)}`,
  ],
  [
    'research_dataforseo_calls',
    (row) =>
      `seo_research on people's own DataForSEO keys: ${count(row.amount)} calls, ${accounts(row.accounts)}`,
  ],
  [
    'research_ahrefs_calls',
    (row) =>
      `seo_research on people's own Ahrefs keys: ${count(row.amount)} calls, ${accounts(row.accounts)}`,
  ],
]

async function dataForSeoLines(env: Env, now: number): Promise<string[]> {
  let money: Money | null
  try {
    money = await dataForSeoMoney(env)
  } catch {
    return ['DataForSEO balance: could not be read.']
  }
  if (!money) return ['DataForSEO: no DATAFORSEO_LOGIN and PASSWORD set.']
  // The latest reading at least 7 days old, or else the oldest there is.
  const start = await env.DB.prepare(
    `SELECT read_at, spent FROM dataforseo_days
     ORDER BY read_at <= ?1 DESC,
       CASE WHEN read_at <= ?1 THEN -read_at ELSE read_at END
     LIMIT 1`,
  )
    .bind(now - DAYS * DAY_MS)
    .first<{ read_at: number; spent: number }>()
  return [
    `DataForSEO balance: ${usd(money.balance)}`,
    start
      ? `DataForSEO spent since ${utcTime(start.read_at)}: ${usd(Math.max(0, money.spent - start.spent))}. This is the whole DataForSEO login: the site's free tools, the weekly audit and anything else that uses it.`
      : 'DataForSEO spent: not known yet. The hourly check saves its first reading today.',
  ]
}

export async function costReport(env: Env, now: Date): Promise<string> {
  const at = now.getTime()
  const to = utcDay(at)
  const from = utcDay(at - DAYS * DAY_MS)
  const [dataforseo, cloudflare, usage, paid] = await Promise.all([
    dataForSeoLines(env, at),
    cloudflareUsage(env, at),
    env.DB.prepare(
      `SELECT kind, SUM(amount) AS amount, COUNT(DISTINCT user_id) AS accounts
       FROM usage WHERE day >= ? AND day < ? GROUP BY kind ORDER BY kind`,
    )
      .bind(from, to)
      .all<UsageRow>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS accounts, COALESCE(SUM(sites), 0) AS sites,
         COALESCE(SUM(status = 'past_due'), 0) AS past_due
       FROM billing WHERE status IN ${ACTIVE_SQL}`,
    ).first<{ accounts: number; sites: number; past_due: number }>(),
  ])
  const byKind = new Map(usage.results.map((row) => [row.kind, row]))
  const used = USAGE_LINES.flatMap(([kind, line]) => {
    const row = byKind.get(kind)
    return row ? [`- ${line(row)}`] : []
  })
  const paidAccounts = paid?.accounts ?? 0
  const sites = paid?.sites ?? 0
  return [
    'SEO Skill costs and revenue',
    ...dataforseo,
    '',
    `Metered use, ${from} to ${to} (UTC days, last day not included; deleted accounts drop out):`,
    ...(used.length ? used : ['- None recorded.']),
    '',
    `Paid weekly audit now: ${accounts(paidAccounts)}${paid?.past_due ? ` (${count(paid.past_due)} past due)` : ''}, ${count(sites)} sites, ${usd(sites * PRICE_PER_SITE_USD)} a month at list price, before Stripe fees, discounts and tax.`,
    '',
    ...cloudflareLines(cloudflare),
  ].join('\n')
}

export function sendCostReport(env: Env, now: Date): Promise<void> {
  return sendTelegram(env, () => costReport(env, now))
}
