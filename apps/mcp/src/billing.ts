import type { ChoosePlan, StartAudit } from '@seo/core/commands'
import { readJsonOrUndefined } from '@seo/core/hosted'
import { addAuditSite, siteLimit } from './audit/schedule.ts'
import { betaFlags } from './beta.ts'
import { unlockCreditWithCard } from './credit.ts'
import { accountUrl } from './google.ts'
import { addTopUp, isPlan, TOP_UPS } from './meter.ts'

// The paid weekly audit, and the usage plans that replace it.
//
// The per-site plan: one Stripe price per site a month, bought as a
// quantity. Stripe Checkout takes the first payment and Stripe's billing
// portal changes the number of sites or cancels.
//
// The usage plans (meter.ts), once STRIPE_PLAN_PRICES is set: one monthly
// price per plan for the whole account, with unlimited sites and included
// research usage, top-ups bought through Checkout, and auto-reload charged
// off-session. An account keeps at most one subscription, per-site or plan.
//
// Stripe's signed webhook is the only writer of the subscription fields of
// the billing table (migrations/0011_billing.sql, 0026_plans.sql), apart
// from a plan change, which follows Stripe's answer at once. An account
// with an active subscription gets the weekly-audit flag (beta.ts).

// The price shown on the account page; the charge itself is Stripe's price.
export const PRICE_PER_SITE_USD = 50
export const MAX_PAID_SITES = 100
// Sites a usage plan may audit: "unlimited" to people, bounded here.
export const MAX_PLAN_SITES = 500

// Stripe statuses that keep the audit running. past_due keeps it while
// Stripe retries the card; Stripe then cancels, which stops it.
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const
export const ACTIVE_SQL = `(${ACTIVE_STATUSES.map((status) => `'${status}'`).join(', ')})`
const isActive = (status: string | null | undefined) =>
  (ACTIVE_STATUSES as readonly (string | null | undefined)[]).includes(status)

// Signed events older than this are refused, so a captured one cannot be
// replayed later.
const TOLERANCE_S = 5 * 60
const MICRO = 1_000_000
// meter.ts asks for a reload when top-ups fall below this (micro-USD).
const RELOAD_BELOW = 2 * MICRO
// The highest monthly auto-reload cap the account page takes, in US dollars.
export const MAX_RELOAD_CAP = 1_000

export type Billing = {
  customer: string | null
  status: string | null
  sites: number
  active: boolean
  // The usage plan in US dollars a month, or null for the per-site plan.
  plan: number | null
  periodEnd: number | null
  autoReload: number | null
  autoReloadCap: number | null
  paymentMethod: boolean
}

// Billing is on once the price and both Stripe secrets are set.
export function billingOn(env: Env): boolean {
  return Boolean(
    env.STRIPE_PRICE_ID && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET,
  )
}

// The usage plans' Stripe prices, plan to price id, from STRIPE_PLAN_PRICES
// ("10:price_...,50:price_..."), or null while they are off: the var is
// empty, names no plan, or a Stripe secret is missing.
export function plansOn(env: Env): ReadonlyMap<number, string> | null {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null
  const prices = new Map<number, string>()
  for (const part of String(env.STRIPE_PLAN_PRICES ?? '').split(',')) {
    const [plan, price] = part.split(':').map((value) => value.trim())
    const amount = Number(plan)
    if (isPlan(amount) && price && /^price_\w+$/.test(price)) {
      prices.set(amount, price)
    }
  }
  return prices.size ? prices : null
}

// The plan a Stripe price is for, or null (the per-site price, or plans off).
function planOfPrice(env: Env, price: string | null | undefined) {
  for (const [plan, id] of plansOn(env) ?? []) if (id === price) return plan
  return null
}

