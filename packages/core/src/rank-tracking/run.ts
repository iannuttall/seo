import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import { getKeywordSet } from '../keyword-sets/store.js'
import type { SeoSerpSnapshotCapability } from '../provider-extensions/sdk.js'
import { installedSerpSnapshotProviders } from '../provider-extensions/serp.js'
import type {
  ProviderEvidence,
  SerpSnapshot,
  SerpSnapshotRequest,
} from '../providers/contracts.js'
import { getProviderSpendLimits } from '../providers/cost-limits.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { ProviderError } from '../providers/errors.js'
import { DataForSeoRankTrackingCollector } from './dataforseo-collector.js'
import { RANK_TRACKING_LIMITS } from './limits.js'
import { ProviderExtensionRankTrackingCollector } from './provider-extension-collector.js'
import {
  activeRankTrackingRun,
  failRankTrackingTask,
  getOrCreateRankTrackingConfiguration,
  latestRankTrackingRun,
  markRankTasksPosted,
  markRankTasksPosting,
  type RankTrackingStoreOptions,
  rankTrackingTasks,
  recoverRankTaskReceipt,
  saveRankObservations,
  startRankTrackingRun,
  targetMatchesDomain,
} from './store.js'
import type {
  RankObservation,
  RankTrackingCadence,
  RankTrackingCollectionMethod,
  RankTrackingCollector,
  RankTrackingConfiguration,
  RankTrackingDevice,
  RankTrackingRun,
  RankTrackingTask,
} from './types.js'

export type RankTrackingExecutionInput = {
  projectId: string
  set: string
  targetDomain: string
  tag?: string
  devices?: RankTrackingDevice[]
  provider?: import('../providers/contracts.js').ProviderId
  collectionMethod?: RankTrackingCollectionMethod
  cadence?: RankTrackingCadence
  depth?: number
  keywordLimit?: number
  start?: boolean
}

export type RankTrackingExecution = {
  configuration: RankTrackingConfiguration
  run: RankTrackingRun | null
  startedRun: boolean
  collectedTasks: number
  postedTasks: number
  operationalWarnings: string[]
}

export type RankTrackingExecutionDependencies = RankTrackingStoreOptions & {
  collector?: RankTrackingCollector
  providerSpendLimits?: typeof getProviderSpendLimits
  collectorFactory?: (
    provider: RankTrackingConfiguration['provider'],
  ) => Promise<RankTrackingCollector>
  providerExtension?: {
    displayName: string
    capability: SeoSerpSnapshotCapability
  }
}

