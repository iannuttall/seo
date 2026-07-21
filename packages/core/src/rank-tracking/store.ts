import { createHash, randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import { getKeywordSet } from '../keyword-sets/store.js'
import { providerIdSchema, searchMarketSchema } from '../providers/contracts.js'
import { getDb } from '../storage/database.js'
import type Database from '../storage/sqlite.js'
import { RANK_TRACKING_LIMITS } from './limits.js'
import type {
  RankObservation,
  RankTrackingCadence,
  RankTrackingCollectionMethod,
  RankTrackingConfiguration,
  RankTrackingDevice,
  RankTrackingRun,
  RankTrackingTask,
} from './types.js'

export type RankTrackingStoreOptions = {
  database?: Database.Database
  now?: () => Date
  id?: () => string
  maxLogicalBytes?: number
}

type ConfigRow = {
  id: string
  config_key: string
  project_id: string
  keyword_set_id: string
  target_domain: string
  tag: string | null
  market_json: string
  devices_json: string
  provider: string
  collection_method: string
  cadence: string
  depth: number
  keyword_limit: number
  next_run_at: number | null
  created_at: number
  updated_at: number
}

type RunRow = {
  id: string
  config_id: string
  state: string
  collection_method: string
  scheduled_for: number
  started_at: number
  completed_at: number | null
  keyword_count: number
  task_count: number
  snapshot_count: number
  pending_count: number
  failed_count: number
  estimated_cost_micros: number | null
  actual_cost_micros: number | null
  error_summary: string | null
}

type TaskRow = {
  id: string
  run_id: string
  normalized_keyword: string
  display_keyword: string
  device: string
  state: string
  provider_task_id: string | null
  attempt_count: number
  error_code: string | null
  error_message: string | null
}

type SnapshotRow = {
  task_id: string
  run_id: string
  normalized_keyword: string
  display_keyword: string
  device: string
  observation_state: string
  organic_position: number | null
  absolute_position: number | null
  ranking_url: string | null
  observed_features_json: string
  checked_at: string
  provider: string
  provider_task_id: string | null
  requested_depth: number
  returned_rows: number | null
  retained_rows: number | null
  invalid_rows: number
  completeness: string
  estimated_cost_micros: number | null
  actual_cost_micros: number | null
  warnings_json: string
}

function invalid(message: string): never {
  throw new SeoError('INVALID_INPUT', message)
}

function database(options: RankTrackingStoreOptions): Database.Database {
  return options.database ?? getDb()
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new SeoError('INTERNAL_ERROR', `${label} is corrupt.`)
  }
}

function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw || raw.length > 253) invalid('Use a valid target domain.')
  let hostname: string
  try {
    hostname = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
  } catch {
    invalid('Use a valid target domain.')
  }
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('..') ||
    !/^[a-z0-9.-]+$/u.test(hostname)
  ) {
    invalid('Use a valid target domain.')
  }
  return hostname.replace(/\.$/u, '')
}

export function targetMatchesDomain(
  targetDomain: string,
  candidate: string,
): boolean {
  const target = normalizeDomain(targetDomain)
  const host = normalizeDomain(candidate)
  return host === target || host.endsWith(`.${target}`)
}

