import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import { getDb } from '../storage/database.js'
import type Database from '../storage/sqlite.js'
import { RANK_TRACKING_LIMITS } from './limits.js'
import {
  database,
  invalid,
  nextRunAt,
  observationFromRow,
  runFromRow,
  taskFromRow,
  type RankTrackingStoreOptions,
  type RunRow,
  type SnapshotRow,
  type TaskRow,
} from './configuration-store.js'
import type {
  RankObservation,
  RankTrackingConfiguration,
  RankTrackingRun,
  RankTrackingTask,
} from './types.js'

export {
  getOrCreateRankTrackingConfiguration,
  targetMatchesDomain,
} from './configuration-store.js'
export type { RankTrackingStoreOptions } from './configuration-store.js'

export function activeRankTrackingRun(
  configId: string,
  options: RankTrackingStoreOptions = {},
): RankTrackingRun | null {
  const row = database(options)
    .prepare(
      `SELECT * FROM rank_tracking_runs
       WHERE config_id = ? AND completed_at IS NULL
       ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get(configId) as RunRow | undefined
  return row ? runFromRow(row) : null
}

export function startRankTrackingRun(
  input: {
    configuration: RankTrackingConfiguration
    keywords: Array<{ keyword: string; normalizedKeyword: string }>
    scheduledFor?: Date
  },
  options: RankTrackingStoreOptions = {},
): RankTrackingRun {
  const db = database(options)
  const active = activeRankTrackingRun(input.configuration.id, { database: db })
  if (active) return active
  if (input.keywords.length < 1)
    invalid('The selected keyword set view is empty.')
  const now = (options.now ?? (() => new Date()))().getTime()
  const scheduledFor = input.scheduledFor?.getTime() ?? now
  const runId = (options.id ?? randomUUID)()
  const idempotencyKey = `${input.configuration.id}:${scheduledFor}`
  const taskCount = input.keywords.length * input.configuration.devices.length
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO rank_tracking_runs
       (id, config_id, idempotency_key, state, collection_method, scheduled_for,
        started_at, keyword_count, task_count, pending_count, config_snapshot_json)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      input.configuration.id,
      idempotencyKey,
      input.configuration.collectionMethod,
      scheduledFor,
      now,
      input.keywords.length,
      taskCount,
      taskCount,
      JSON.stringify(input.configuration),
    )
    const insertTask = db.prepare(
      `INSERT INTO rank_tracking_tasks
       (id, run_id, normalized_keyword, display_keyword, device, state)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
    )
    for (const keyword of input.keywords) {
      for (const device of input.configuration.devices) {
        insertTask.run(
          (options.id ?? randomUUID)(),
          runId,
          keyword.normalizedKeyword,
          keyword.keyword,
          device,
        )
      }
    }
    db.prepare(
      `UPDATE rank_tracking_configs
       SET next_run_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      nextRunAt(input.configuration.cadence, scheduledFor),
      now,
      input.configuration.id,
    )
  })
  try {
    create.immediate()
  } catch (error) {
    if (/unique constraint/i.test(String(error))) {
      const recovered = activeRankTrackingRun(input.configuration.id, {
        database: db,
      })
      if (recovered) return recovered
    }
    throw error
  }
  return getRankTrackingRun(runId, { database: db })
}

export function getRankTrackingRun(
  runId: string,
  options: RankTrackingStoreOptions = {},
): RankTrackingRun {
  const row = database(options)
    .prepare('SELECT * FROM rank_tracking_runs WHERE id = ?')
    .get(runId) as RunRow | undefined
  if (!row)
    throw new SeoError('INTERNAL_ERROR', 'Rank tracking run is missing.')
  return runFromRow(row)
}

export function rankTrackingTasks(
  runId: string,
  states?: RankTrackingTask['state'][],
  options: RankTrackingStoreOptions = {},
): RankTrackingTask[] {
  const filter = states?.length
    ? ` AND state IN (${states.map(() => '?').join(', ')})`
    : ''
  return (
    database(options)
      .prepare(
        `SELECT * FROM rank_tracking_tasks WHERE run_id = ?${filter}
         ORDER BY normalized_keyword, device, id`,
      )
      .all(runId, ...(states ?? [])) as TaskRow[]
  ).map(taskFromRow)
}

export function markRankTasksPosted(
  runId: string,
  receipts: Array<{ taskId: string; providerTaskId: string }>,
  cost: { estimatedMicros: number | null; actualMicros: number | null },
  options: RankTrackingStoreOptions = {},
): void {
  const db = database(options)
  const now = (options.now ?? (() => new Date()))().getTime()
  const update = db.transaction(() => {
    const statement = db.prepare(
      `UPDATE rank_tracking_tasks
       SET state = 'posted', provider_task_id = ?, posted_at = ?,
           attempt_count = attempt_count + 1, error_code = NULL,
           error_message = NULL
       WHERE id = ? AND run_id = ? AND state IN ('pending', 'posting')`,
    )
    for (const receipt of receipts) {
      const result = statement.run(
        receipt.providerTaskId,
        now,
        receipt.taskId,
        runId,
      )
      if (result.changes !== 1) {
        throw new SeoError(
          'INTERNAL_ERROR',
          'A queued rank task changed before its receipt was saved.',
        )
      }
    }
    db.prepare(
      `UPDATE rank_tracking_runs
       SET estimated_cost_micros = CASE
             WHEN ? IS NULL THEN estimated_cost_micros
             ELSE COALESCE(estimated_cost_micros, 0) + ? END,
           actual_cost_micros = CASE
             WHEN ? IS NULL THEN actual_cost_micros
             ELSE COALESCE(actual_cost_micros, 0) + ? END
       WHERE id = ?`,
    ).run(
      cost.estimatedMicros,
      cost.estimatedMicros,
      cost.actualMicros,
      cost.actualMicros,
      runId,
    )
  })
  update.immediate()
}

export function markRankTasksPosting(
  runId: string,
  taskIds: string[],
  options: RankTrackingStoreOptions = {},
): void {
  if (taskIds.length === 0) return
  const db = database(options)
  const update = db.transaction(() => {
    const statement = db.prepare(
      `UPDATE rank_tracking_tasks
       SET state = 'posting', attempt_count = attempt_count + 1
       WHERE id = ? AND run_id = ? AND state = 'pending'`,
    )
    for (const taskId of taskIds) {
      if (statement.run(taskId, runId).changes !== 1) {
        throw new SeoError(
          'INTERNAL_ERROR',
          'A queued rank task changed before posting started.',
        )
      }
    }
  })
  update.immediate()
}

export function recoverRankTaskReceipt(
  input: { taskId: string; providerTaskId: string },
  options: RankTrackingStoreOptions = {},
): void {
  const now = (options.now ?? (() => new Date()))().getTime()
  database(options)
    .prepare(
      `UPDATE rank_tracking_tasks
       SET state = 'posted', provider_task_id = ?, posted_at = ?
       WHERE id = ? AND state = 'posting'`,
    )
    .run(input.providerTaskId, now, input.taskId)
}

export function saveRankObservation(
  observation: RankObservation,
  options: RankTrackingStoreOptions = {},
): void {
  const db = database(options)
  const now = (options.now ?? (() => new Date()))().getTime()
  const save = db.transaction(() => {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO rank_tracking_snapshots
       (task_id, run_id, normalized_keyword, display_keyword, device,
        observation_state, organic_position, absolute_position, ranking_url,
        observed_features_json, checked_at, provider, provider_task_id,
        requested_depth, returned_rows, retained_rows, invalid_rows,
        completeness, estimated_cost_micros, actual_cost_micros, warnings_json,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        observation.taskId,
        observation.runId,
        observation.normalizedKeyword,
        observation.keyword,
        observation.device,
        observation.state,
        observation.organicPosition,
        observation.absolutePosition,
        observation.rankingUrl,
        JSON.stringify(observation.observedFeatures),
        observation.checkedAt,
        observation.provider,
        observation.providerTaskId,
        observation.requestedDepth,
        observation.returnedRows,
        observation.retainedRows,
        observation.invalidRows,
        observation.completeness,
        observation.estimatedCostMicros,
        observation.actualCostMicros,
        JSON.stringify(observation.warnings),
        now,
      )
    db.prepare(
      `UPDATE rank_tracking_tasks
       SET state = 'complete', collected_at = ?, error_code = NULL,
           error_message = NULL WHERE id = ?`,
    ).run(now, observation.taskId)
    if (inserted.changes === 1) {
      db.prepare(
        `UPDATE rank_tracking_runs
         SET estimated_cost_micros = CASE
               WHEN ? IS NULL THEN estimated_cost_micros
               ELSE COALESCE(estimated_cost_micros, 0) + ? END,
             actual_cost_micros = CASE
               WHEN ? IS NULL THEN actual_cost_micros
               ELSE COALESCE(actual_cost_micros, 0) + ? END
         WHERE id = ? AND collection_method = 'live'`,
      ).run(
        observation.estimatedCostMicros,
        observation.estimatedCostMicros,
        observation.actualCostMicros,
        observation.actualCostMicros,
        observation.runId,
      )
    }
  })
  save.immediate()
  refreshRankTrackingRun(observation.runId, { database: db, now: options.now })
}

export function failRankTrackingTask(
  input: { taskId: string; code: string; message: string },
  options: RankTrackingStoreOptions = {},
): void {
  const db = database(options)
  const row = db
    .prepare('SELECT run_id FROM rank_tracking_tasks WHERE id = ?')
    .get(input.taskId) as { run_id: string } | undefined
  if (!row) return
  db.prepare(
    `UPDATE rank_tracking_tasks
     SET state = 'failed', attempt_count = attempt_count + 1,
         error_code = ?, error_message = ? WHERE id = ?`,
  ).run(input.code.slice(0, 100), input.message.slice(0, 1_000), input.taskId)
  refreshRankTrackingRun(row.run_id, { database: db, now: options.now })
}

export function refreshRankTrackingRun(
  runId: string,
  options: RankTrackingStoreOptions = {},
): RankTrackingRun {
  const db = database(options)
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN state = 'complete' THEN 1 ELSE 0 END) AS snapshots,
         SUM(CASE WHEN state IN ('pending', 'posting', 'posted') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM rank_tracking_tasks WHERE run_id = ?`,
    )
    .get(runId) as { snapshots: number; pending: number; failed: number }
  const state =
    counts.pending > 0
      ? counts.snapshots > 0 || counts.failed > 0
        ? 'partial'
        : 'pending'
      : counts.failed > 0
        ? counts.snapshots > 0
          ? 'partial'
          : 'failed'
        : 'complete'
  const now = (options.now ?? (() => new Date()))().getTime()
  db.prepare(
    `UPDATE rank_tracking_runs
     SET state = ?, snapshot_count = ?, pending_count = ?, failed_count = ?,
         completed_at = CASE WHEN ? = 0 THEN ? ELSE NULL END,
         error_summary = CASE WHEN ? > 0 THEN ? ELSE NULL END
     WHERE id = ?`,
  ).run(
    state,
    counts.snapshots,
    counts.pending,
    counts.failed,
    counts.pending,
    now,
    counts.failed,
    `${counts.failed} rank task${counts.failed === 1 ? '' : 's'} failed.`,
    runId,
  )
  if (counts.pending === 0) {
    pruneRankTrackingRuns(runId, { ...options, database: db })
  }
  return getRankTrackingRun(runId, { database: db })
}

