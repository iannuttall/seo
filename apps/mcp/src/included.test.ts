import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { CommandError } from '@seo/core/commands'
import { runResearch } from './included.ts'
import type { ToolContext } from './tools/registry.ts'

// D1 on SQLite with every migration applied.
function database() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(new URL(file, dir), 'utf8'))
  }
  const statement = (sql: string, args: unknown[]) => ({
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => {
      const result = db.prepare(sql).run(...(args as never[]))
      return { meta: { changes: Number(result.changes) } }
    },
  })
  const d1 = {
    prepare: (sql: string) => ({
      ...statement(sql, []),
      bind: (...args: unknown[]) => statement(sql, args),
    }),
    batch: async (list: { run: () => Promise<unknown> }[]) => {
      for (const item of list) await item.run()
    },
  }
  return { db, d1: d1 as unknown as D1Database }
}

function account(headers: Record<string, string> = {}) {
  const { db, d1 } = database()
  db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run('u1', 0)
  db.prepare(
    `INSERT INTO billing (user_id, status, plan, period_end, updated_at)
     VALUES ('u1', 'active', 10, ?, 0)`,
  ).run(Date.UTC(2026, 11, 27))
  const env = {
    DB: d1,
    PUBLIC_URL: 'https://seoskill.example',
    STRIPE_PLAN_PRICES: '10:price_a,50:price_b,100:price_c,200:price_d',
    DATAFORSEO_LOGIN: 'shared-login',
    DATAFORSEO_PASSWORD: 'shared-password',
  } as unknown as Env
  const pending: Promise<unknown>[] = []
  const context = {
    env,
    userId: 'u1',
    beta: new Set(),
    directory: {},
    headers: new Headers(headers),
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  } as unknown as ToolContext
  const used = (kind: string) =>
    (
      db
        .prepare(
          'SELECT COALESCE(SUM(amount), 0) AS n FROM usage WHERE kind = ?',
        )
        .get(kind) as { n: number }
    ).n
  const planUsed = () =>
    (
      (db
        .prepare('SELECT plan_used FROM balances WHERE user_id = ?')
        .get('u1') as { plan_used: number } | undefined) ?? { plan_used: 0 }
    ).plan_used
  return { db, context, pending, used, planUsed }
}

// A research call that reports what DataForSEO charged, and the keys it got.
const research =
  (costUsd: number, seen: Headers[]) => async (keys: Headers) => {
    seen.push(keys)
    return { text: 'Rows.', data: { costUsd } }
  }

test('research on included usage runs on the shared key and charges cost plus 30%', async () => {
  const { db, context, pending, used, planUsed } = account()
  const seen: Headers[] = []
  const input = { action: 'serp', keywords: ['crm'] }
  // $3.90 of DataForSEO cost is $5.07 of the $10 plan's usage: past half.
  let { result, included } = await runResearch(
    context,
    input,
    research(3.9, seen),
  )
  assert.equal(included, true)
  assert.equal(seen[0]?.get('x-dataforseo-login'), 'shared-login')
  assert.equal(seen[0]?.get('x-dataforseo-password'), 'shared-password')
  assert.equal(seen[0]?.get('x-seo-included'), '1')
  assert.equal(planUsed(), 5_070_000)
  assert.match(result.text, /^Rows\.\n\nYou've used 50% of this month's usage/)
  await Promise.all(pending)
  // SEO Skill's own cost is recorded, not the marked-up amount.
  assert.equal(used('included_research_microusd'), 3_900_000)
  // The next call adds no second notice; a cache hit costs nothing.
  ;({ result } = await runResearch(context, input, research(0.01, seen)))
  assert.equal(result.text, 'Rows.')
  ;({ result } = await runResearch(context, input, research(0, seen)))
  assert.equal(result.text, 'Rows.')
  assert.equal(planUsed(), 5_083_000)
  // A failed call is charged what its error says was spent.
  const spent = Object.assign(new Error('failed'), { cost: 0.1 })
  await assert.rejects(
    runResearch(context, input, async () => {
      throw spent
    }),
    spent,
  )
  assert.equal(planUsed(), 5_213_000)
  // With nothing left, the call never runs.
  db.prepare('UPDATE balances SET plan_used = 10000000').run()
  const before = seen.length
  await assert.rejects(
    runResearch(context, input, research(1, seen)),
    (error: unknown) =>
      error instanceof CommandError && error.code === 'USAGE_LIMIT',
  )
  assert.equal(seen.length, before)
})

test("a person's own DataForSEO key, or an Ahrefs call, is never charged", async () => {
  const own = account({
    'x-dataforseo-login': 'own-login',
    'x-dataforseo-password': 'own-password',
  })
  const seen: Headers[] = []
  const ran = await runResearch(
    own.context,
    { action: 'serp', keywords: ['crm'] },
    research(1, seen),
  )
  assert.equal(ran.included, false)
  assert.equal(seen[0]?.get('x-dataforseo-login'), 'own-login')
  assert.equal(seen[0]?.has('x-seo-included'), false)
  assert.equal(own.planUsed(), 0)
  // Without a provider, a saved Ahrefs key takes the call.
  const ahrefs = account({ 'x-ahrefs-key': 'own-ahrefs' })
  const viaAhrefs = await runResearch(
    ahrefs.context,
    { action: 'ranked_keywords', target: 'example.com' },
    research(0, seen),
  )
  assert.equal(viaAhrefs.included, false)
  assert.equal(seen[1]?.has('x-dataforseo-login'), false)
})