function providerError(error: unknown): SeoError {
  if (!(error instanceof ProviderError)) {
    return error instanceof SeoError
      ? error
      : new SeoError('INTERNAL_ERROR', 'Rank collection failed unexpectedly.')
  }
  if (error.code === 'rate-limit')
    return new SeoError('RATE_LIMITED', error.message)
  if (error.code === 'configuration')
    return new SeoError('INVALID_INPUT', error.message)
  return new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

async function defaultCollector(
  provider: RankTrackingConfiguration['provider'],
): Promise<RankTrackingCollector> {
  if (provider !== 'dataforseo') {
    const installed = (await installedSerpSnapshotProviders()).find(
      (candidate) => candidate.adapter.provider === provider,
    )
    if (installed && !installed.connected) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `${provider} is installed but not connected. Connect it before rank collection.`,
      )
    }
    if (installed) {
      return new ProviderExtensionRankTrackingCollector(installed.adapter)
    }
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${provider} does not implement live SERP snapshots. Install a provider with that capability or use DataForSEO.`,
    )
  }
  if (!(await readDataForSeoCredentials())) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'DataForSEO is not connected. Run `seo providers dataforseo connect` first.',
    )
  }
  return new DataForSeoRankTrackingCollector()
}

function requestForTask(
  configuration: RankTrackingConfiguration,
  task: RankTrackingTask,
): SerpSnapshotRequest {
  return {
    keyword: task.displayKeyword,
    market: { ...configuration.market, device: task.device },
    depth: configuration.depth,
    refresh: true,
    context: {
      projectId: configuration.projectId,
      reportId: 'rank-tracking',
      reportRunId: task.runId,
    },
  }
}

function observationFromEvidence(
  configuration: RankTrackingConfiguration,
  task: RankTrackingTask,
  evidence: ProviderEvidence<SerpSnapshot>,
): RankObservation {
  const match = evidence.data.organicResults.find((result) => {
    try {
      return targetMatchesDomain(configuration.targetDomain, result.domain)
    } catch {
      return false
    }
  })
  if (
    !match &&
    evidence.coverage.completeness !== 'complete' &&
    evidence.coverage.completeness !== 'capped'
  ) {
    throw new ProviderError({
      provider: evidence.provider,
      operation: 'rank-tracking',
      code: 'invalid-response',
      message:
        'The partial SERP did not contain the target domain, so it cannot support a not-observed rank result.',
    })
  }
  return {
    taskId: task.id,
    runId: task.runId,
    keyword: task.displayKeyword,
    normalizedKeyword: task.normalizedKeyword,
    device: task.device,
    state: match ? 'observed' : 'not_observed_within_depth',
    organicPosition: match?.rankGroup ?? null,
    absolutePosition: match?.rankAbsolute ?? null,
    rankingUrl: match?.url ?? null,
    observedFeatures: evidence.data.features,
    checkedAt: evidence.data.checkedAt,
    provider: evidence.provider,
    providerTaskId: task.providerTaskId,
    requestedDepth: configuration.depth,
    returnedRows: evidence.coverage.returnedRows,
    retainedRows: evidence.coverage.retainedRows,
    invalidRows: evidence.coverage.invalidRows,
    completeness: evidence.coverage.completeness,
    estimatedCostMicros: evidence.cost.estimatedMicros,
    actualCostMicros: evidence.cost.actualMicros,
    warnings: evidence.warnings,
  }
}

async function inBoundedParallel<T>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next
        next += 1
        const item = items[index]
        if (item) await operation(item)
      }
    },
  )
  await Promise.all(workers)
}

async function collectLive(
  configuration: RankTrackingConfiguration,
  run: RankTrackingRun,
  collector: RankTrackingCollector,
  dependencies: RankTrackingExecutionDependencies,
): Promise<{ collected: number; warnings: string[] }> {
  const tasks = rankTrackingTasks(run.id, ['pending'], dependencies)
  const observations: RankObservation[] = []
  const warnings: string[] = []
  await inBoundedParallel(tasks, 3, async (task) => {
    try {
      const evidence = await collector.live(requestForTask(configuration, task))
      observations.push(observationFromEvidence(configuration, task, evidence))
    } catch (error) {
      const mapped = providerError(error)
      failRankTrackingTask(
        { taskId: task.id, code: mapped.code, message: mapped.message },
        dependencies,
      )
      warnings.push(
        `${task.displayKeyword} (${task.device}): ${mapped.message}`,
      )
    }
  })
  saveRankObservations(observations, dependencies)
  return { collected: observations.length, warnings }
}

async function collectQueued(
  configuration: RankTrackingConfiguration,
  run: RankTrackingRun,
  collector: RankTrackingCollector,
  dependencies: RankTrackingExecutionDependencies,
): Promise<{
  collected: number
  posted: number
  warnings: string[]
}> {
  if (!collector.post || !collector.ready || !collector.collect) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${collector.provider} does not support queued rank collection. Use live collection or another provider.`,
    )
  }
  const warnings: string[] = []
  const observations: RankObservation[] = []
  let posted = 0
  let ready: Awaited<ReturnType<NonNullable<RankTrackingCollector['ready']>>> =
    []
  try {
    ready = await collector.ready()
  } catch (error) {
    const mapped = providerError(error)
    warnings.push(
      `The provider ready list was unavailable; saved task IDs will still be checked: ${mapped.message}`,
    )
  }
  const byTaskKey = new Map(
    ready.flatMap((item) =>
      item.taskKey ? [[item.taskKey, item.providerTaskId] as const] : [],
    ),
  )
  for (const task of rankTrackingTasks(run.id, ['posting'], dependencies)) {
    const providerTaskId = byTaskKey.get(task.id)
    if (providerTaskId) {
      recoverRankTaskReceipt({ taskId: task.id, providerTaskId }, dependencies)
    }
  }
  const readyTasks = rankTrackingTasks(run.id, ['posted'], dependencies).filter(
    (task) => task.providerTaskId,
  )
  await inBoundedParallel(readyTasks, 5, async (task) => {
    try {
      const evidence = await collector.collect?.({
        providerTaskId: task.providerTaskId as string,
        request: requestForTask(configuration, task),
      })
      if (!evidence) return
      observations.push(observationFromEvidence(configuration, task, evidence))
    } catch (error) {
      const mapped = providerError(error)
      warnings.push(
        `${task.displayKeyword} (${task.device}): ${mapped.message}`,
      )
    }
  })
  saveRankObservations(observations, dependencies)

  const pending = rankTrackingTasks(run.id, ['pending'], dependencies)
  for (
    let offset = 0;
    offset < pending.length;
    offset += RANK_TRACKING_LIMITS.tasksPerProviderPost
  ) {
    const batch = pending.slice(
      offset,
      offset + RANK_TRACKING_LIMITS.tasksPerProviderPost,
    )
    markRankTasksPosting(
      run.id,
      batch.map((task) => task.id),
      dependencies,
    )
    try {
      const result = await collector.post({
        tasks: batch.map((task) => ({
          taskKey: task.id,
          request: requestForTask(configuration, task),
        })),
        context: {
          projectId: configuration.projectId,
          reportId: 'rank-tracking',
          reportRunId: run.id,
        },
      })
      const receiptByKey = new Map(
        result.receipts.map((receipt) => [receipt.taskKey, receipt]),
      )
      if (receiptByKey.size !== batch.length) {
        throw new SeoError(
          'PROVIDER_UNAVAILABLE',
          'The provider did not return one receipt for every queued rank task.',
        )
      }
      markRankTasksPosted(
        run.id,
        batch.map((task) => ({
          taskId: task.id,
          providerTaskId: receiptByKey.get(task.id)?.providerTaskId ?? '',
        })),
        {
          estimatedMicros: result.estimatedCostMicros,
          actualMicros: result.actualCostMicros,
        },
        dependencies,
      )
      posted += batch.length
      warnings.push(...result.warnings.map((warning) => warning.message))
    } catch (error) {
      const mapped = providerError(error)
      warnings.push(
        `${batch.length} queued task${batch.length === 1 ? '' : 's'} remain in recovery after posting was interrupted: ${mapped.message}`,
      )
      break
    }
  }
  return { collected: observations.length, posted, warnings }
}