function pruneRankTrackingRuns(
  runId: string,
  options: RankTrackingStoreOptions = {},
): void {
  const db = database(options)
  const row = db
    .prepare('SELECT config_id FROM rank_tracking_runs WHERE id = ?')
    .get(runId) as { config_id: string } | undefined
  if (!row) return
  db.prepare(
    `DELETE FROM rank_tracking_runs
     WHERE config_id = ? AND id IN (
       SELECT id FROM rank_tracking_runs
       WHERE config_id = ? AND completed_at IS NOT NULL
       ORDER BY started_at DESC, id DESC LIMIT -1 OFFSET ?
     )`,
  ).run(
    row.config_id,
    row.config_id,
    RANK_TRACKING_LIMITS.retainedRunsPerConfiguration,
  )
  const maxBytes = options.maxLogicalBytes ?? RANK_TRACKING_LIMITS.logicalBytes
  while (rankTrackingLogicalBytes(db) > maxBytes) {
    const oldest = db
      .prepare(
        `SELECT id FROM rank_tracking_runs
         WHERE config_id = ? AND id <> ?
           AND completed_at IS NOT NULL
         ORDER BY started_at, id LIMIT 1`,
      )
      .get(row.config_id, runId) as { id: string } | undefined
    if (!oldest) break
    db.prepare('DELETE FROM rank_tracking_runs WHERE id = ?').run(oldest.id)
  }
  enforceRankTrackingLogicalBytes(db, maxBytes)
}

