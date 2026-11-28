import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { addTopUp, charge, spendable, usageOf } from './meter.ts'

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
  return {
    db,
    d1: {
      prepare: (sql: string) => ({
        ...statement(sql, []),
        bind: (...args: unknown[]) => statement(sql, args),
      }),
    } as unknown as D1Database,
  }
}

const PERIOD_END = Date.UTC(2026, 11, 27)

function account(plan: number | null) {
  const { db, d1 } = database()
  db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run('u1', 0)
  if (plan) {
    db.prepare(
      `INSERT INTO billing (user_id, status, plan, period_end, updated_at)
       VALUES ('u1', 'active', ?, ?, 0)`,
    ).run(plan, PERIOD_END)
  }
  const env = {
    DB: d1,
    PUBLIC_URL: 'https://seoskill.example',
  } as unknown as Env
  return { db, env }
}

test('a $10 plan charges cost plus 30%, shows each notice once, then top-ups', async () => {
  const { env } = account(10)
  // $10 of usage on the $10 plan. $3.00 of DataForSEO cost is $3.90 of
  // usage: 61% left, so no notice yet.
  let result = await charge(env, 'u1', 3)
  assert.equal(result.usage.percentLeft, 61)
  assert.equal(result.notice, null)
  // $0.90 more is $1.17: $5.07 used, past half.
  result = await charge(env, 'u1', 0.9)
  assert.equal(result.usage.percentLeft, 49)
  assert.match(
    result.notice ?? '',
    /used 50% of this month's usage \(resets 27 Dec\)/,
  )
  // A small call after it adds no second 50% notice.
  result = await charge(env, 'u1', 0.01)
  assert.equal(result.notice, null)
  // $2.50 more ($3.25) passes 80%.
  result = await charge(env, 'u1', 2.5)
  assert.match(result.notice ?? '', /used 80%/)
  // A $10 top-up is used only once the plan's usage is gone.
  await addTopUp(env, 'u1', 10)
  result = await charge(env, 'u1', 1)
  assert.equal(result.usage.topUpUsd, 10)
  assert.equal(result.usage.percentLeft, 3)
  // $1.00 more ($1.30) finishes the plan's $0.367 left and takes $0.933 of
  // the top-up. Top-ups extend the plan, so no 100% notice.
  result = await charge(env, 'u1', 1)
  assert.equal(result.usage.percentLeft, 0)
  assert.equal(result.usage.topUpUsd, 9.06)
  assert.equal(result.notice, null)
  assert.equal(result.usage.empty, false)
  // The rest of the top-up and more: the call that ran past what was left
  // still costs it all, and nothing is left.
  result = await charge(env, 'u1', 10)
  assert.equal(result.usage.empty, true)
  assert.match(result.notice ?? '', /used all of this month's usage/)
  assert.equal(await spendable(env, 'u1'), 0)
})

test('a new period resets the plan usage and its notices', async () => {
  const { db, env } = account(50)
  // The $50 plan includes $50. $31 of cost is $40.30: 19% left.
  let result = await charge(env, 'u1', 31)
  assert.equal(result.usage.percentLeft, 19)
  assert.match(result.notice ?? '', /used 80%/)
  // Stripe starts the next period.
  db.prepare('UPDATE billing SET period_end = ? WHERE user_id = ?').run(
    PERIOD_END + 31 * 86_400_000,
    'u1',
  )
  const usage = await usageOf(env, 'u1', false)
  assert.equal(usage.percentLeft, 100)
  assert.equal(
    usage.resetsAt,
    new Date(PERIOD_END + 31 * 86_400_000).toISOString(),
  )
  // The first charge of the new period counts from zero, and the 80%
  // notice can show again later in it.
  result = await charge(env, 'u1', 1)
  assert.equal(result.usage.percentLeft, 97)
  result = await charge(env, 'u1', 30)
  assert.match(result.notice ?? '', /used 80%/)
})

test('the free credit is spent before the plan and an account without either has nothing', async () => {
  const { db, env } = account(null)
  assert.equal(await spendable(env, 'u1'), 0)
  assert.equal((await usageOf(env, 'u1', false)).empty, true)
  db.prepare(
    "INSERT INTO credits (user_id, state, updated_at) VALUES ('u1', 'granted', 0)",
  ).run()
  db.prepare(
    "INSERT INTO balances (user_id, credit, updated_at) VALUES ('u1', 1000000, 0)",
  ).run()
  // $0.50 of cost is $0.65 of the $1 credit.
  const result = await charge(env, 'u1', 0.5)
  assert.equal(result.usage.creditPercentLeft, 35)
  assert.equal(result.usage.plan, null)
  assert.match(result.notice ?? '', /used 50% of free credit/)
})
