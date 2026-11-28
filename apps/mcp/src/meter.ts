import type { Usage } from '@seo/core/commands'
import { usageNotice, usedThreshold } from '@seo/core/commands'
import { ACTIVE_SQL } from './billing.ts'
import { accountUrl } from './google.ts'

// The usage plans' balances (migrations/0026_plans.sql). Only DataForSEO
// calls on SEO Skill's own account use them, charged at what DataForSEO
// says they cost plus MARKUP. Spending takes the free credit first, then
// the plan's included usage, then top-ups. People only ever see a share
// left, a reset date and a top-up balance.

export const MARKUP = 1.3
// The plans: monthly price in US dollars to included usage in US dollars.
export const PLANS: Readonly<Record<number, number>> = {
  10: 10,
  50: 50,
  100: 100,
  200: 200,
}
// Usage, in US dollars, a usage plan pays for each site's weekly audit
// run, which covers its Cloudflare crawl, rendering and storage.
export const AUDIT_USAGE_USD = 0.1
export const TOP_UPS = [10, 25, 50] as const
export const FREE_CREDIT_USD = 1
const MICRO = 1_000_000

export const isPlan = (value: unknown): value is number =>
  typeof value === 'number' && Object.hasOwn(PLANS, value)

type Row = {
  plan: number | null
  period_end: number | null
  status: string | null
  plan_used: number | null
  topup: number | null
  credit: number | null
  notified: number | null
  balance_period: number | null
  credit_state: string | null
}

async function read(env: Env, userId: string): Promise<Row | null> {
  return env.DB.prepare(
    `SELECT b.plan, b.period_end, b.status,
       x.plan_used, x.topup, x.credit, x.notified, x.period_end AS balance_period,
       c.state AS credit_state
     FROM users u
     LEFT JOIN billing b ON b.user_id = u.id AND b.status IN ${ACTIVE_SQL} AND b.plan IS NOT NULL
     LEFT JOIN balances x ON x.user_id = u.id
     LEFT JOIN credits c ON c.user_id = u.id
     WHERE u.id = ?1`,
  )
    .bind(userId)
    .first<Row>()
}

// The plan's used amount, reset when Stripe started a new period.
const planUsed = (row: Row) =>
  row.plan && row.balance_period === row.period_end ? (row.plan_used ?? 0) : 0

function toUsage(env: Env, row: Row | null, ownKey: boolean): Usage {
  const plan = row?.plan ?? null
  const included = plan ? PLANS[plan] * MICRO : 0
  const used = row ? planUsed(row) : 0
  const planLeft = Math.max(0, included - used)
  const topup = Math.max(0, row?.topup ?? 0)
  const credit = Math.max(0, row?.credit ?? 0)
  const granted = row?.credit_state === 'granted'
  return {
    plan,
    percentLeft: plan ? Math.floor((planLeft / included) * 100) : null,
    resetsAt:
      plan && row?.period_end ? new Date(row.period_end).toISOString() : null,
    topUpUsd: Math.floor(topup / 10_000) / 100,
    creditPercentLeft: granted
      ? Math.floor((credit / (FREE_CREDIT_USD * MICRO)) * 100)
      : null,
    creditHeld:
      row?.credit_state === 'held_card'
        ? 'card'
        : row?.credit_state === 'held_site'
          ? 'site'
          : null,
    ownKey,
    empty: planLeft + topup + (granted ? credit : 0) <= 0,
    accountUrl: `${accountUrl(env)}#plan`,
  }
}

export async function usageOf(
  env: Env,
  userId: string,
  ownKey: boolean,
): Promise<Usage> {
  return toUsage(env, await read(env, userId), ownKey)
}

// The micro-USD an account may still spend, or 0.
export async function spendable(env: Env, userId: string): Promise<number> {
  const row = await read(env, userId)
  if (!row) return 0
  const included = row.plan ? PLANS[row.plan] * MICRO : 0
  return (
    Math.max(0, included - planUsed(row)) +
    Math.max(0, row.topup ?? 0) +
    (row.credit_state === 'granted' ? Math.max(0, row.credit ?? 0) : 0)
  )
}

export type Charge = {
  usage: Usage
  // A notice to add to the response, the first time this period usage
  // passed 50, 80 or 100%.
  notice: string | null
  // Top-ups ran low with auto-reload on: billing.ts buys the next one.
  reload: boolean
}

const RELOAD_BELOW = 2 * MICRO

// Charges a DataForSEO cost in US dollars, at cost plus MARKUP: the free
// credit first, then the plan, then top-ups. A call may finish past what
// was left (its cost is only known after it ran); the overrun comes off
// top-ups as a negative balance, so the next call stops.
export async function charge(
  env: Env,
  userId: string,
  costUsd: number,
  ownKey = false,
): Promise<Charge> {
  let amount = Math.max(0, Math.round(costUsd * MARKUP * MICRO))
  const row = await read(env, userId)
  if (!row) throw new Error('No such account.')
  const credit =
    row.credit_state === 'granted' ? Math.max(0, row.credit ?? 0) : 0
  const fromCredit = Math.min(amount, credit)
  amount -= fromCredit
  const included = row.plan ? PLANS[row.plan] * MICRO : 0
  const used = planUsed(row)
  const fromPlan = Math.min(amount, Math.max(0, included - used))
  amount -= fromPlan
  await env.DB.prepare(
    `INSERT INTO balances (user_id, period_end, plan_used, topup, credit, notified, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
     ON CONFLICT (user_id) DO UPDATE SET
       plan_used = CASE WHEN balances.period_end IS ?2 THEN balances.plan_used + ?3 ELSE ?3 END,
       notified = CASE WHEN balances.period_end IS ?2 THEN balances.notified ELSE 0 END,
       period_end = ?2,
       topup = balances.topup - ?7,
       credit = balances.credit - ?8,
       updated_at = ?6`,
  )
    .bind(
      userId,
      row.plan ? row.period_end : null,
      fromPlan,
      -amount,
      0,
      Date.now(),
      amount,
      fromCredit,
    )
    .run()
  const after = await read(env, userId)
  const usage = toUsage(env, after, ownKey)
  const reached = usedThreshold(usage)
  const shown = after?.notified ?? 0
  let notice: string | null = null
  if (reached > shown) {
    const claimed = await env.DB.prepare(
      'UPDATE balances SET notified = ?2 WHERE user_id = ?1 AND notified < ?2',
    )
      .bind(userId, reached)
      .run()
    if (claimed.meta.changes) notice = usageNotice(usage, reached)
  }
  return {
    usage,
    notice,
    reload: Boolean(row.plan) && (after?.topup ?? 0) < RELOAD_BELOW,
  }
}

// Adds a paid top-up, in US dollars, to the account's balance.
export async function addTopUp(
  env: Env,
  userId: string,
  usd: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO balances (user_id, topup, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET topup = balances.topup + ?2, updated_at = ?3`,
  )
    .bind(userId, Math.round(usd * MICRO), Date.now())
    .run()
}

// Puts the free credit on the account's balance. Called once, when
// credit.ts grants it.
export async function addFreeCredit(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO balances (user_id, credit, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET credit = ?2, updated_at = ?3`,
  )
    .bind(userId, FREE_CREDIT_USD * MICRO, Date.now())
    .run()
}