export async function billingOf(
  env: Env,
  userId: string,
): Promise<Billing | null> {
  const row = await env.DB.prepare(
    `SELECT customer, status, sites, plan, period_end, auto_reload,
       auto_reload_cap, payment_method FROM billing WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{
      customer: string | null
      status: string | null
      sites: number
      plan: number | null
      period_end: number | null
      auto_reload: number | null
      auto_reload_cap: number | null
      payment_method: string | null
    }>()
  if (!row) return null
  return {
    customer: row.customer,
    status: row.status,
    sites: row.sites,
    active: isActive(row.status),
    plan: isPlan(row.plan) ? row.plan : null,
    periodEnd: row.period_end,
    autoReload: row.auto_reload,
    autoReloadCap: row.auto_reload_cap,
    paymentMethod: Boolean(row.payment_method),
  }
}

// One Stripe API call, form-encoded, bounded to 15 seconds.
export async function stripe<T>(
  env: Env,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
  // Stripe returns the first answer again for a request with the same key.
  idempotencyKey?: string,
): Promise<T> {
  const body = new URLSearchParams(params)
  const response = await fetch(
    `https://api.stripe.com/v1/${path}${method === 'GET' && body.size ? `?${body}` : ''}`,
    {
      method,
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(15_000),
    },
  )
  const json = await readJsonOrUndefined<T & { error?: { message?: string } }>(
    response,
    'Stripe',
  )
  if (!response.ok || !json) {
    throw new Error(
      `Stripe answered ${response.status}: ${json?.error?.message ?? 'no body'}`,
    )
  }
  return json
}

type Session = { id: string; url: string | null; status: string }

// The person's one Checkout session. Returns 'paid' when it was paid and
// Stripe's webhook has not arrived yet; otherwise expires it if open, so
// only the newest link can be paid.
async function closeCheckout(
  env: Env,
  id: string | null | undefined,
): Promise<'paid' | 'closed'> {
  if (!id) return 'closed'
  const session = await stripe<Session>(env, 'GET', `checkout/sessions/${id}`)
  if (session.status === 'complete') return 'paid'
  if (session.status !== 'open') return 'closed'
  try {
    await stripe(env, 'POST', `checkout/sessions/${id}/expire`)
    return 'closed'
  } catch (error) {
    // It may have been paid or expired by another request a moment ago.
    const again = await stripe<Session>(env, 'GET', `checkout/sessions/${id}`)
    if (again.status === 'complete') return 'paid'
    if (again.status === 'expired') return 'closed'
    throw error
  }
}

// Opens the person's one subscription Checkout with these params, or
// returns null when a paid one is still waiting for Stripe's webhook. Only
// the newest link can be paid: an older open one is expired first, so
// nobody pays for two subscriptions.
async function openCheckout(
  env: Env,
  userId: string,
  params: Record<string, string>,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT customer, checkout FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ customer: string | null; checkout: string | null }>()
  if ((await closeCheckout(env, row?.checkout)) === 'paid') return null
  const session = await stripe<Session>(env, 'POST', 'checkout/sessions', {
    ...params,
    ...(row?.customer ? { customer: row.customer } : {}),
  })
  // Kept only if no other request stored a session since the read above;
  // otherwise this one is expired and that one is used.
  const saved = await env.DB.prepare(
    `INSERT INTO billing (user_id, checkout, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET checkout = excluded.checkout,
       updated_at = excluded.updated_at
     WHERE billing.checkout IS ?4`,
  )
    .bind(userId, session.id, Date.now(), row?.checkout ?? null)
    .run()
  if (saved.meta.changes) return session.url
  await stripe(env, 'POST', `checkout/sessions/${session.id}/expire`)
  const winner = await env.DB.prepare(
    'SELECT checkout FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ checkout: string | null }>()
  const other = winner?.checkout
    ? await stripe<Session>(env, 'GET', `checkout/sessions/${winner.checkout}`)
    : null
  if (other?.status === 'complete') return null
  if (!other?.url) throw new Error('No Checkout session to open.')
  return other.url
}

// A Checkout page for the weekly audit on one site, the property the person
// picked, or null when a paid Checkout is still waiting for Stripe's
// webhook. The subscription carries the person's id and the property, so
// the webhook knows whose it is and adds the site once it is paid.
export async function checkoutUrl(
  env: Env,
  userId: string,
  property: string,
): Promise<string | null> {
  const home = `${env.PUBLIC_URL}/account`
  return openCheckout(env, userId, {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'subscription_data[metadata][user_id]': userId,
    'subscription_data[metadata][property]': property,
    success_url: `${home}?paid=1#sites`,
    cancel_url: `${home}#sites`,
  })
}

