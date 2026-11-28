import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { LinkedAccounts } from '@seo/core/commands'
import {
  DAILY_CAP,
  noteSignIn,
  settleCredit,
  unlockWithFingerprint,
} from './credit.ts'

// D1 on SQLite with every migration applied.
function database() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort()) {
    db.exec(readFileSync(new URL(file, dir), 'utf8'))
  }
  db.exec('PRAGMA foreign_keys = ON')
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async () =>
      db.prepare(sql).get(...(args as (string | number | null)[])) ?? null,
    all: async () => ({
      results: db.prepare(sql).all(...(args as (string | number | null)[])),
    }),
    run: async () => ({
      meta: {
        changes: Number(
          db.prepare(sql).run(...(args as (string | number | null)[])).changes,
        ),
      },
    }),
  })
  const d1 = {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      const out = []
      for (const item of list) out.push(await item.run())
      return out
    },
  }
  return { db, d1: d1 as unknown as D1Database }
}

function setup(extra: Record<string, string> = {}) {
  const { db, d1 } = database()
  const env = {
    DB: d1,
    SEAL_KEY: Buffer.alloc(32, 7).toString('base64'),
    PUBLIC_URL: 'https://seoskill.example',
    STRIPE_PLAN_PRICES: '10:price_a,50:price_b,100:price_c,200:price_d',
    DATAFORSEO_LOGIN: 'login',
    DATAFORSEO_PASSWORD: 'password',
    TURNSTILE_SITE_KEY: '',
    TURNSTILE_SECRET: '',
    ...extra,
  } as unknown as Env
  const user = (id: string) =>
    db
      .prepare('INSERT INTO users (id, created_at) VALUES (?, ?)')
      .run(id, Date.now())
  const state = (id: string) =>
    (
      db.prepare('SELECT state FROM credits WHERE user_id = ?').get(id) as
        | { state: string }
        | undefined
    )?.state ?? null
  const credit = (id: string) =>
    (
      db.prepare('SELECT credit FROM balances WHERE user_id = ?').get(id) as
        | { credit: number }
        | undefined
    )?.credit ?? 0
  return { db, env, user, state, credit }
}

// One Google sign-in that reads these Search Console properties, each with
// this many impressions over the last 90 days.
function google(sites: Record<string, number>): LinkedAccounts {
  const fetch = async (url: string) => {
    if (url.endsWith('/webmasters/v3/sites')) {
      return Response.json({
        siteEntry: Object.keys(sites).map((siteUrl) => ({
          siteUrl,
          permissionLevel: 'siteOwner',
        })),
      })
    }
    const site = decodeURIComponent(
      /\/sites\/([^/]+)\/searchAnalytics/.exec(url)?.[1] ?? '',
    )
    const impressions = sites[site] ?? 0
    return Response.json(
      impressions ? { rows: [{ clicks: 1, impressions }] } : {},
    )
  }
  return {
    accounts: () => [{ email: 'person@example.com', google: fetch }],
  } as unknown as LinkedAccounts
}

const signIn = (ip: string) =>
  new Request('https://seoskill.example/oauth/callback', {
    headers: { 'cf-connecting-ip': ip },
  })

test('a linked group of sites gets one credit, also after the account is deleted', async () => {
  const { db, env, user, state, credit } = setup()
  for (const id of ['a', 'b', 'c']) user(id)
  await settleCredit(env, 'a', google({ 'sc-domain:example.com': 40 }))
  assert.equal(state('a'), 'granted')
  assert.equal(credit('a'), 1_000_000)
  // The same site as a URL-prefix property, next to a new one.
  await settleCredit(
    env,
    'b',
    google({ 'https://www.example.com/': 40, 'https://example.org/': 9 }),
  )
  assert.equal(state('b'), 'linked')
  assert.equal(credit('b'), 0)
  // Settling again does not change a decided credit.
  await settleCredit(env, 'a', google({ 'sc-domain:example.com': 40 }))
  assert.equal(credit('a'), 1_000_000)

  db.prepare('DELETE FROM users WHERE id = ?').run('a')
  await settleCredit(env, 'c', google({ 'sc-domain:example.com': 40 }))
  assert.equal(state('c'), 'linked')
})

