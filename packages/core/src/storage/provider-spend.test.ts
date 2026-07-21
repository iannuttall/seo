import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProviderSpendLimits } from '../providers/cost-limits.js'
import { ProviderError } from '../providers/errors.js'
import {
  finalizeProviderSpend,
  getProviderSpendSummary,
  PROVIDER_SPEND_MAX_BYTES,
  reserveProviderSpend,
} from './provider-spend.js'
import { PROVIDER_SPEND_SCHEMA_SQL } from './provider-spend-schema.js'
import Database from './sqlite.js'

const BASE_TIME = Date.UTC(2026, 6, 21, 12)

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(PROVIDER_SPEND_SCHEMA_SQL)
  return db
}

function limits(
  overrides: Partial<ProviderSpendLimits> = {},
): ProviderSpendLimits {
  return {
    dailyNoticeMicros: 5_000_000,
    dailyHardLimitMicros: null,
    monthlyHardLimitMicros: null,
    maxRequestsPerReport: 20,
    maxRowsPerReport: 10_000,
    ...overrides,
  }
}

function reservationInput(
  overrides: Partial<Parameters<typeof reserveProviderSpend>[0]> = {},
): Parameters<typeof reserveProviderSpend>[0] {
  return {
    provider: 'dataforseo',
    capability: 'keyword-metrics',
    endpoint: 'dataforseo_labs/google/keyword_overview/live',
    projectId: 'project-example',
    reportId: 'keyword-metrics',
    reportRunId: 'run-example',
    requestedRows: 1,
    estimatedCostMicros: 20_000,
    ...overrides,
  }
}

test('spend reservations stop daily limits before acquisition', () => {
  const db = database()
  const localLimits = limits({ dailyHardLimitMicros: 1_000_000 })
  const first = reserveProviderSpend(
    reservationInput({ estimatedCostMicros: 400_000 }),
    { database: db, limits: localLimits, now: BASE_TIME },
  )

  assert.throws(
    () =>
      reserveProviderSpend(
        reservationInput({
          reportRunId: 'run-second',
          estimatedCostMicros: 600_001,
        }),
        { database: db, limits: localLimits, now: BASE_TIME },
      ),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'budget-limit')
      assert.match(error.message, /before|would be exceeded/i)
      return true
    },
  )
  assert.equal(
    getProviderSpendSummary('dataforseo', {
      database: db,
      limits: localLimits,
      now: BASE_TIME,
    }).today.effectiveCostMicros,
    400_000,
  )

  finalizeProviderSpend(
    first.id,
    {
      provider: 'dataforseo',
      state: 'succeeded',
      actualCostMicros: 300_000,
      returnedRows: 1,
      taskIds: ['task-1'],
    },
    { database: db, limits: localLimits, now: BASE_TIME + 1 },
  )
  const second = reserveProviderSpend(
    reservationInput({
      reportRunId: 'run-second',
      estimatedCostMicros: 700_000,
    }),
    { database: db, limits: localLimits, now: BASE_TIME + 2 },
  )
  assert.ok(second.id)
})

test('spend reservations enforce per-report request and row ceilings', () => {
  const db = database()
  const localLimits = limits({
    maxRequestsPerReport: 2,
    maxRowsPerReport: 5,
  })
  reserveProviderSpend(reservationInput({ requestedRows: 2 }), {
    database: db,
    limits: localLimits,
    now: BASE_TIME,
  })
  reserveProviderSpend(reservationInput({ requestedRows: 3 }), {
    database: db,
    limits: localLimits,
    now: BASE_TIME + 1,
  })

  assert.throws(
    () =>
      reserveProviderSpend(reservationInput({ requestedRows: 0 }), {
        database: db,
        limits: localLimits,
        now: BASE_TIME + 2,
      }),
    (error) => error instanceof ProviderError && error.code === 'budget-limit',
  )
  assert.throws(
    () =>
      reserveProviderSpend(
        reservationInput({ reportRunId: 'row-heavy', requestedRows: 6 }),
        { database: db, limits: localLimits, now: BASE_TIME + 3 },
      ),
    /row limit/i,
  )
})

test('actual zero and unknown cost remain distinct in summaries', () => {
  const db = database()
  const localLimits = limits()
  const free = reserveProviderSpend(
    reservationInput({ reportRunId: 'free', estimatedCostMicros: 10_000 }),
    { database: db, limits: localLimits, now: BASE_TIME },
  )
  finalizeProviderSpend(
    free.id,
    {
      provider: 'dataforseo',
      state: 'succeeded',
      actualCostMicros: 0,
      returnedRows: 0,
      taskIds: [],
    },
    { database: db, limits: localLimits, now: BASE_TIME + 1 },
  )

  const unknown = reserveProviderSpend(
    reservationInput({ reportRunId: 'unknown', estimatedCostMicros: 25_000 }),
    { database: db, limits: localLimits, now: BASE_TIME + 2 },
  )
  finalizeProviderSpend(
    unknown.id,
    {
      provider: 'dataforseo',
      state: 'failed',
      actualCostMicros: null,
      returnedRows: null,
      taskIds: [],
    },
    { database: db, limits: localLimits, now: BASE_TIME + 3 },
  )

  const summary = getProviderSpendSummary('dataforseo', {
    database: db,
    limits: localLimits,
    now: BASE_TIME + 4,
  })
  assert.equal(summary.today.actualCostMicros, 0)
  assert.equal(summary.today.estimatedOrUnknownCostMicros, 25_000)
  assert.equal(summary.today.effectiveCostMicros, 25_000)
  assert.equal(summary.states.succeeded, 1)
  assert.equal(summary.states.failed, 1)
})