export function latestRankTrackingRun(
  configId: string,
  options: RankTrackingStoreOptions = {},
): RankTrackingRun | null {
  const row = database(options)
    .prepare(
      `SELECT * FROM rank_tracking_runs WHERE config_id = ?
       ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get(configId) as RunRow | undefined
  return row ? runFromRow(row) : null
}

export function priorComparableRankTrackingRun(
  configId: string,
  currentRunId: string,
  options: RankTrackingStoreOptions = {},
): RankTrackingRun | null {
  const row = database(options)
    .prepare(
      `SELECT previous.* FROM rank_tracking_runs previous
       JOIN rank_tracking_runs current ON current.id = ?
       WHERE previous.config_id = ? AND previous.id <> current.id
         AND previous.started_at < current.started_at
         AND previous.snapshot_count > 0
       ORDER BY previous.started_at DESC, previous.id DESC LIMIT 1`,
    )
    .get(currentRunId, configId) as RunRow | undefined
  return row ? runFromRow(row) : null
}

export function rankObservations(
  runId: string,
  options: RankTrackingStoreOptions = {},
): RankObservation[] {
  return (
    database(options)
      .prepare(
        `SELECT * FROM rank_tracking_snapshots WHERE run_id = ?
         ORDER BY normalized_keyword, device, task_id`,
      )
      .all(runId) as SnapshotRow[]
  ).map(observationFromRow)
}

export function rankTrackingLogicalBytes(
  db: Database.Database = getDb(),
): number {
  const row = db
    .prepare(
      `SELECT
       COALESCE((SELECT SUM(length(id) + length(config_key) + length(project_id) + length(keyword_set_id) + length(target_domain) + COALESCE(length(tag), 0) + length(market_json) + length(devices_json) + length(provider) + length(collection_method) + length(cadence)) FROM rank_tracking_configs), 0) +
       COALESCE((SELECT SUM(length(id) + length(config_id) + length(idempotency_key) + length(state) + length(collection_method) + length(config_snapshot_json) + COALESCE(length(error_summary), 0)) FROM rank_tracking_runs), 0) +
       COALESCE((SELECT SUM(length(id) + length(run_id) + length(normalized_keyword) + length(display_keyword) + length(device) + length(state) + COALESCE(length(provider_task_id), 0) + COALESCE(length(error_code), 0) + COALESCE(length(error_message), 0)) FROM rank_tracking_tasks), 0) +
       COALESCE((SELECT SUM(length(task_id) + length(run_id) + length(normalized_keyword) + length(display_keyword) + length(device) + length(observation_state) + COALESCE(length(ranking_url), 0) + length(observed_features_json) + length(checked_at) + length(provider) + COALESCE(length(provider_task_id), 0) + length(completeness) + length(warnings_json)) FROM rank_tracking_snapshots), 0)
       AS bytes`,
    )
    .get() as { bytes: number }
  return row.bytes
}

export function enforceRankTrackingLogicalBytes(
  db: Database.Database,
  maxBytes = RANK_TRACKING_LIMITS.logicalBytes,
): void {
  if (rankTrackingLogicalBytes(db) > maxBytes) {
    throw new SeoError(
      'INVALID_INPUT',
      'Saved rank history reached its local storage limit. Remove an unused tracking configuration before collecting more.',
    )
  }
}
