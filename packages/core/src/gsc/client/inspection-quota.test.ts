import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from '../../storage/sqlite.js'
import {
  finalizeUrlInspectionQuota,
  reserveUrlInspectionQuota,
  UrlInspectionQuotaError,
} from './inspection-quota.js'

function database() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE url_inspection_quota_buckets (
      credential_key TEXT NOT NULL,
      property_site_url TEXT NOT NULL,
      quota_date TEXT NOT NULL,
      limit_count INTEGER NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      reserved_count INTEGER NOT NULL DEFAULT 0,
      minute_window_start INTEGER NOT NULL,
      minute_count INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      last_429_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(credential_key, property_site_url, quota_date)
    ) WITHOUT ROWID;
    CREATE TABLE url_inspection_quota_reservations (
      id TEXT PRIMARY KEY,
      credential_key TEXT NOT NULL,
      property_site_url TEXT NOT NULL,
      quota_date TEXT NOT NULL,
      count INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      finalized_at INTEGER
    );
  `)
  return db
}

const base = {
  credentialKey: 'credential-a',
  property: 'sc-domain:example.com',
  now: new Date('2026-07-09T12:00:00.000Z'),
}

test('URL Inspection reservations enforce a shared daily property limit', () => {
  const db = database()
  for (let index = 0; index < 2; index++) {
    const reservation = reserveUrlInspectionQuota({
      ...base,
      limit: 2,
      database: db,
    })
    finalizeUrlInspectionQuota({
      reservation,
      outcome: 'consumed',
      now: base.now,
      database: db,
    })
  }

  assert.throws(
    () => reserveUrlInspectionQuota({ ...base, limit: 2, database: db }),
    UrlInspectionQuotaError,
  )
  const bucket = db
    .prepare(
      'SELECT used_count, reserved_count FROM url_inspection_quota_buckets',
    )
    .get() as { used_count: number; reserved_count: number }
  assert.deepEqual(bucket, { used_count: 2, reserved_count: 0 })
})

test('quota finalization is idempotent and a lower safety limit wins', () => {
  const db = database()
  const reservation = reserveUrlInspectionQuota({
    ...base,
    limit: 10,
    database: db,
  })
  finalizeUrlInspectionQuota({
    reservation,
    outcome: 'consumed',
    now: base.now,
    database: db,
  })
  finalizeUrlInspectionQuota({
    reservation,
    outcome: 'consumed',
    now: base.now,
    database: db,
  })

  assert.throws(
    () => reserveUrlInspectionQuota({ ...base, limit: 1, database: db }),
    UrlInspectionQuotaError,
  )
  const bucket = db
    .prepare('SELECT limit_count, used_count FROM url_inspection_quota_buckets')
    .get() as { limit_count: number; used_count: number }
  assert.deepEqual(bucket, { limit_count: 1, used_count: 1 })
})

test('expired reservations are conservatively consumed', () => {
  const db = database()
  reserveUrlInspectionQuota({ ...base, limit: 1, database: db })
  const later = new Date(base.now.getTime() + 6 * 60_000)

  assert.throws(
    () =>
      reserveUrlInspectionQuota({
        ...base,
        now: later,
        limit: 1,
        database: db,
      }),
    UrlInspectionQuotaError,
  )
  const reservation = db
    .prepare('SELECT status FROM url_inspection_quota_reservations')
    .get() as { status: string }
  assert.equal(reservation.status, 'abandoned')
})

test('provider 429 blocks the bucket but a new UTC date gets a new bucket', () => {
  const db = database()
  const reservation = reserveUrlInspectionQuota({
    ...base,
    limit: 10,
    database: db,
  })
  finalizeUrlInspectionQuota({
    reservation,
    outcome: 'exhausted',
    now: base.now,
    database: db,
  })

  assert.throws(
    () => reserveUrlInspectionQuota({ ...base, limit: 10, database: db }),
    UrlInspectionQuotaError,
  )
  const tomorrow = new Date('2026-07-10T00:00:00.000Z')
  const next = reserveUrlInspectionQuota({
    ...base,
    now: tomorrow,
    limit: 10,
    database: db,
  })
  assert.equal(next.quotaDate, '2026-07-10')
})

test('provider retry windows consume one call and can cross UTC dates', () => {
  const db = database()
  const reservation = reserveUrlInspectionQuota({
    ...base,
    now: new Date('2026-07-09T23:55:00.000Z'),
    limit: 10,
    database: db,
  })
  const blockedUntil = new Date('2026-07-10T00:15:00.000Z')
  finalizeUrlInspectionQuota({
    reservation,
    outcome: 'exhausted',
    blockedUntil,
    now: new Date('2026-07-09T23:55:01.000Z'),
    database: db,
  })

  assert.throws(
    () =>
      reserveUrlInspectionQuota({
        ...base,
        now: new Date('2026-07-10T00:05:00.000Z'),
        limit: 10,
        database: db,
      }),
    (error: unknown) =>
      error instanceof UrlInspectionQuotaError &&
      error.resetAt === blockedUntil.toISOString(),
  )
  const next = reserveUrlInspectionQuota({
    ...base,
    now: new Date('2026-07-10T00:16:00.000Z'),
    limit: 10,
    database: db,
  })
  assert.equal(next.used, 0)
})

test('released reservations free rolling minute capacity', () => {
  const db = database()
  const reservation = reserveUrlInspectionQuota({
    ...base,
    limit: 10,
    database: db,
  })
  finalizeUrlInspectionQuota({
    reservation,
    outcome: 'released',
    now: base.now,
    database: db,
  })

  const bucket = db
    .prepare(
      'SELECT used_count, reserved_count, minute_count FROM url_inspection_quota_buckets',
    )
    .get() as {
    used_count: number
    reserved_count: number
    minute_count: number
  }
  assert.deepEqual(bucket, {
    used_count: 0,
    reserved_count: 0,
    minute_count: 0,
  })
})

test('minute safety limit uses a rolling window', () => {
  const db = database()
  const insert = db.prepare(
    `INSERT INTO url_inspection_quota_reservations
    (id, credential_key, property_site_url, quota_date, count, status,
     created_at, expires_at, finalized_at)
    VALUES (?, ?, ?, '2026-07-09', 1, 'consumed', ?, ?, ?)`,
  )
  const early = Date.parse('2026-07-09T11:59:00.001Z')
  const late = Date.parse('2026-07-09T11:59:59.000Z')
  db.transaction(() => {
    for (let index = 0; index < 600; index++) {
      const createdAt = index < 300 ? early : late
      insert.run(
        `minute-${index}`,
        base.credentialKey,
        base.property,
        createdAt,
        createdAt + 300_000,
        createdAt,
      )
    }
  })()

  assert.throws(
    () => reserveUrlInspectionQuota({ ...base, limit: 2_000, database: db }),
    (error: unknown) =>
      error instanceof UrlInspectionQuotaError &&
      error.resetAt === '2026-07-09T12:00:00.001Z',
  )
  const next = reserveUrlInspectionQuota({
    ...base,
    now: new Date('2026-07-09T12:00:00.002Z'),
    limit: 2_000,
    database: db,
  })
  assert.equal(next.used, 0)
})

test('old quota rows are pruned during reservation', () => {
  const db = database()
  db.prepare(
    `INSERT INTO url_inspection_quota_reservations
    (id, credential_key, property_site_url, quota_date, count, status,
     created_at, expires_at, finalized_at)
    VALUES ('old', 'old', 'sc-domain:old.test', '2026-01-01', 1,
      'consumed', 1, 2, 3)`,
  ).run()
  db.prepare(
    `INSERT INTO url_inspection_quota_buckets
    (credential_key, property_site_url, quota_date, limit_count,
     minute_window_start, updated_at)
    VALUES ('old', 'sc-domain:old.test', '2026-01-01', 10, 1, 1)`,
  ).run()

  reserveUrlInspectionQuota({ ...base, limit: 10, database: db })

  assert.equal(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM url_inspection_quota_reservations WHERE id = 'old'",
        )
        .get() as { count: number }
    ).count,
    0,
  )
  assert.equal(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM url_inspection_quota_buckets WHERE credential_key = 'old'",
        )
        .get() as { count: number }
    ).count,
    0,
  )
})
