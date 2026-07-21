import { randomUUID } from 'node:crypto'
import type { ProviderCapability, ProviderId } from '../providers/contracts.js'
import {
  getProviderSpendLimits,
  type ProviderSpendLimits,
} from '../providers/cost-limits.js'
import { ProviderError } from '../providers/errors.js'
import { getDb } from './database.js'
import type Database from './sqlite.js'

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_MS = 730 * DAY_MS
const RESERVATION_TTL_MS = 60 * 60 * 1000
const MAX_LEDGER_ROWS = 50_000
const MAX_LEDGER_BYTES = 32 * 1024 * 1024
const MAX_TASK_IDS = 20
const MAX_ACTIVE_RESERVATIONS = 100

export const PROVIDER_SPEND_RETENTION_DAYS = RETENTION_MS / DAY_MS
export const PROVIDER_SPEND_MAX_ROWS = MAX_LEDGER_ROWS
export const PROVIDER_SPEND_MAX_BYTES = MAX_LEDGER_BYTES

export type ProviderSpendState =
  | 'reserved'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'unknown'

export type ProviderSpendReservationInput = {
  provider: ProviderId
  capability: ProviderCapability
  endpoint: string
  projectId?: string
  reportId: string
  reportRunId: string
  requestedRows: number
  estimatedCostMicros: number
}

export type ProviderSpendReservation = ProviderSpendReservationInput & {
  id: string
  occurredAt: string
  expiresAt: string
}

export type ProviderSpendFinalization = {
  provider: ProviderId
  state: Exclude<ProviderSpendState, 'reserved' | 'unknown'>
  actualCostMicros: number | null
  returnedRows: number | null
  taskIds: string[]
}

export type ProviderSpendNotice = {
  provider: ProviderId
  thresholdMicros: number
  periodStart: string
  spentMicros: number
}

export type ProviderSpendSummary = {
  provider: ProviderId
  periodTimezone: 'UTC'
  today: {
    periodStart: string
    effectiveCostMicros: number
    actualCostMicros: number
    estimatedOrUnknownCostMicros: number
    requests: number
  }
  month: {
    periodStart: string
    effectiveCostMicros: number
    actualCostMicros: number
    estimatedOrUnknownCostMicros: number
    requests: number
  }
  retained: {
    effectiveCostMicros: number
    actualCostMicros: number
    estimatedOrUnknownCostMicros: number
    requests: number
    oldestAt: string | null
    newestAt: string | null
  }
  states: Record<ProviderSpendState, number>
  limits: ProviderSpendLimits
  retention: {
    days: number
    maxRows: number
    maxBytes: number
    logicalBytes: number
  }
}

type SpendTotalsRow = {
  effective_cost?: number
  actual_cost?: number
  estimated_or_unknown_cost?: number
  requests?: number
  oldest_at?: number | null
  newest_at?: number | null
}

function boundedText(
  provider: ProviderId,
  value: string,
  label: string,
  max: number,
): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > max) {
    throw new ProviderError({
      provider,
      operation: 'spend-reservation',
      code: 'configuration',
      message: `${label} must contain 1 to ${max} characters.`,
    })
  }
  return normalized
}

function nonnegativeInteger(
  provider: ProviderId,
  value: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProviderError({
      provider,
      operation: 'spend-reservation',
      code: 'configuration',
      message: `${label} must be a non-negative safe integer.`,
    })
  }
  return value
}