test('charged failures and task ids are retained deterministically', () => {
  const db = database()
  const localLimits = limits()
  const reservation = reserveProviderSpend(reservationInput(), {
    database: db,
    limits: localLimits,
    now: BASE_TIME,
  })
  finalizeProviderSpend(
    reservation.id,
    {
      provider: 'dataforseo',
      state: 'failed',
      actualCostMicros: 12_345,
      returnedRows: 0,
      taskIds: ['task-b', 'task-a', 'task-b'],
    },
    { database: db, limits: localLimits, now: BASE_TIME + 1 },
  )
  const row = db
    .prepare(
      `SELECT state, actual_cost_micros, task_ids_json
       FROM provider_spend_ledger WHERE id = ?`,
    )
    .get(reservation.id) as {
    state: string
    actual_cost_micros: number
    task_ids_json: string
  }
  assert.equal(row.state, 'failed')
  assert.equal(row.actual_cost_micros, 12_345)
  assert.deepEqual(JSON.parse(row.task_ids_json), ['task-a', 'task-b'])
})

test('daily spend notice emits once per UTC day and threshold', () => {
  const db = database()
  const localLimits = limits({ dailyNoticeMicros: 100 })
  const finish = (run: string, cost: number, now: number) => {
    const reservation = reserveProviderSpend(
      reservationInput({ reportRunId: run, estimatedCostMicros: cost }),
      { database: db, limits: localLimits, now },
    )
    return finalizeProviderSpend(
      reservation.id,
      {
        provider: 'dataforseo',
        state: 'succeeded',
        actualCostMicros: cost,
        returnedRows: 1,
        taskIds: [],
      },
      { database: db, limits: localLimits, now: now + 1 },
    )
  }

  assert.equal(finish('notice-1', 60, BASE_TIME), null)
  assert.deepEqual(finish('notice-2', 40, BASE_TIME + 2), {
    provider: 'dataforseo',
    thresholdMicros: 100,
    periodStart: '2026-07-21T00:00:00.000Z',
    spentMicros: 100,
  })
  assert.equal(finish('notice-3', 10, BASE_TIME + 4), null)
  assert.ok(finish('notice-next-day', 100, BASE_TIME + 24 * 60 * 60 * 1000))
})

test('stale reservations become conservative unknown spend', () => {
  const db = database()
  const localLimits = limits({ dailyHardLimitMicros: 100_000 })
  reserveProviderSpend(reservationInput({ estimatedCostMicros: 60_000 }), {
    database: db,
    limits: localLimits,
    now: BASE_TIME,
  })
  const later = BASE_TIME + 2 * 60 * 60 * 1000
  const summary = getProviderSpendSummary('dataforseo', {
    database: db,
    limits: localLimits,
    now: later,
  })
  assert.equal(summary.states.reserved, 0)
  assert.equal(summary.states.unknown, 1)
  assert.equal(summary.today.estimatedOrUnknownCostMicros, 60_000)
  assert.throws(
    () =>
      reserveProviderSpend(
        reservationInput({
          reportRunId: 'after-crash',
          estimatedCostMicros: 40_001,
        }),
        { database: db, limits: localLimits, now: later },
      ),
    /daily hard limit/i,
  )
})

test('ledger maintenance enforces age and logical disk bounds', () => {
  const db = database()
  const old = BASE_TIME - 731 * 24 * 60 * 60 * 1000
  const insert = db.prepare(
    `INSERT INTO provider_spend_ledger (
      id, provider, capability, endpoint, project_id, report_id,
      report_run_id, requested_rows, returned_rows, estimated_cost_micros,
      actual_cost_micros, state, task_ids_json, occurred_at, updated_at,
      reservation_expires_at
    ) VALUES (?, 'dataforseo', 'keyword-metrics', 'endpoint', NULL,
      'report', 'run', 1, 1, 1, 1, 'succeeded', ?, ?, ?, NULL)`,
  )
  insert.run('old-row', '[]', old, old)
  insert.run(
    'oversized-row',
    JSON.stringify(['x'.repeat(PROVIDER_SPEND_MAX_BYTES + 1)]),
    BASE_TIME,
    BASE_TIME,
  )

  const summary = getProviderSpendSummary('dataforseo', {
    database: db,
    limits: limits(),
    now: BASE_TIME + 1,
  })
  assert.equal(summary.retained.requests, 0)
  assert.ok(summary.retention.logicalBytes <= PROVIDER_SPEND_MAX_BYTES)
})