// A Checkout page for a usage plan, for an account without an active
// subscription, or null when a paid one is waiting for Stripe's webhook.
export async function planCheckoutUrl(
  env: Env,
  userId: string,
  plan: number,
): Promise<string | null> {
  const price = plansOn(env)?.get(plan)
  if (!price) throw new Error('No such plan.')
  const home = `${env.PUBLIC_URL}/account`
  return openCheckout(env, userId, {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[user_id]': userId,
    'metadata[plan]': String(plan),
    'subscription_data[metadata][user_id]': userId,
    'subscription_data[metadata][plan]': String(plan),
    success_url: `${home}?plan=1#plan`,
    cancel_url: `${home}#plan`,
  })
}

type StripeSubscription = Subscription & {
  schedule?: string | { id: string } | null
}

type Schedule = {
  id: string
  phases: {
    start_date: number
    end_date: number
    items: { price: string | { id: string }; quantity?: number }[]
  }[]
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null)

export type PlanChange =
  // Now: charged at once for a new period on the new plan.
  | { status: 'changed'; plan: number }
  // From the end of the current period.
  | { status: 'scheduled'; plan: number; at: number }
  // Already on it; a pending downgrade was dropped.
  | { status: 'same'; plan: number }
  | { status: 'payment_failed' }

// Changes an active subscription to a usage plan. A higher plan, or a move
// from the per-site plan, applies at once: Stripe starts a new monthly
// period, credits the unused time of the old one and charges the
// difference, and a card that fails refuses the change. A new period also
// starts the new plan's usage from full, so an upgrade late in a period
// cannot buy a whole month's extra usage for a few days' price. A lower
// plan applies from the next period, through a subscription schedule, so
// this period's usage stays as paid for.
export async function changePlan(
  env: Env,
  userId: string,
  plan: number,
): Promise<PlanChange> {
  const price = plansOn(env)?.get(plan)
  if (!price) throw new Error('No such plan.')
  const row = await env.DB.prepare(
    'SELECT subscription, status, plan, sites FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{
      subscription: string | null
      status: string | null
      plan: number | null
      sites: number
    }>()
  if (!row?.subscription || !isActive(row.status)) {
    throw new Error('No plan to change.')
  }
  const subscription = await stripe<StripeSubscription>(
    env,
    'GET',
    `subscriptions/${row.subscription}`,
  )
  const item = subscription.items?.data?.[0]
  if (!item?.id) throw new Error('The plan has no item.')
  const pending = idOf(subscription.schedule)
  const current = planOfPrice(env, item.price?.id)
  if (current === plan) {
    // Picking the current plan again drops a downgrade waiting for the
    // next period.
    if (pending) {
      await stripe(env, 'POST', `subscription_schedules/${pending}/release`)
    }
    return { status: 'same', plan }
  }
  if (current !== null && plan < current) {
    const schedule = pending
      ? await stripe<Schedule>(env, 'GET', `subscription_schedules/${pending}`)
      : await stripe<Schedule>(env, 'POST', 'subscription_schedules', {
          from_subscription: subscription.id,
        })
    const now = Date.now() / 1000
    const phase =
      schedule.phases.find(
        (item) => item.start_date <= now && item.end_date > now,
      ) ?? schedule.phases[0]
    const first = phase?.items[0]
    if (!phase || !first) throw new Error('The plan has no current period.')
    await stripe(env, 'POST', `subscription_schedules/${schedule.id}`, {
      end_behavior: 'release',
      'phases[0][items][0][price]': idOf(first.price) ?? '',
      'phases[0][items][0][quantity]': String(first.quantity ?? 1),
      'phases[0][start_date]': String(phase.start_date),
      'phases[0][end_date]': String(phase.end_date),
      'phases[1][items][0][price]': price,
      'phases[1][items][0][quantity]': '1',
      'phases[1][duration][interval]': 'month',
      'phases[1][duration][interval_count]': '1',
      'phases[1][metadata][plan]': String(plan),
    })
    return { status: 'scheduled', plan, at: phase.end_date * 1000 }
  }
  if (pending) {
    await stripe(env, 'POST', `subscription_schedules/${pending}/release`)
  }
  let changed: Subscription
  try {
    changed = await stripe<Subscription>(
      env,
      'POST',
      `subscriptions/${subscription.id}`,
      {
        'items[0][id]': item.id,
        'items[0][price]': price,
        'items[0][quantity]': '1',
        billing_cycle_anchor: 'now',
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        'metadata[plan]': String(plan),
      },
    )
  } catch (error) {
    console.error('billing: changing the plan failed', error)
    return { status: 'payment_failed' }
  }
  // The new plan's usage applies before Stripe's webhook arrives.
  await env.DB.prepare(
    `UPDATE billing SET plan = ?2, sites = 0, status = ?3,
       period_end = COALESCE(?4, period_end), updated_at = ?5
     WHERE user_id = ?1 AND subscription = ?6`,
  )
    .bind(
      userId,
      plan,
      changed.status,
      periodEndOf(changed),
      Date.now(),
      changed.id,
    )
    .run()
  return { status: 'changed', plan }
}

