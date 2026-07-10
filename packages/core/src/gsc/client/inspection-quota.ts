import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { SeoError } from '../../errors.js'
import { getDb } from '../../storage/database.js'

export const URL_INSPECTION_DAILY_LIMIT = 2_000
export const URL_INSPECTION_MINUTE_LIMIT = 600
const RESERVATION_TTL_MS = 5 * 60_000

type BucketRow = {
  limit_count: number
  used_count: number
  reserved_count: number
  minute_window_start: number
  minute_count: number
  blocked_until?: number | null
}

type ReservationRow = {
  count: number
  status: string
}

export type UrlInspectionQuotaReservation = {
  id: string
  credentialKey: string
  property: string
  quotaDate: string
  count: number
  limit: number
  used: number
  reserved: number
  resetAt: string
}

export class UrlInspectionQuotaError extends SeoError {
  readonly property: string
  readonly requestSent: boolean
  readonly resetAt: string
  readonly used: number
  readonly limit: number

  constructor(input: {
    property: string
    resetAt: string
    used: number
    limit: number
    reason?: 'daily' | 'minute' | 'provider'
    requestSent?: boolean
  }) {
    super(
      'RATE_LIMITED',
      `URL Inspection ${input.reason ?? 'daily'} quota is blocked for ${input.property}. Retry after ${input.resetAt}.`,
    )
    this.name = 'UrlInspectionQuotaError'
    this.property = input.property
    this.requestSent = input.requestSent ?? false
    this.resetAt = input.resetAt
    this.used = input.used
    this.limit = input.limit
  }
}

export function urlInspectionQuotaDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function urlInspectionQuotaResetAt(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
}

function boundedLimit(value?: number): number {
  const limit = value ?? URL_INSPECTION_DAILY_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > 2_000) {
    throw new SeoError(
      'INVALID_INPUT',
      'URL Inspection daily limit must be an integer from 1 to 2000.',
    )
  }
  return limit
}

function reconcileExpiredReservations(input: {
  database: Database.Database
  credentialKey: string
  property: string
  quotaDate: string
  now: number
}): void {
  const expired = input.database
    .prepare(
      `SELECT COALESCE(SUM(count), 0) AS count
      FROM url_inspection_quota_reservations
      WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?
        AND status = 'reserved' AND expires_at <= ?`,
    )
    .get(input.credentialKey, input.property, input.quotaDate, input.now) as {
    count: number
  }
  if (!expired.count) return
  input.database
    .prepare(
      `UPDATE url_inspection_quota_reservations
      SET status = 'abandoned', finalized_at = ?
      WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?
        AND status = 'reserved' AND expires_at <= ?`,
    )
    .run(
      input.now,
      input.credentialKey,
      input.property,
      input.quotaDate,
      input.now,
    )
  input.database
    .prepare(
      `UPDATE url_inspection_quota_buckets
      SET used_count = MIN(limit_count, used_count + ?),
          reserved_count = MAX(0, reserved_count - ?),
          updated_at = ?
      WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?`,
    )
    .run(
      expired.count,
      expired.count,
      input.now,
      input.credentialKey,
      input.property,
      input.quotaDate,
    )
}

function pruneOldQuotaRows(database: Database.Database, now: number): void {
  const reservationCutoff = now - 2 * 86_400_000
  const bucketCutoff = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10)
  database
    .prepare(
      `DELETE FROM url_inspection_quota_reservations
      WHERE expires_at < ?`,
    )
    .run(reservationCutoff)
  database
    .prepare(
      `DELETE FROM url_inspection_quota_buckets
      WHERE quota_date < ? AND COALESCE(blocked_until, 0) <= ?`,
    )
    .run(bucketCutoff, now)
}

