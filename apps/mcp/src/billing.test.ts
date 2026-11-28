import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { stripeWebhook, verifyStripeSignature } from './billing.ts'
import { usageOf } from './meter.ts'

const secret = 'whsec_test_secret'
const body = '{"type":"customer.subscription.updated"}'
const now = 1_793_600_000_000
const t = Math.floor(now / 1000)
const sign = (at: number, payload: string, key = secret) =>
  createHmac('sha256', key).update(`${at}.${payload}`).digest('hex')

test('only a fresh Stripe signature over the exact body is accepted', async () => {
  const good = `t=${t},v1=${sign(t, body)}`
  assert.equal(await verifyStripeSignature(body, good, secret, now), true)
  // Stripe sends several v1 values while a secret is being rolled.
  assert.equal(
    await verifyStripeSignature(
      body,
      `t=${t},v1=${sign(t, body, 'whsec_old')},v1=${sign(t, body)}`,
      secret,
      now,
    ),
    true,
  )
  const refused = [
    `t=${t},v1=${sign(t, `${body} `)}`,
    `t=${t},v1=${sign(t, body, 'whsec_other')}`,
    `t=${t - 301},v1=${sign(t - 301, body)}`,
    `t=${t},v0=${sign(t, body)}`,
    `v1=${sign(t, body)}`,
    '',
  ]
  for (const header of refused) {
    assert.equal(
      await verifyStripeSignature(body, header, secret, now),
      false,
      header,
    )
  }
  assert.equal(await verifyStripeSignature(body, good, '', now), false)
})

// D1 on SQLite with every migration applied.
function database() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort()) {
    db.exec(readFileSync(new URL(file, dir), 'utf8'))
  }
  const statement = (sql: string, args: (string | number | null)[]) => ({
    bind: (...next: (string | number | null)[]) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({
      meta: { changes: Number(db.prepare(sql).run(...args).changes) },
    }),
  })
  return {
    db,
    d1: {
      prepare: (sql: string) => statement(sql, []),
    } as unknown as D1Database,
  }
}

function setup() {
  const { db, d1 } = database()
  db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(
    'user-1',
    now,
  )
  const env = {
    DB: d1,
    PUBLIC_URL: 'https://seoskill.example',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_PRICE_ID: 'price_site',
    STRIPE_PLAN_PRICES:
      '10:price_p10,50:price_p50,100:price_p100,200:price_p200',
  } as unknown as Env
  // Signed now, as Stripe sends it.
  const send = (event: unknown) => {
    const payload = JSON.stringify(event)
    const at = Math.floor(Date.now() / 1000)
    return stripeWebhook(
      new Request('https://seoskill.example/account/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${at},v1=${sign(at, payload)}` },
        body: payload,
      }),
      env,
    )
  }
  return { db, env, send }
}

const subscription = (price: string, extra: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  metadata: { user_id: 'user-1' },
  default_payment_method: 'pm_1',
  items: {
    data: [
      {
        id: 'si_1',
        quantity: 1,
        price: { id: price },
        current_period_end: 1_796_000_000,
      },
    ],
  },
  ...extra,
})

test('a plan subscription sets the plan, its period end and card, and the usage it includes', async () => {
  const { db, env, send } = setup()
  const created = await send({
    type: 'customer.subscription.created',
    data: { object: subscription('price_p50') },
  })
  assert.equal(created.status, 200)
  assert.deepEqual(
    {
      ...db
        .prepare(
          'SELECT plan, status, sites, period_end, payment_method FROM billing WHERE user_id = ?',
        )
        .get('user-1'),
    },
    {
      plan: 50,
      status: 'active',
      sites: 0,
      // Newer Stripe API versions keep the period on the item, in seconds.
      period_end: 1_796_000_000_000,
      payment_method: 'pm_1',
    },
  )
  const usage = await usageOf(env, 'user-1', false)
  assert.equal(usage.plan, 50)
  assert.equal(usage.percentLeft, 100)
  assert.equal(usage.resetsAt, new Date(1_796_000_000_000).toISOString())

  // An older API version keeps the period on the subscription; an update
  // with no card keeps the saved one.
  await send({
    type: 'customer.subscription.updated',
    data: {
      object: subscription('price_p200', {
        current_period_end: 1_798_000_000,
        default_payment_method: null,
      }),
    },
  })
  assert.deepEqual(
    {
      ...db
        .prepare(
          'SELECT plan, period_end, payment_method FROM billing WHERE user_id = ?',
        )
        .get('user-1'),
    },
    { plan: 200, period_end: 1_798_000_000_000, payment_method: 'pm_1' },
  )

  // The per-site price stays the per-site plan, with its sites.
  await send({
    type: 'customer.subscription.updated',
    data: {
      object: subscription('price_site', {
        items: {
          data: [{ id: 'si_1', quantity: 3, price: { id: 'price_site' } }],
        },
      }),
    },
  })
  assert.deepEqual(
    {
      ...db
        .prepare('SELECT plan, sites FROM billing WHERE user_id = ?')
        .get('user-1'),
    },
    { plan: null, sites: 3 },
  )
})

test('a paid top-up is added once, however often Stripe sends it', async () => {
  const { db, env, send } = setup()
  const completed = (id: string, extra: Record<string, unknown> = {}) => ({
    type: 'checkout.session.completed',
    data: {
      object: {
        id,
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        amount_total: 2500,
        metadata: { user_id: 'user-1', purpose: 'topup', usd: '25' },
        ...extra,
      },
    },
  })
  for (let sent = 0; sent < 3; sent += 1) {
    assert.equal((await send(completed('cs_1'))).status, 200)
  }
  // Not paid yet, or paid less than the top-up it names: nothing added.
  await send(completed('cs_2', { payment_status: 'unpaid' }))
  await send(completed('cs_3', { amount_total: 100 }))
  const row = db
    .prepare('SELECT topup FROM balances WHERE user_id = ?')
    .get('user-1') as { topup: number }
  assert.equal(row.topup, 25_000_000)
  assert.equal((await usageOf(env, 'user-1', false)).topUpUsd, 25)
  // A second top-up adds to the first.
  await send(completed('cs_4'))
  assert.equal((await usageOf(env, 'user-1', false)).topUpUsd, 50)
})