// Moves the account to a usage plan for seo_sites, with no page to open
// once a plan has a saved card: changePlan charges it. The first plan is a
// Stripe Checkout link, since Stripe needs a card once.
export async function choosePlan(
  env: Env,
  userId: string,
  plan: number,
): Promise<ChoosePlan> {
  if (!plansOn(env)?.has(plan)) throw new Error('No such plan.')
  if (!(await billingOf(env, userId))?.active) {
    const url = await planCheckoutUrl(env, userId, plan)
    return url ? { status: 'checkout', plan, url } : { status: 'pending' }
  }
  const changed = await changePlan(env, userId, plan)
  return changed.status === 'scheduled'
    ? { ...changed, at: new Date(changed.at).toISOString() }
    : changed
}

// Buys one top-up for seo_sites: charged to the plan's saved card at once,
// or a Checkout link when no card is saved or the charge needs the person
// (such as 3D Secure). The webhook ignores payment intents, so the top-up
// is added here, once per intent. The same amount asked for twice in one
// minute, such as an agent retrying, is charged once.
export async function buyTopUp(
  env: Env,
  userId: string,
  usd: number,
): Promise<{ status: 'added' } | { status: 'checkout'; url: string }> {
  if (!(TOP_UPS as readonly number[]).includes(usd)) {
    throw new Error('No such top-up.')
  }
  const row = await env.DB.prepare(
    'SELECT customer, status, plan, payment_method FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{
      customer: string | null
      status: string | null
      plan: number | null
      payment_method: string | null
    }>()
  if (!row || !isActive(row.status) || !isPlan(row.plan)) {
    throw new Error('Top-ups need a plan.')
  }
  const checkout = async () => ({
    status: 'checkout' as const,
    url: await topUpCheckoutUrl(env, userId, usd),
  })
  if (!row.customer || !row.payment_method) return checkout()
  const intent = await stripe<{ id: string; status: string }>(
    env,
    'POST',
    'payment_intents',
    {
      amount: String(usd * 100),
      currency: 'usd',
      customer: row.customer,
      payment_method: row.payment_method,
      off_session: 'true',
      confirm: 'true',
      description: 'SEO Skill usage top-up',
      'metadata[user_id]': userId,
      'metadata[purpose]': 'topup',
      'metadata[usd]': String(usd),
    },
    `topup-${userId}-${usd}-${Math.floor(Date.now() / 60_000)}`,
  ).catch((error: unknown) => {
    console.error('billing: top-up charge failed', error)
    return null
  })
  if (intent?.status !== 'succeeded') return checkout()
  await addTopUpOnce(env, userId, usd, intent.id)
  return { status: 'added' }
}