function due(configuration: RankTrackingConfiguration, now: Date): boolean {
  return (
    configuration.cadence === 'manual' ||
    configuration.nextRunAt === null ||
    Date.parse(configuration.nextRunAt) <= now.getTime()
  )
}

export async function executeRankTracking(
  input: RankTrackingExecutionInput,
  dependencies: RankTrackingExecutionDependencies = {},
): Promise<RankTrackingExecution> {
  const cadence = input.cadence ?? 'manual'
  const selectedSet = getKeywordSet(
    {
      projectId: input.projectId,
      idOrName: input.set,
      tag: input.tag,
      limit: 1,
    },
    dependencies,
  )
  const provider = input.provider ?? selectedSet.set.provider ?? 'dataforseo'
  const extension =
    provider === 'dataforseo'
      ? undefined
      : (dependencies.providerExtension ??
        (await installedSerpSnapshotProviders()).find(
          (candidate) => candidate.adapter.provider === provider,
        ))
  if (provider !== 'dataforseo' && !extension) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${provider} is not installed with SERP snapshot support.`,
    )
  }
  const collectionMethod =
    input.collectionMethod ??
    (extension || cadence === 'manual' ? 'live' : 'queued')
  if (extension && collectionMethod !== 'live') {
    throw new SeoError(
      'INVALID_INPUT',
      `${extension.displayName} supports live rank collection. Use collectionMethod live.`,
    )
  }
  const defaultDevice = selectedSet.set.market.device ?? 'desktop'
  const devices = input.devices ?? [defaultDevice]
  const depth = input.depth ?? extension?.capability.defaultDepth ?? 100
  const maxDepth = extension?.capability.maxDepth ?? 100
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > maxDepth) {
    throw new SeoError(
      'INVALID_INPUT',
      `Rank tracking depth must be from 1 to ${maxDepth}.`,
    )
  }
  if (
    devices.length < 1 ||
    devices.length > 2 ||
    new Set(devices).size !== devices.length ||
    devices.some((device) => device !== 'desktop' && device !== 'mobile')
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Track desktop, mobile, or both devices.',
    )
  }
  let keywordLimit =
    input.keywordLimit ?? (collectionMethod === 'live' ? 25 : 100)
  if (extension) {
    const requestsPerKeyword =
      extension.capability.estimateRequests({
        keyword: selectedSet.items[0]?.keyword ?? 'rank tracking',
        market: { ...selectedSet.set.market, device: devices[0] },
        depth,
      }) * devices.length
    if (!Number.isSafeInteger(requestsPerKeyword) || requestsPerKeyword < 1) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `${extension.displayName} returned an invalid request estimate.`,
      )
    }
    const requestLimit = (
      dependencies.providerSpendLimits ?? getProviderSpendLimits
    )(provider).maxRequestsPerReport
    const maximumKeywords = Math.floor(requestLimit / requestsPerKeyword)
    if (maximumKeywords < 1) {
      throw new SeoError(
        'INVALID_INPUT',
        `${extension.displayName} needs ${requestsPerKeyword} requests per keyword for this depth and device selection, above the local ${requestLimit}-request report limit. Reduce the depth or devices, or raise the provider request limit.`,
      )
    }
    if (input.keywordLimit !== undefined && keywordLimit > maximumKeywords) {
      throw new SeoError(
        'INVALID_INPUT',
        `${extension.displayName} can collect at most ${maximumKeywords} keyword${maximumKeywords === 1 ? '' : 's'} at this depth and device selection within the local ${requestLimit}-request report limit. Reduce --rank-limit or raise the provider request limit.`,
      )
    }
    keywordLimit = Math.min(keywordLimit, maximumKeywords)
  }
  const set = getKeywordSet(
    {
      projectId: input.projectId,
      idOrName: input.set,
      tag: input.tag,
      limit: keywordLimit,
    },
    dependencies,
  )
  const configuration = getOrCreateRankTrackingConfiguration(
    {
      projectId: input.projectId,
      keywordSetId: set.set.id,
      targetDomain: input.targetDomain,
      tag: input.tag,
      market: set.set.market,
      devices,
      provider,
      collectionMethod,
      cadence,
      depth,
      keywordLimit,
    },
    dependencies,
  )
  const warnings: string[] = []
  const activeBefore = activeRankTrackingRun(configuration.id, dependencies)
  let run = activeBefore
  let startedRun = false
  let collectedTasks = 0
  let postedTasks = 0
  if (
    !run &&
    (input.start ?? true) &&
    due(configuration, dependencies.now?.() ?? new Date())
  ) {
    run = startRankTrackingRun(
      {
        configuration,
        keywords: set.items.map((item) => ({
          keyword: item.keyword,
          normalizedKeyword: item.normalizedKeyword,
        })),
      },
      { ...dependencies, id: dependencies.id ?? randomUUID },
    )
    startedRun = true
  }
  if (run) {
    const collector =
      dependencies.collector ??
      (await (dependencies.collectorFactory ?? defaultCollector)(provider))
    if (collector.provider !== provider) {
      throw new SeoError(
        'INTERNAL_ERROR',
        'The selected rank collector does not match the saved provider.',
      )
    }
    if (configuration.collectionMethod === 'live') {
      const result = await collectLive(
        configuration,
        run,
        collector,
        dependencies,
      )
      collectedTasks += result.collected
      warnings.push(...result.warnings)
    } else {
      const result = await collectQueued(
        configuration,
        run,
        collector,
        dependencies,
      )
      collectedTasks += result.collected
      postedTasks += result.posted
      warnings.push(...result.warnings)
    }
    run = latestRankTrackingRun(configuration.id, dependencies)
  } else {
    run = latestRankTrackingRun(configuration.id, dependencies)
  }
  return {
    configuration,
    run,
    startedRun,
    collectedTasks,
    postedTasks,
    operationalWarnings: warnings.slice(0, 20),
  }
}