function utcDayStart(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function utcMonthStart(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

function iso(timestamp: number | null | undefined): string | null {
  return timestamp === null || timestamp === undefined
    ? null
    : new Date(timestamp).toISOString()
}

function logicalBytes(database: Database.Database): number {
  const row = database
    .prepare(
      `SELECT COALESCE(SUM(
        LENGTH(id) + LENGTH(provider) + LENGTH(capability) + LENGTH(endpoint) +
        COALESCE(LENGTH(project_id), 0) + LENGTH(report_id) +
        LENGTH(report_run_id) + LENGTH(state) + LENGTH(task_ids_json) + 256
      ), 0) AS size_bytes
      FROM provider_spend_ledger`,
    )
    .get() as { size_bytes?: number } | undefined
  return Number(row?.size_bytes ?? 0)
}

function pruneLedger(database: Database.Database, now: number): void {
  database
    .prepare('DELETE FROM provider_spend_ledger WHERE occurred_at < ?')
    .run(now - RETENTION_MS)
  database
    .prepare('DELETE FROM provider_spend_notices WHERE period_start < ?')
    .run(now - RETENTION_MS)
  database
    .prepare(
      `UPDATE provider_spend_ledger
       SET state = 'unknown', updated_at = ?, reservation_expires_at = NULL
       WHERE state = 'reserved' AND reservation_expires_at <= ?`,
    )
    .run(now, now)

  const count = database
    .prepare('SELECT COUNT(*) AS count FROM provider_spend_ledger')
    .get() as { count: number }
  if (count.count > MAX_LEDGER_ROWS) {
    database
      .prepare(
        `DELETE FROM provider_spend_ledger
         WHERE id IN (
           SELECT id FROM provider_spend_ledger
           WHERE state <> 'reserved'
           ORDER BY occurred_at ASC, id ASC
           LIMIT ?
         )`,
      )
      .run(count.count - MAX_LEDGER_ROWS)
  }

  if (logicalBytes(database) <= MAX_LEDGER_BYTES) return
  const rows = database
    .prepare(
      `SELECT id,
        LENGTH(id) + LENGTH(provider) + LENGTH(capability) + LENGTH(endpoint) +
        COALESCE(LENGTH(project_id), 0) + LENGTH(report_id) +
        LENGTH(report_run_id) + LENGTH(state) + LENGTH(task_ids_json) + 256
          AS size_bytes
       FROM provider_spend_ledger
       WHERE state <> 'reserved'
       ORDER BY occurred_at DESC, id DESC`,
    )
    .all() as Array<{ id: string; size_bytes: number }>
  let retainedBytes = 0
  const remove: string[] = []
  for (const row of rows) {
    if (retainedBytes + row.size_bytes <= MAX_LEDGER_BYTES) {
      retainedBytes += row.size_bytes
    } else {
      remove.push(row.id)
    }
  }
  const statement = database.prepare(
    'DELETE FROM provider_spend_ledger WHERE id = ?',
  )
  for (const id of remove) statement.run(id)
}

function spendTotals(
  database: Database.Database,
  provider: ProviderId,
  since?: number,
): SpendTotalsRow {
  const where =
    since === undefined ? 'provider = ?' : 'provider = ? AND occurred_at >= ?'
  return database
    .prepare(
      `SELECT
        COALESCE(SUM(COALESCE(actual_cost_micros, estimated_cost_micros)), 0)
          AS effective_cost,
        COALESCE(SUM(COALESCE(actual_cost_micros, 0)), 0) AS actual_cost,
        COALESCE(SUM(
          CASE WHEN actual_cost_micros IS NULL THEN estimated_cost_micros ELSE 0 END
        ), 0) AS estimated_or_unknown_cost,
        COUNT(*) AS requests,
        MIN(occurred_at) AS oldest_at,
        MAX(occurred_at) AS newest_at
       FROM provider_spend_ledger WHERE ${where}`,
    )
    .get(
      ...(since === undefined ? [provider] : [provider, since]),
    ) as SpendTotalsRow
}

function limitError(provider: ProviderId, message: string): ProviderError {
  return new ProviderError({
    provider,
    operation: 'spend-reservation',
    code: 'budget-limit',
    message,
  })
}

export function reserveProviderSpend(
  input: ProviderSpendReservationInput,
  options: {
    database?: Database.Database
    limits?: ProviderSpendLimits
    now?: number
  } = {},
): ProviderSpendReservation {
  const database = options.database ?? getDb()
  const limits = options.limits ?? getProviderSpendLimits(input.provider)
  const now = options.now ?? Date.now()
  const normalized = {
    ...input,
    endpoint: boundedText(
      input.provider,
      input.endpoint,
      'Provider endpoint',
      500,
    ),
    projectId: input.projectId
      ? boundedText(input.provider, input.projectId, 'Project id', 200)
      : undefined,
    reportId: boundedText(input.provider, input.reportId, 'Report id', 100),
    reportRunId: boundedText(
      input.provider,
      input.reportRunId,
      'Report run id',
      100,
    ),
    requestedRows: nonnegativeInteger(
      input.provider,
      input.requestedRows,
      'Requested rows',
    ),
    estimatedCostMicros: nonnegativeInteger(
      input.provider,
      input.estimatedCostMicros,
      'Estimated cost',
    ),
  }

  const reserve = database.transaction(() => {
    pruneLedger(database, now)
    const active = database
      .prepare(
        `SELECT COUNT(*) AS count FROM provider_spend_ledger
         WHERE state = 'reserved'`,
      )
      .get() as { count: number }
    if (active.count >= MAX_ACTIVE_RESERVATIONS) {
      throw limitError(
        input.provider,
        `The local provider ledger already has ${MAX_ACTIVE_RESERVATIONS} active requests. Wait for them to finish before starting more.`,
      )
    }
    const report = database
      .prepare(
        `SELECT COUNT(*) AS requests,
          COALESCE(SUM(requested_rows), 0) AS requested_rows
         FROM provider_spend_ledger
         WHERE provider = ? AND report_run_id = ?`,
      )
      .get(input.provider, normalized.reportRunId) as {
      requests: number
      requested_rows: number
    }
    if (report.requests + 1 > limits.maxRequestsPerReport) {
      throw limitError(
        input.provider,
        `The ${input.provider} request limit for this report is ${limits.maxRequestsPerReport}. Start a new report run or raise the local limit.`,
      )
    }
    if (
      report.requested_rows + normalized.requestedRows >
      limits.maxRowsPerReport
    ) {
      throw limitError(
        input.provider,
        `The ${input.provider} row limit for this report is ${limits.maxRowsPerReport}. Reduce the request or raise the local limit.`,
      )
    }

    const daySpend = Number(
      spendTotals(database, input.provider, utcDayStart(now)).effective_cost ??
        0,
    )
    const monthSpend = Number(
      spendTotals(database, input.provider, utcMonthStart(now))
        .effective_cost ?? 0,
    )
    if (
      limits.dailyHardLimitMicros !== null &&
      daySpend + normalized.estimatedCostMicros > limits.dailyHardLimitMicros
    ) {
      throw limitError(
        input.provider,
        `The ${input.provider} UTC daily hard limit would be exceeded. Current effective spend is ${daySpend} micros and this request is estimated at ${normalized.estimatedCostMicros} micros.`,
      )
    }
    if (
      limits.monthlyHardLimitMicros !== null &&
      monthSpend + normalized.estimatedCostMicros >
        limits.monthlyHardLimitMicros
    ) {
      throw limitError(
        input.provider,
        `The ${input.provider} UTC monthly hard limit would be exceeded. Current effective spend is ${monthSpend} micros and this request is estimated at ${normalized.estimatedCostMicros} micros.`,
      )
    }

    const id = randomUUID()
    const expiresAt = now + RESERVATION_TTL_MS
    database
      .prepare(
        `INSERT INTO provider_spend_ledger (
          id, provider, capability, endpoint, project_id, report_id,
          report_run_id, requested_rows, returned_rows,
          estimated_cost_micros, actual_cost_micros, state, task_ids_json,
          occurred_at, updated_at, reservation_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'reserved', '[]', ?, ?, ?)`,
      )
      .run(
        id,
        input.provider,
        input.capability,
        normalized.endpoint,
        normalized.projectId ?? null,
        normalized.reportId,
        normalized.reportRunId,
        normalized.requestedRows,
        normalized.estimatedCostMicros,
        now,
        now,
        expiresAt,
      )
    return {
      ...normalized,
      id,
      occurredAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    }
  })
  return reserve.immediate() as ProviderSpendReservation
}

export function finalizeProviderSpend(
  reservationId: string,
  result: ProviderSpendFinalization,
  options: {
    database?: Database.Database
    limits?: ProviderSpendLimits
    now?: number
  } = {},
): ProviderSpendNotice | null {
  const database = options.database ?? getDb()
  const now = options.now ?? Date.now()
  const taskIds = [...new Set(result.taskIds)]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .slice(0, MAX_TASK_IDS)
    .map((id) => boundedText(result.provider, id, 'Provider task id', 100))
  const actualCostMicros =
    result.actualCostMicros === null
      ? null
      : nonnegativeInteger(
          result.provider,
          result.actualCostMicros,
          'Actual cost',
        )
  const returnedRows =
    result.returnedRows === null
      ? null
      : nonnegativeInteger(
          result.provider,
          result.returnedRows,
          'Returned rows',
        )

  const finalize = database.transaction(() => {
    pruneLedger(database, now)
    const reservation = database
      .prepare(
        `SELECT provider FROM provider_spend_ledger
         WHERE id = ? AND provider = ? AND state = 'reserved'`,
      )
      .get(reservationId, result.provider) as
      | { provider: ProviderId }
      | undefined
    if (!reservation) {
      throw new ProviderError({
        provider: result.provider,
        operation: 'spend-finalization',
        code: 'configuration',
        message: 'Provider spend reservation is missing or already finalized.',
      })
    }
    database
      .prepare(
        `UPDATE provider_spend_ledger
         SET returned_rows = ?, actual_cost_micros = ?, state = ?,
             task_ids_json = ?, updated_at = ?, reservation_expires_at = NULL
         WHERE id = ?`,
      )
      .run(
        returnedRows,
        actualCostMicros,
        result.state,
        JSON.stringify(taskIds),
        now,
        reservationId,
      )

    const limits =
      options.limits ?? getProviderSpendLimits(reservation.provider)
    if (limits.dailyNoticeMicros <= 0) return null
    const periodStart = utcDayStart(now)
    const spentMicros = Number(
      spendTotals(database, reservation.provider, periodStart).effective_cost ??
        0,
    )
    if (spentMicros < limits.dailyNoticeMicros) return null
    const inserted = database
      .prepare(
        `INSERT OR IGNORE INTO provider_spend_notices
         (provider, threshold_micros, period_start, emitted_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(reservation.provider, limits.dailyNoticeMicros, periodStart, now)
    return inserted.changes > 0
      ? {
          provider: reservation.provider,
          thresholdMicros: limits.dailyNoticeMicros,
          periodStart: new Date(periodStart).toISOString(),
          spentMicros,
        }
      : null
  })
  return finalize.immediate() as ProviderSpendNotice | null
}

export function getProviderSpendSummary(
  provider: ProviderId,
  options: {
    database?: Database.Database
    limits?: ProviderSpendLimits
    now?: number
  } = {},
): ProviderSpendSummary {
  const database = options.database ?? getDb()
  const now = options.now ?? Date.now()
  pruneLedger(database, now)
  const dayStart = utcDayStart(now)
  const monthStart = utcMonthStart(now)
  const day = spendTotals(database, provider, dayStart)
  const month = spendTotals(database, provider, monthStart)
  const retained = spendTotals(database, provider)
  const stateRows = database
    .prepare(
      `SELECT state, COUNT(*) AS count FROM provider_spend_ledger
       WHERE provider = ? GROUP BY state`,
    )
    .all(provider) as Array<{ state: ProviderSpendState; count: number }>
  const states: Record<ProviderSpendState, number> = {
    reserved: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    unknown: 0,
  }
  for (const row of stateRows) states[row.state] = row.count

  const period = (row: SpendTotalsRow, periodStart: number) => ({
    periodStart: new Date(periodStart).toISOString(),
    effectiveCostMicros: Number(row.effective_cost ?? 0),
    actualCostMicros: Number(row.actual_cost ?? 0),
    estimatedOrUnknownCostMicros: Number(row.estimated_or_unknown_cost ?? 0),
    requests: Number(row.requests ?? 0),
  })
  return {
    provider,
    periodTimezone: 'UTC',
    today: period(day, dayStart),
    month: period(month, monthStart),
    retained: {
      effectiveCostMicros: Number(retained.effective_cost ?? 0),
      actualCostMicros: Number(retained.actual_cost ?? 0),
      estimatedOrUnknownCostMicros: Number(
        retained.estimated_or_unknown_cost ?? 0,
      ),
      requests: Number(retained.requests ?? 0),
      oldestAt: iso(retained.oldest_at),
      newestAt: iso(retained.newest_at),
    },
    states,
    limits: options.limits ?? getProviderSpendLimits(provider),
    retention: {
      days: PROVIDER_SPEND_RETENTION_DAYS,
      maxRows: PROVIDER_SPEND_MAX_ROWS,
      maxBytes: PROVIDER_SPEND_MAX_BYTES,
      logicalBytes: logicalBytes(database),
    },
  }
}