// Cancels the plan at the end of its period, or undoes that, for seo_sites.
// Returns when the plan ends, or null when it renews.
export async function setPlanCancel(
  env: Env,
  userId: string,
  cancel: boolean,
): Promise<number | null> {
  const row = await env.DB.prepare(
    'SELECT subscription, status FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ subscription: string | null; status: string | null }>()
  if (!row?.subscription || !isActive(row.status)) {
    throw new Error('No plan to cancel.')
  }
  const changed = await stripe<Subscription>(
    env,
    'POST',
    `subscriptions/${row.subscription}`,
    { cancel_at_period_end: cancel ? 'true' : 'false' },
  )
  return cancel ? periodEndOf(changed) : null
}

// A Checkout page that buys one top-up, for an account with an active plan.
export async function topUpCheckoutUrl(
  env: Env,
  userId: string,
  usd: number,
): Promise<string> {
  if (!(TOP_UPS as readonly number[]).includes(usd)) {
    throw new Error('No such top-up.')
  }
  const paid = await billingOf(env, userId)
  if (!paid?.active || paid.plan === null) {
    throw new Error('Top-ups need a plan.')
  }
  const home = `${env.PUBLIC_URL}/account`
  const session = await stripe<Session>(env, 'POST', 'checkout/sessions', {
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(usd * 100),
    'line_items[0][price_data][product_data][name]': 'SEO Skill usage top-up',
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    'metadata[user_id]': userId,
    'metadata[purpose]': 'topup',
    'metadata[usd]': String(usd),
    success_url: `${home}?topup=1#plan`,
    cancel_url: `${home}#plan`,
    ...(paid.customer ? { customer: paid.customer } : {}),
  })
  if (!session.url) throw new Error('No Checkout session to open.')
  return session.url
}

// Saves the account's auto-reload: a top-up amount (or null for off) and the
// most it may buy in a calendar month (UTC), in US dollars.
export async function setAutoReload(
  env: Env,
  userId: string,
  amount: number | null,
  cap: number,
): Promise<void> {
  const on = amount !== null && (TOP_UPS as readonly number[]).includes(amount)
  await env.DB.prepare(
    'UPDATE billing SET auto_reload = ?2, auto_reload_cap = ?3, updated_at = ?4 WHERE user_id = ?1',
  )
    .bind(
      userId,
      on ? amount : null,
      on ? Math.min(MAX_RELOAD_CAP, Math.max(amount, Math.floor(cap))) : null,
      Date.now(),
    )
    .run()
}

// Adds a paid top-up once per Stripe id (a Checkout session or payment
// intent), however often Stripe sends the event. Returns whether it added.
export async function addTopUpOnce(
  env: Env,
  userId: string,
  usd: number,
  stripeId: string,
): Promise<boolean> {
  const claimed = await env.DB.prepare(
    'INSERT OR IGNORE INTO topups (id, user_id, usd, at) VALUES (?, ?, ?, ?)',
  )
    .bind(stripeId, userId, usd, Date.now())
    .run()
  if (!claimed.meta.changes) return false
  try {
    await addTopUp(env, userId, usd)
  } catch (error) {
    // Unclaimed again, so Stripe's retry adds it.
    await env.DB.prepare('DELETE FROM topups WHERE id = ?').bind(stripeId).run()
    throw error
  }
  return true
}

// Buys the account's auto-reload top-up when meter.charge says top-ups ran
// low: only with auto-reload on, an active plan and a saved card, and while
// this UTC month's reloads stay within the cap. The top-up is added in the
// same statement that checks all that, so two calls at once buy one; then
// the card is charged off-session, and a failed charge (or one that needs
// the person, such as 3D Secure) takes the top-up back and turns
// auto-reload off. The webhook leaves these payments alone, so nothing is
// added twice. Never throws.
export async function autoReload(env: Env, userId: string): Promise<void> {
  try {
    if (!plansOn(env)) return
    const row = await env.DB.prepare(
      `SELECT customer, status, plan, auto_reload, auto_reload_cap, payment_method
       FROM billing WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{
        customer: string | null
        status: string | null
        plan: number | null
        auto_reload: number | null
        auto_reload_cap: number | null
        payment_method: string | null
      }>()
    const amount = row?.auto_reload ?? 0
    if (
      !row?.customer ||
      !row.payment_method ||
      !isActive(row.status) ||
      !isPlan(row.plan) ||
      !(TOP_UPS as readonly number[]).includes(amount)
    ) {
      return
    }
    const month = new Date().toISOString().slice(0, 7)
    const reserved = await env.DB.prepare(
      `UPDATE balances SET topup = topup + ?2,
         reloaded = (CASE WHEN reload_month IS ?3 THEN reloaded ELSE 0 END) + ?4,
         reload_month = ?3, updated_at = ?5
       WHERE user_id = ?1 AND topup < ?6
         AND (CASE WHEN reload_month IS ?3 THEN reloaded ELSE 0 END) + ?4 <= ?7
       RETURNING reloaded`,
    )
      .bind(
        userId,
        amount * MICRO,
        month,
        amount,
        Date.now(),
        RELOAD_BELOW,
        row.auto_reload_cap ?? 0,
      )
      .first<{ reloaded: number }>()
    if (!reserved) return
    const key = `reload-${userId}-${month}-${reserved.reloaded}`
    const pay = () =>
      stripe<{ id: string; status: string }>(
        env,
        'POST',
        'payment_intents',
        {
          amount: String(amount * 100),
          currency: 'usd',
          customer: row.customer ?? '',
          payment_method: row.payment_method ?? '',
          off_session: 'true',
          confirm: 'true',
          description: 'SEO Skill usage top-up (auto-reload)',
          'metadata[user_id]': userId,
          'metadata[purpose]': 'topup',
          'metadata[usd]': String(amount),
          'metadata[auto_reload]': '1',
        },
        key,
      )
    // A timeout may hide a charge that went through: the same key asks
    // Stripe for the first answer instead of charging again.
    const intent = await pay()
      .catch(pay)
      .catch((error: unknown) => {
        console.error('billing: auto-reload charge failed', error)
        return null
      })
    if (intent?.status === 'succeeded') return
    await env.DB.prepare(
      `UPDATE balances SET topup = topup - ?2,
         reloaded = MAX(0, reloaded - ?3), updated_at = ?4
       WHERE user_id = ?1 AND reload_month IS ?5`,
    )
      .bind(userId, amount * MICRO, amount, Date.now(), month)
      .run()
    await env.DB.prepare(
      'UPDATE billing SET auto_reload = NULL, updated_at = ? WHERE user_id = ?',
    )
      .bind(Date.now(), userId)
      .run()
  } catch (error) {
    console.error('billing: auto-reload failed', error)
  }
}

// Sets the number of sites an active plan pays for. More sites are charged
// at once for the rest of the month, and a card that fails refuses the
// change; fewer sites apply from the next bill. The row follows at once so
// the new limit holds before Stripe's webhook arrives.
export async function setPaidSites(
  env: Env,
  userId: string,
  sites: number,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT subscription, sites FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ subscription: string | null; sites: number }>()
  if (!row?.subscription) throw new Error('No plan to change.')
  const wanted = Math.min(MAX_PAID_SITES, Math.max(1, sites))
  if (wanted === row.sites) return
  const subscription = await stripe<{ items: { data: { id: string }[] } }>(
    env,
    'GET',
    `subscriptions/${row.subscription}`,
  )
  const item = subscription.items.data[0]?.id
  if (!item) throw new Error('The plan has no site item.')
  await stripe(env, 'POST', `subscriptions/${row.subscription}`, {
    'items[0][id]': item,
    'items[0][quantity]': String(wanted),
    proration_behavior: wanted > row.sites ? 'always_invoice' : 'none',
    payment_behavior: 'error_if_incomplete',
  })
  await env.DB.prepare(
    'UPDATE billing SET sites = ?, updated_at = ? WHERE user_id = ?',
  )
    .bind(wanted, Date.now(), userId)
    .run()
}

// Starts the weekly audit of a property the person's Google accounts can
// read, for the Sites tab and seo_sites. A usage plan audits up to
// MAX_PLAN_SITES. Without one, and with the usage plans on, it points to
// the account page to pick a plan; with them off it is a Checkout link for
// that site. A full per-site plan grows by one site, charged now.
export async function startAuditSite(
  env: Env,
  userId: string,
  property: string,
): Promise<StartAudit> {
  const [flags, paid] = await Promise.all([
    betaFlags(env, userId),
    billingOf(env, userId),
  ])
  const audits = flags.has('weekly-audit')
  const plans = plansOn(env)
  const pickPlan = (): StartAudit => ({
    status: 'plan',
    url: `${accountUrl(env)}#plan`,
    price: Math.min(...(plans?.keys() ?? [10])),
  })
  const checkout = async (): Promise<StartAudit> => {
    if (plans) return pickPlan()
    const url = await checkoutUrl(env, userId, property)
    return url
      ? { status: 'checkout', url, price: PRICE_PER_SITE_USD }
      : { status: 'pending' }
  }
  if (!audits) {
    if (!billingOn(env) && !plans) return { status: 'full', limit: 0 }
    return checkout()
  }
  let added = await addAuditSite(env, userId, property)
  if (added === 'full' && !paid?.active && (plans || billingOn(env))) {
    return checkout()
  }
  // Only the per-site plan grows; a usage plan's limit is MAX_PLAN_SITES.
  if (
    added === 'full' &&
    paid?.active &&
    paid.plan === null &&
    billingOn(env)
  ) {
    try {
      await setPaidSites(env, userId, paid.sites + 1)
    } catch (error) {
      console.error('billing: adding a site failed', error)
      return { status: 'payment_failed' }
    }
    added = await addAuditSite(env, userId, property)
  }
  return added === 'full'
    ? { status: 'full', limit: await siteLimit(env, userId) }
    : { status: added }
}

// Stripe's billing portal, where the person changes the number of sites,
// updates the card, reads invoices or cancels.
export async function portalUrl(
  env: Env,
  customer: string,
  back = 'sites',
): Promise<string> {
  const session = await stripe<{ url: string }>(
    env,
    'POST',
    'billing_portal/sessions',
    { customer, return_url: `${env.PUBLIC_URL}/account#${back}` },
  )
  return session.url
}

// Ends a deleted person's subscription at once, so Stripe stops charging.
export async function cancelBilling(env: Env, userId: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT subscription, status, checkout FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{
      subscription: string | null
      status: string | null
      checkout: string | null
    }>()
  // An open Checkout could still be paid after the account is gone.
  await closeCheckout(env, row?.checkout)
  if (!row?.subscription || row.status === 'canceled') return
  await stripe(env, 'DELETE', `subscriptions/${row.subscription}`)
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

// Whether a webhook body carries a valid Stripe-Signature for the secret:
// t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">, within the tolerance.
export async function verifyStripeSignature(
  body: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map((part) => part.split('=', 2))
  const t = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value ?? '')
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false
  if (Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = hex(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${t}.${body}`),
    ),
  )
  // Compares every candidate in full, so timing says nothing about a match.
  let match = false
  for (const signature of signatures) {
    let diff = signature.length ^ expected.length
    for (let index = 0; index < expected.length; index += 1) {
      diff |= expected.charCodeAt(index) ^ (signature.charCodeAt(index) || 0)
    }
    if (diff === 0) match = true
  }
  return match
}

type Subscription = {
  id: string
  customer: string
  status: string
  metadata?: { user_id?: string; property?: string; plan?: string }
  // Stripe API versions before 2025-03-31 keep the period here; later ones
  // on each item.
  current_period_end?: number
  default_payment_method?: string | { id: string } | null
  items?: {
    data?: {
      id?: string
      quantity?: number
      current_period_end?: number
      price?: { id?: string }
    }[]
  }
}

// When the subscription's current period ends, in ms, from either place
// Stripe puts it.
export function periodEndOf(subscription: Subscription): number | null {
  const seconds =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end
  return typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : null
}

type CheckoutSession = {
  id: string
  mode?: string
  status?: string
  payment_status?: string
  amount_total?: number | null
  setup_intent?: string | { id: string } | null
  metadata?: { user_id?: string; purpose?: string; usd?: string }
}

// A finished Checkout: a top-up adds its amount once; a card saved for the
// free credit unlocks it. Plan Checkouts are handled by their subscription
// events.
async function checkoutCompleted(
  env: Env,
  session: CheckoutSession,
): Promise<void> {
  const userId = session.metadata?.user_id
  if (!userId) return
  if (session.mode === 'payment' && session.metadata?.purpose === 'topup') {
    const usd = Number(session.metadata.usd)
    // Only a paid top-up of one of the amounts sold, for what it cost.
    if (
      session.payment_status !== 'paid' ||
      !(TOP_UPS as readonly number[]).includes(usd) ||
      session.amount_total !== usd * 100
    ) {
      return
    }
    const exists = await env.DB.prepare('SELECT 1 AS n FROM users WHERE id = ?')
      .bind(userId)
      .first()
    if (exists) await addTopUpOnce(env, userId, usd, session.id)
    return
  }
  if (session.mode === 'setup' && session.metadata?.purpose === 'credit') {
    const intent = idOf(session.setup_intent)
    if (intent) await unlockCreditWithCard(env, userId, intent)
  }
}

// Stripe's webhook: keeps the billing row in step with the subscription,
// adds paid top-ups and unlocks a free credit held for a card. Any other
// event, or one for a person who no longer exists, is acknowledged and
// ignored. Auto-reload adds its own top-ups (autoReload), so its payment
// events change nothing here.
export async function stripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.text()
  if (
    !(await verifyStripeSignature(
      body,
      request.headers.get('stripe-signature'),
      env.STRIPE_WEBHOOK_SECRET,
    ))
  ) {
    return new Response('Bad signature', { status: 400 })
  }
  const event = JSON.parse(body) as {
    type?: string
    data?: {
      object?: Subscription
      previous_attributes?: { status?: string }
    }
  }
  if (event.type === 'checkout.session.completed' && event.data?.object) {
    await checkoutCompleted(
      env,
      event.data.object as unknown as CheckoutSession,
    )
    return new Response('ok')
  }
  const subscription = event.data?.object
  if (!event.type?.startsWith('customer.subscription.') || !subscription) {
    return new Response('ok')
  }
  const userId = subscription.metadata?.user_id
  if (!userId) return new Response('ok')
  const status =
    event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : subscription.status
  const item = subscription.items?.data?.[0]
  // A usage plan, from the subscription's price; the per-site price, and
  // any price while the plans are off, is the per-site plan (NULL).
  const plan = planOfPrice(env, item?.price?.id)
  const sites =
    plan === null
      ? Math.min(MAX_PAID_SITES, Math.max(0, item?.quantity ?? 0))
      : 0
  // Only for a person who still exists; a later event for an older
  // subscription of the same person does not overwrite a newer one.
  const saved = await env.DB.prepare(
    `INSERT INTO billing (user_id, customer, subscription, status, sites, updated_at, paid_at,
       plan, period_end, payment_method)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN ?4 IN ${ACTIVE_SQL} THEN ?6 END, ?7, ?8, ?9
     WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1)
     ON CONFLICT (user_id) DO UPDATE SET customer = excluded.customer,
       subscription = excluded.subscription, status = excluded.status,
       sites = excluded.sites, checkout = NULL, updated_at = excluded.updated_at,
       paid_at = COALESCE(billing.paid_at, excluded.paid_at),
       plan = excluded.plan, period_end = excluded.period_end,
       payment_method = COALESCE(excluded.payment_method, billing.payment_method)
     WHERE billing.subscription IS NULL OR billing.subscription = excluded.subscription
       OR billing.status NOT IN ${ACTIVE_SQL}`,
  )
    .bind(
      userId,
      subscription.customer,
      subscription.id,
      status,
      sites,
      Date.now(),
      plan,
      periodEndOf(subscription),
      idOf(subscription.default_payment_method),
    )
    .run()
  // The site picked at Checkout starts once the plan first becomes active:
  // on creation, or when a payment that needed confirming goes through.
  // Later events leave it alone, so a site removed since is not re-added.
  const started =
    (event.type === 'customer.subscription.created' ||
      event.data?.previous_attributes?.status === 'incomplete') &&
    (status === 'active' || status === 'trialing')
  const property = subscription.metadata?.property
  if (saved.meta.changes && started && property) {
    await addAuditSite(env, userId, property)
  }
  return new Response('ok')
}
