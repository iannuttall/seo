import { readJsonOrUndefined } from '@seo/core/hosted'

// The paid weekly audit: one Stripe price per site a month, bought as a
// quantity. Stripe Checkout takes the first payment and Stripe's billing
// portal changes the number of sites or cancels; Stripe's signed webhook is
// the only writer of the billing table (migrations/0011_billing.sql). An
// account with an active subscription gets the weekly-audit flag (beta.ts)
// and runs that many sites.

// The price shown on the account page; the charge itself is Stripe's price.
export const PRICE_PER_SITE_USD = 50
export const MAX_PAID_SITES = 100

// Stripe statuses that keep the audit running. past_due keeps it while
// Stripe retries the card; Stripe then cancels, which stops it.
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const
export const ACTIVE_SQL = `(${ACTIVE_STATUSES.map((status) => `'${status}'`).join(', ')})`

// Signed events older than this are refused, so a captured one cannot be
// replayed later.
const TOLERANCE_S = 5 * 60

export type Billing = {
  customer: string
  status: string | null
  sites: number
  active: boolean
}

// Billing is on once the price and both Stripe secrets are set.
export function billingOn(env: Env): boolean {
  return Boolean(
    env.STRIPE_PRICE_ID && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET,
  )
}

export async function billingOf(
  env: Env,
  userId: string,
): Promise<Billing | null> {
  const row = await env.DB.prepare(
    'SELECT customer, status, sites FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ customer: string; status: string | null; sites: number }>()
  if (!row) return null
  return {
    ...row,
    active: (ACTIVE_STATUSES as readonly (string | null)[]).includes(
      row.status,
    ),
  }
}

// One Stripe API call, form-encoded, bounded to 15 seconds.
async function stripe<T>(
  env: Env,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const body = new URLSearchParams(params)
  const response = await fetch(
    `https://api.stripe.com/v1/${path}${method === 'GET' && body.size ? `?${body}` : ''}`,
    {
      method,
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
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

// A Checkout page for the weekly audit on sites sites. The person can
// change the number there. The subscription carries the person's id, so the
// webhook knows whose it is.
export async function checkoutUrl(
  env: Env,
  userId: string,
  sites: number,
): Promise<string> {
  const existing = await billingOf(env, userId)
  const home = `${env.PUBLIC_URL}/account`
  const session = await stripe<{ url: string }>(
    env,
    'POST',
    'checkout/sessions',
    {
      mode: 'subscription',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': String(
        Math.min(MAX_PAID_SITES, Math.max(1, sites)),
      ),
      'line_items[0][adjustable_quantity][enabled]': 'true',
      'line_items[0][adjustable_quantity][minimum]': '1',
      'line_items[0][adjustable_quantity][maximum]': String(MAX_PAID_SITES),
      client_reference_id: userId,
      'subscription_data[metadata][user_id]': userId,
      success_url: `${home}?paid=1#sites`,
      cancel_url: `${home}#sites`,
      ...(existing ? { customer: existing.customer } : {}),
    },
  )
  return session.url
}

// Stripe's billing portal, where the person changes the number of sites,
// updates the card or cancels.
export async function portalUrl(env: Env, customer: string): Promise<string> {
  const session = await stripe<{ url: string }>(
    env,
    'POST',
    'billing_portal/sessions',
    { customer, return_url: `${env.PUBLIC_URL}/account#sites` },
  )
  return session.url
}

// Ends a deleted person's subscription at once, so Stripe stops charging.
export async function cancelBilling(env: Env, userId: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT subscription, status FROM billing WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ subscription: string | null; status: string | null }>()
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
  metadata?: { user_id?: string }
  items?: { data?: { quantity?: number }[] }
}

// Stripe's webhook: keeps the billing row in step with the subscription.
// Only customer.subscription.* events change anything; any other event, or
// one for a person who no longer exists, is acknowledged and ignored.
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
    data?: { object?: Subscription }
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
  const sites = Math.min(
    MAX_PAID_SITES,
    Math.max(0, subscription.items?.data?.[0]?.quantity ?? 0),
  )
  // Only for a person who still exists; a later event for an older
  // subscription of the same person does not overwrite a newer one.
  await env.DB.prepare(
    `INSERT INTO billing (user_id, customer, subscription, status, sites, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1)
     ON CONFLICT (user_id) DO UPDATE SET customer = excluded.customer,
       subscription = excluded.subscription, status = excluded.status,
       sites = excluded.sites, updated_at = excluded.updated_at
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
    )
    .run()
  return new Response('ok')
}