export function reserveUrlInspectionQuota(input: {
  credentialKey: string
  property: string
  limit?: number
  now?: Date
  database?: Database.Database
}): UrlInspectionQuotaReservation {
  const database = input.database ?? getDb()
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const requestedLimit = boundedLimit(input.limit)
  const quotaDate = urlInspectionQuotaDate(now)
  const resetAt = urlInspectionQuotaResetAt(now)
  const reserve = database.transaction(() => {
    pruneOldQuotaRows(database, nowMs)
    database
      .prepare(
        `INSERT INTO url_inspection_quota_buckets
        (credential_key, property_site_url, quota_date, limit_count,
         minute_window_start, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_key, property_site_url, quota_date)
        DO UPDATE SET limit_count = MIN(limit_count, excluded.limit_count),
          updated_at = excluded.updated_at`,
      )
      .run(
        input.credentialKey,
        input.property,
        quotaDate,
        requestedLimit,
        nowMs,
        nowMs,
      )
    reconcileExpiredReservations({
      database,
      credentialKey: input.credentialKey,
      property: input.property,
      quotaDate,
      now: nowMs,
    })
    const bucket = database
      .prepare(
        `SELECT * FROM url_inspection_quota_buckets
        WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?`,
      )
      .get(input.credentialKey, input.property, quotaDate) as BucketRow
    const priorBlocked = database
      .prepare(
        `SELECT MAX(blocked_until) AS blocked_until
        FROM url_inspection_quota_buckets
        WHERE credential_key = ? AND property_site_url = ?
          AND blocked_until > ?`,
      )
      .get(input.credentialKey, input.property, nowMs) as {
      blocked_until?: number | null
    }
    const blockedUntil = Math.max(
      bucket.blocked_until ?? 0,
      priorBlocked.blocked_until ?? 0,
    )
    if (
      blockedUntil > nowMs ||
      bucket.used_count + bucket.reserved_count >= bucket.limit_count
    ) {
      return {
        error: new UrlInspectionQuotaError({
          property: input.property,
          resetAt: new Date(
            blockedUntil > nowMs ? blockedUntil : resetAt.getTime(),
          ).toISOString(),
          used: bucket.used_count,
          limit: bucket.limit_count,
          reason: 'daily',
        }),
      }
    }
    const rollingMinute = database
      .prepare(
        `SELECT COALESCE(SUM(count), 0) AS count,
          MIN(created_at) AS earliest_created_at
        FROM url_inspection_quota_reservations
        WHERE credential_key = ? AND property_site_url = ?
          AND created_at > ? AND status != 'released'`,
      )
      .get(input.credentialKey, input.property, nowMs - 60_000) as {
      count: number
      earliest_created_at?: number | null
    }
    if (rollingMinute.count >= URL_INSPECTION_MINUTE_LIMIT) {
      return {
        error: new UrlInspectionQuotaError({
          property: input.property,
          resetAt: new Date(
            (rollingMinute.earliest_created_at ?? nowMs) + 60_000,
          ).toISOString(),
          used: rollingMinute.count,
          limit: URL_INSPECTION_MINUTE_LIMIT,
          reason: 'minute',
        }),
      }
    }
    const id = randomUUID()
    database
      .prepare(
        `INSERT INTO url_inspection_quota_reservations
        (id, credential_key, property_site_url, quota_date, count, status,
         created_at, expires_at)
        VALUES (?, ?, ?, ?, 1, 'reserved', ?, ?)`,
      )
      .run(
        id,
        input.credentialKey,
        input.property,
        quotaDate,
        nowMs,
        nowMs + RESERVATION_TTL_MS,
      )
    database
      .prepare(
        `UPDATE url_inspection_quota_buckets
        SET reserved_count = reserved_count + 1,
            minute_count = minute_count + 1,
            updated_at = ?
        WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?`,
      )
      .run(nowMs, input.credentialKey, input.property, quotaDate)
    return {
      reservation: {
        id,
        credentialKey: input.credentialKey,
        property: input.property,
        quotaDate,
        count: 1,
        limit: bucket.limit_count,
        used: bucket.used_count,
        reserved: bucket.reserved_count + 1,
        resetAt: resetAt.toISOString(),
      },
    }
  })
  const result = reserve.immediate()
  if ('error' in result) throw result.error
  return result.reservation
}

export function finalizeUrlInspectionQuota(input: {
  reservation: UrlInspectionQuotaReservation
  outcome: 'consumed' | 'exhausted' | 'released'
  blockedUntil?: Date
  now?: Date
  database?: Database.Database
}): void {
  const database = input.database ?? getDb()
  const now = input.now ?? new Date()
  const finalize = database.transaction(() => {
    const row = database
      .prepare(
        'SELECT count, status FROM url_inspection_quota_reservations WHERE id = ?',
      )
      .get(input.reservation.id) as ReservationRow | undefined
    if (row?.status !== 'reserved') return
    const nextStatus =
      input.outcome === 'consumed'
        ? 'consumed'
        : input.outcome === 'exhausted'
          ? 'exhausted'
          : 'released'
    database
      .prepare(
        `UPDATE url_inspection_quota_reservations
        SET status = ?, finalized_at = ?
        WHERE id = ? AND status = 'reserved'`,
      )
      .run(nextStatus, now.getTime(), input.reservation.id)
    const consumed = input.outcome === 'released' ? 0 : row.count
    const exhausted = input.outcome === 'exhausted'
    const dailyExhausted = exhausted && !input.blockedUntil
    database
      .prepare(
        `UPDATE url_inspection_quota_buckets
        SET used_count = CASE WHEN ? = 1 THEN limit_count
              ELSE MIN(limit_count, used_count + ?) END,
            reserved_count = MAX(0, reserved_count - ?),
            minute_count = MAX(0, minute_count - ?),
            blocked_until = CASE WHEN ? = 1 THEN ? ELSE blocked_until END,
            last_429_at = CASE WHEN ? = 1 THEN ? ELSE last_429_at END,
            updated_at = ?
        WHERE credential_key = ? AND property_site_url = ? AND quota_date = ?`,
      )
      .run(
        dailyExhausted ? 1 : 0,
        consumed,
        row.count,
        input.outcome === 'released' ? row.count : 0,
        exhausted ? 1 : 0,
        (input.blockedUntil ?? new Date(input.reservation.resetAt)).getTime(),
        exhausted ? 1 : 0,
        now.getTime(),
        now.getTime(),
        input.reservation.credentialKey,
        input.reservation.property,
        input.reservation.quotaDate,
      )
  })
  finalize.immediate()
}
