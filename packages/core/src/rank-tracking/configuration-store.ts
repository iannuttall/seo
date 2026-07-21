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

export type RunRow = {
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

export type TaskRow = {
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

export type SnapshotRow = {
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

export function invalid(message: string): never {
  throw new SeoError('INVALID_INPUT', message)
}

export function database(options: RankTrackingStoreOptions): Database.Database {
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

export function runFromRow(row: RunRow): RankTrackingRun {
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

export function taskFromRow(row: TaskRow): RankTrackingTask {
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

export function observationFromRow(row: SnapshotRow): RankObservation {
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

export function nextRunAt(cadence: RankTrackingCadence, scheduledFor: number) {
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