function configFromRow(row: ConfigRow): RankTrackingConfiguration {
  const market = searchMarketSchema.safeParse(
    parseJson<unknown>(row.market_json, 'Saved rank market'),
  )
  const devices = parseJson<unknown>(row.devices_json, 'Saved rank devices')
  const provider = providerIdSchema.safeParse(row.provider)
  if (
    !market.success ||
    market.data.device !== undefined ||
    !Array.isArray(devices) ||
    devices.length < 1 ||
    devices.length > 2 ||
    devices.some((item) => item !== 'desktop' && item !== 'mobile') ||
    !provider.success
  ) {
    throw new SeoError(
      'INTERNAL_ERROR',
      'Saved rank tracking configuration is invalid.',
    )
  }
  return {
    schemaVersion: 1,
    id: row.id,
    projectId: row.project_id,
    keywordSetId: row.keyword_set_id,
    targetDomain: row.target_domain,
    tag: row.tag,
    market: market.data,
    devices: devices as RankTrackingDevice[],
    provider: provider.data,
    collectionMethod: row.collection_method as RankTrackingCollectionMethod,
    cadence: row.cadence as RankTrackingCadence,
    depth: row.depth,
    keywordLimit: row.keyword_limit,
    nextRunAt:
      row.next_run_at === null ? null : new Date(row.next_run_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function runFromRow(row: RunRow): RankTrackingRun {
  return {
    schemaVersion: 1,
    id: row.id,
    configId: row.config_id,
    state: row.state as RankTrackingRun['state'],
    collectionMethod: row.collection_method as RankTrackingCollectionMethod,
    scheduledFor: new Date(row.scheduled_for).toISOString(),
    startedAt: new Date(row.started_at).toISOString(),
    completedAt:
      row.completed_at === null
        ? null
        : new Date(row.completed_at).toISOString(),
    keywordCount: row.keyword_count,
    taskCount: row.task_count,
    snapshotCount: row.snapshot_count,
    pendingCount: row.pending_count,
    failedCount: row.failed_count,
    estimatedCostMicros: row.estimated_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    errorSummary: row.error_summary,
  }
}

function taskFromRow(row: TaskRow): RankTrackingTask {
  return {
    id: row.id,
    runId: row.run_id,
    normalizedKeyword: row.normalized_keyword,
    displayKeyword: row.display_keyword,
    device: row.device as RankTrackingDevice,
    state: row.state as RankTrackingTask['state'],
    providerTaskId: row.provider_task_id,
    attemptCount: row.attempt_count,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  }
}

function observationFromRow(row: SnapshotRow): RankObservation {
  const provider = providerIdSchema.safeParse(row.provider)
  if (!provider.success) {
    throw new SeoError('INTERNAL_ERROR', 'Saved rank provider is invalid.')
  }
  return {
    taskId: row.task_id,
    runId: row.run_id,
    keyword: row.display_keyword,
    normalizedKeyword: row.normalized_keyword,
    device: row.device as RankTrackingDevice,
    state: row.observation_state as RankObservation['state'],
    organicPosition: row.organic_position,
    absolutePosition: row.absolute_position,
    rankingUrl: row.ranking_url,
    observedFeatures: parseJson<string[]>(
      row.observed_features_json,
      'Saved rank features',
    ),
    checkedAt: row.checked_at,
    provider: provider.data,
    providerTaskId: row.provider_task_id,
    requestedDepth: row.requested_depth,
    returnedRows: row.returned_rows,
    retainedRows: row.retained_rows,
    invalidRows: row.invalid_rows,
    completeness: row.completeness,
    estimatedCostMicros: row.estimated_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    warnings: parseJson<RankObservation['warnings']>(
      row.warnings_json,
      'Saved rank warnings',
    ),
  }
}

function stableConfigKey(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function nextRunAt(cadence: RankTrackingCadence, scheduledFor: number) {
  if (cadence === 'manual') return null
  const next = new Date(scheduledFor)
  if (cadence === 'daily') next.setUTCDate(next.getUTCDate() + 1)
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  if (cadence === 'monthly') {
    const desiredDay = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate()
    next.setUTCDate(Math.min(desiredDay, lastDay))
  }
  return next.getTime()
}

export function getOrCreateRankTrackingConfiguration(
  input: {
    projectId: string
    keywordSetId: string
    targetDomain: string
    tag?: string
    market: unknown
    devices: RankTrackingDevice[]
    provider: unknown
    collectionMethod: RankTrackingCollectionMethod
    cadence: RankTrackingCadence
    depth: number
    keywordLimit: number
  },
  options: RankTrackingStoreOptions = {},
): RankTrackingConfiguration {
  const projectId = input.projectId.trim()
  const keywordSetId = input.keywordSetId.trim()
  const tag = input.tag?.trim().toLowerCase() || null
  if (!projectId || projectId.length > 80) invalid('Use a valid project id.')
  if (!keywordSetId || keywordSetId.length > 80)
    invalid('Use a valid keyword set id.')
  if (tag && tag.length > 40) invalid('Rank tracking tag is too long.')
  const market = searchMarketSchema.safeParse(input.market)
  if (!market.success) invalid('Use a valid rank tracking market.')
  const { device: _ignoredDevice, ...marketWithoutDevice } = market.data
  const devices = [...new Set(input.devices)].sort()
  if (
    devices.length < 1 ||
    devices.length > 2 ||
    devices.some((item) => item !== 'desktop' && item !== 'mobile')
  ) {
    invalid('Track desktop, mobile, or both devices.')
  }
  const provider = providerIdSchema.safeParse(input.provider)
  if (!provider.success) invalid('Use a supported rank tracking provider.')
  if (!['live', 'queued'].includes(input.collectionMethod))
    invalid('Use live or queued rank collection.')
  if (!['manual', 'daily', 'weekly', 'monthly'].includes(input.cadence))
    invalid('Use a supported rank tracking cadence.')
  if (
    !Number.isSafeInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > 100
  )
    invalid('Rank tracking depth must be from 1 to 100.')
  const maxKeywords =
    input.collectionMethod === 'live'
      ? RANK_TRACKING_LIMITS.liveKeywordsPerRun
      : RANK_TRACKING_LIMITS.queuedKeywordsPerRun
  if (
    !Number.isSafeInteger(input.keywordLimit) ||
    input.keywordLimit < 1 ||
    input.keywordLimit > maxKeywords
  ) {
    invalid(
      `${input.collectionMethod === 'live' ? 'Live' : 'Queued'} rank tracking can collect 1 to ${maxKeywords} keywords per run.`,
    )
  }
  const targetDomain = normalizeDomain(input.targetDomain)
  const db = database(options)
  const set = getKeywordSet(
    { projectId, idOrName: keywordSetId, limit: 1 },
    { database: db },
  ).set
  if (set.market.searchEngine !== marketWithoutDevice.searchEngine) {
    invalid('The rank tracking search engine must match the keyword set.')
  }
  const keyInput = {
    projectId,
    keywordSetId: set.id,
    targetDomain,
    tag,
    market: marketWithoutDevice,
    devices,
    provider: provider.data,
    collectionMethod: input.collectionMethod,
    cadence: input.cadence,
    depth: input.depth,
    keywordLimit: input.keywordLimit,
  }
  const configKey = stableConfigKey(keyInput)
  const existing = db
    .prepare('SELECT * FROM rank_tracking_configs WHERE config_key = ?')
    .get(configKey) as ConfigRow | undefined
  if (existing) return configFromRow(existing)
  const total = (
    db.prepare('SELECT COUNT(*) AS count FROM rank_tracking_configs').get() as {
      count: number
    }
  ).count
  const projectTotal = (
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM rank_tracking_configs WHERE project_id = ?',
      )
      .get(projectId) as { count: number }
  ).count
  if (total >= RANK_TRACKING_LIMITS.totalConfigurations)
    invalid('Remove an unused rank tracking configuration before adding more.')
  if (projectTotal >= RANK_TRACKING_LIMITS.configurationsPerProject)
    invalid(
      'This project already has the maximum rank tracking configurations.',
    )
  const now = (options.now ?? (() => new Date()))().getTime()
  const id = (options.id ?? randomUUID)()
  db.prepare(
    `INSERT INTO rank_tracking_configs
     (id, config_key, project_id, keyword_set_id, target_domain, tag,
      market_json, devices_json, provider, collection_method, cadence, depth,
      keyword_limit, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    configKey,
    projectId,
    set.id,
    targetDomain,
    tag,
    JSON.stringify(marketWithoutDevice),
    JSON.stringify(devices),
    provider.data,
    input.collectionMethod,
    input.cadence,
    input.depth,
    input.keywordLimit,
    input.cadence === 'manual' ? null : now,
    now,
    now,
  )
  return configFromRow(
    db
      .prepare('SELECT * FROM rank_tracking_configs WHERE id = ?')
      .get(id) as ConfigRow,
  )
}

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