test('a site only on a free host, or with no impressions, is held', async () => {
  const { env, user, state, credit } = setup()
  for (const id of ['free', 'quiet', 'none']) user(id)
  await settleCredit(
    env,
    'free',
    google({
      'https://person.github.io/': 500,
      'sc-domain:shop.vercel.app': 80,
    }),
  )
  assert.equal(state('free'), 'held_site')
  await settleCredit(env, 'quiet', google({ 'sc-domain:example.net': 0 }))
  assert.equal(state('quiet'), 'held_site')
  assert.equal(credit('free') + credit('quiet'), 0)
  // No site yet: nothing is decided.
  await settleCredit(env, 'none', google({}))
  assert.equal(state('none'), 'pending')
})

test('a network block gets 3 credits a week; the 4th and a failed Turnstile wait for a card', async () => {
  const { env, user, state } = setup({
    TURNSTILE_SITE_KEY: 'site-key',
    TURNSTILE_SECRET: 'secret',
  })
  for (const n of [1, 2, 3, 4]) {
    user(`u${n}`)
    // Different addresses in one /24.
    await noteSignIn(env, `u${n}`, signIn(`203.0.113.${n}`), true)
    await settleCredit(
      env,
      `u${n}`,
      google({ [`sc-domain:site${n}.example`]: 5 }),
    )
  }
  assert.deepEqual(['u1', 'u2', 'u3', 'u4'].map(state), [
    'granted',
    'granted',
    'granted',
    'held_card',
  ])
  user('other')
  await noteSignIn(env, 'other', signIn('198.51.100.7'), true)
  await settleCredit(env, 'other', google({ 'sc-domain:other.example': 5 }))
  assert.equal(state('other'), 'granted')

  user('bot')
  await noteSignIn(env, 'bot', signIn('192.0.2.1'), false)
  // A later sign-in that passes does not clear the failure.
  await noteSignIn(env, 'bot', signIn('192.0.2.1'), true)
  await settleCredit(env, 'bot', google({ 'sc-domain:bot.example': 5 }))
  assert.equal(state('bot'), 'held_card')
})

test('past the daily cap credits wait for the next day and Ian is told once', async () => {
  const { env, user, state, credit } = setup({
    TELEGRAM_BOT_TOKEN: 'token',
    TELEGRAM_CHAT_ID: 'chat',
  })
  let alerts = 0
  const realFetch = globalThis.fetch
  const realNow = Date.now
  globalThis.fetch = (async () => {
    alerts += 1
    return Response.json({ ok: true })
  }) as typeof fetch
  try {
    const ids = Array.from({ length: DAILY_CAP + 2 }, (_, n) => `u${n}`)
    for (const id of ids) {
      user(id)
      await settleCredit(env, id, google({ [`sc-domain:${id}.example`]: 3 }))
    }
    const states = ids.map(state)
    assert.equal(states.filter((s) => s === 'granted').length, DAILY_CAP)
    assert.deepEqual(states.slice(DAILY_CAP), ['held_cap', 'held_cap'])
    assert.equal(credit(`u${DAILY_CAP}`), 0)
    assert.equal(alerts, 1)

    const tomorrow = realNow() + 86_400_000
    Date.now = () => tomorrow
    await settleCredit(env, `u${DAILY_CAP}`, google({}))
    assert.equal(state(`u${DAILY_CAP}`), 'granted')
    assert.equal(credit(`u${DAILY_CAP}`), 1_000_000)
  } finally {
    globalThis.fetch = realFetch
    Date.now = realNow
  }
})

test('a card unlocks one held credit only', async () => {
  const { db, env, user, state, credit } = setup()
  for (const id of ['x', 'y']) {
    user(id)
    db.prepare(
      "INSERT INTO credits (user_id, state, updated_at) VALUES (?, 'held_card', 0)",
    ).run(id)
  }
  await unlockWithFingerprint(env, 'x', 'fp_card_1', Date.now())
  assert.equal(state('x'), 'granted')
  assert.equal(credit('x'), 1_000_000)
  await unlockWithFingerprint(env, 'y', 'fp_card_1', Date.now())
  assert.equal(state('y'), 'held_card')
  assert.equal(credit('y'), 0)
  await unlockWithFingerprint(env, 'y', 'fp_card_2', Date.now())
  assert.equal(state('y'), 'granted')
  // Deleting the account keeps the card spent.
  db.prepare('DELETE FROM users WHERE id = ?').run('x')
  user('x2')
  db.prepare(
    "INSERT INTO credits (user_id, state, updated_at) VALUES ('x2', 'held_card', 0)",
  ).run()
  await unlockWithFingerprint(env, 'x2', 'fp_card_1', Date.now())
  assert.equal(state('x2'), 'held_card')
})
