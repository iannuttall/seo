import { SeoError } from '../errors.js'
import {
  executeRankTracking,
  type RankTrackingExecutionDependencies,
  type RankTrackingExecutionInput,
} from '../rank-tracking/run.js'
import {
  priorComparableRankTrackingRun,
  rankObservations,
  rankTrackingTasks,
} from '../rank-tracking/store.js'
import type {
  RankObservation,
  RankTrackingConfiguration,
  RankTrackingRun,
} from '../rank-tracking/types.js'

export type RankChange =
  | 'new'
  | 'lost'
  | 'improved'
  | 'declined'
  | 'unchanged'
  | 'no-history'

export type RankTrackingReportItem = {
  keyword: string
  normalizedKeyword: string
  device: 'desktop' | 'mobile'
  state: 'observed' | 'not_observed_within_depth' | 'pending' | 'failed'
  organicPosition: number | null
  absolutePosition: number | null
  rankingUrl: string | null
  checkedAt: string | null
  previous: {
    state: RankObservation['state']
    organicPosition: number | null
    absolutePosition: number | null
    rankingUrl: string | null
    checkedAt: string
  } | null
  change: RankChange
  organicPositionDelta: number | null
  rankingUrlChanged: boolean
  error: { code: string | null; message: string | null } | null
}

export type RankTrackingReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'pending' | 'unavailable'
  configuration: RankTrackingConfiguration
  run: RankTrackingRun | null
  comparison: {
    priorRunId: string | null
    priorStartedAt: string | null
    comparableItems: number
  }
  summary: {
    trackedKeywords: number
    trackedDevices: number
    expectedSnapshots: number
    completedSnapshots: number
    pendingSnapshots: number
    failedSnapshots: number
    observed: number
    notObservedWithinDepth: number
    new: number
    lost: number
    improved: number
    declined: number
    unchanged: number
    rankingUrlChanges: number
    verdict: string
  }
  items: RankTrackingReportItem[]
  coverage: {
    totalItems: number
    returnedItems: number
    outputLimit: number
    omittedItems: number
    requestedDepth: number
    collectionMethod: RankTrackingConfiguration['collectionMethod']
    runState: RankTrackingRun['state'] | 'not-started'
  }
  cost: {
    currency: 'USD'
    estimatedMicros: number | null
    actualMicros: number | null
  }
  operationalWarnings: string[]
  caveats: string[]
  nextSteps: string[]
}

export type RankTrackingReportInput = RankTrackingExecutionInput & {
  outputLimit?: number
}

function key(item: {
  normalizedKeyword: string
  device: 'desktop' | 'mobile'
}): string {
  return `${item.normalizedKeyword}\u0000${item.device}`
}

function changeFor(
  current: RankObservation,
  previous: RankObservation | undefined,
): Pick<
  RankTrackingReportItem,
  'change' | 'organicPositionDelta' | 'rankingUrlChanged'
> {
  if (!previous) {
    return {
      change: 'no-history',
      organicPositionDelta: null,
      rankingUrlChanged: false,
    }
  }
  const rankingUrlChanged =
    current.state === 'observed' &&
    previous.state === 'observed' &&
    current.rankingUrl !== previous.rankingUrl
  if (
    current.state === 'observed' &&
    previous.state === 'not_observed_within_depth'
  ) {
    return { change: 'new', organicPositionDelta: null, rankingUrlChanged }
  }
  if (
    current.state === 'not_observed_within_depth' &&
    previous.state === 'observed'
  ) {
    return { change: 'lost', organicPositionDelta: null, rankingUrlChanged }
  }
  if (current.organicPosition !== null && previous.organicPosition !== null) {
    const delta = previous.organicPosition - current.organicPosition
    return {
      change: delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'unchanged',
      organicPositionDelta: delta,
      rankingUrlChanged,
    }
  }
  return {
    change: 'unchanged',
    organicPositionDelta: null,
    rankingUrlChanged,
  }
}

const CHANGE_ORDER: Record<RankChange, number> = {
  lost: 0,
  declined: 1,
  new: 2,
  improved: 3,
  unchanged: 4,
  'no-history': 5,
}

function compareItems(
  left: RankTrackingReportItem,
  right: RankTrackingReportItem,
): number {
  return (
    CHANGE_ORDER[left.change] - CHANGE_ORDER[right.change] ||
    Math.abs(right.organicPositionDelta ?? 0) -
      Math.abs(left.organicPositionDelta ?? 0) ||
    (left.normalizedKeyword < right.normalizedKeyword
      ? -1
      : left.normalizedKeyword > right.normalizedKeyword
        ? 1
        : left.device < right.device
          ? -1
          : left.device > right.device
            ? 1
            : 0)
  )
}

function reportItems(
  current: RankObservation[],
  previous: RankObservation[],
  pending: ReturnType<typeof rankTrackingTasks>,
): RankTrackingReportItem[] {
  const previousByKey = new Map(previous.map((item) => [key(item), item]))
  const items = current.map((item): RankTrackingReportItem => {
    const prior = previousByKey.get(key(item))
    const change = changeFor(item, prior)
    return {
      keyword: item.keyword,
      normalizedKeyword: item.normalizedKeyword,
      device: item.device,
      state: item.state,
      organicPosition: item.organicPosition,
      absolutePosition: item.absolutePosition,
      rankingUrl: item.rankingUrl,
      checkedAt: item.checkedAt,
      previous: prior
        ? {
            state: prior.state,
            organicPosition: prior.organicPosition,
            absolutePosition: prior.absolutePosition,
            rankingUrl: prior.rankingUrl,
            checkedAt: prior.checkedAt,
          }
        : null,
      ...change,
      error: null,
    }
  })
  const observedKeys = new Set(current.map(key))
  for (const task of pending) {
    if (observedKeys.has(key(task))) continue
    const prior = previousByKey.get(key(task))
    items.push({
      keyword: task.displayKeyword,
      normalizedKeyword: task.normalizedKeyword,
      device: task.device,
      state: task.state === 'failed' ? 'failed' : 'pending',
      organicPosition: null,
      absolutePosition: null,
      rankingUrl: null,
      checkedAt: null,
      previous: prior
        ? {
            state: prior.state,
            organicPosition: prior.organicPosition,
            absolutePosition: prior.absolutePosition,
            rankingUrl: prior.rankingUrl,
            checkedAt: prior.checkedAt,
          }
        : null,
      change: 'no-history',
      organicPositionDelta: null,
      rankingUrlChanged: false,
      error:
        task.state === 'failed'
          ? { code: task.errorCode, message: task.errorMessage }
          : null,
    })
  }
  return items.sort(compareItems)
}

function verdict(
  run: RankTrackingRun | null,
  counts: {
    observed: number
    notObserved: number
    improved: number
    declined: number
    newCount: number
    lost: number
  },
): string {
  if (!run) return 'No rank tracking run has started for this configuration.'
  if (run.pendingCount > 0) {
    return `${run.snapshotCount} of ${run.taskCount} market and device-specific snapshots are collected; ${run.pendingCount} remain pending.`
  }
  if (run.failedCount > 0) {
    return `${run.snapshotCount} snapshots were collected and ${run.failedCount} failed; use the completed rows as partial evidence.`
  }
  if (counts.improved + counts.declined + counts.newCount + counts.lost > 0) {
    return `${counts.improved} improved, ${counts.declined} declined, ${counts.newCount} became observed, and ${counts.lost} were no longer observed within the tracked depth.`
  }
  return `${counts.observed} rankings were observed and ${counts.notObserved} were not observed within the tracked depth.`
}

export async function rankTrackingReport(
  input: RankTrackingReportInput,
  dependencies: RankTrackingExecutionDependencies = {},
): Promise<RankTrackingReport> {
  const outputLimit = input.outputLimit ?? 100
  if (
    !Number.isSafeInteger(outputLimit) ||
    outputLimit < 1 ||
    outputLimit > 250
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Rank tracking output limit must be from 1 to 250.',
    )
  }
  const execution = await executeRankTracking(input, dependencies)
  const { configuration, run } = execution
  const current = run ? rankObservations(run.id, dependencies) : []
  const priorRun = run
    ? priorComparableRankTrackingRun(configuration.id, run.id, dependencies)
    : null
  const previous = priorRun ? rankObservations(priorRun.id, dependencies) : []
  const tasks = run ? rankTrackingTasks(run.id, undefined, dependencies) : []
  const allItems = reportItems(current, previous, tasks)
  const count = (change: RankChange) =>
    allItems.filter((item) => item.change === change).length
  const observed = current.filter((item) => item.state === 'observed').length
  const notObserved = current.length - observed
  const improved = count('improved')
  const declined = count('declined')
  const newCount = count('new')
  const lost = count('lost')
  const unchanged = count('unchanged')
  const rankingUrlChanges = allItems.filter(
    (item) => item.rankingUrlChanged,
  ).length
  const items = allItems.slice(0, outputLimit)
  const dataStatus = !run
    ? 'unavailable'
    : run.state === 'complete'
      ? 'complete'
      : run.state === 'pending'
        ? 'pending'
        : 'partial'

  return {
    schemaVersion: 1,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    dataStatus,
    configuration,
    run,
    comparison: {
      priorRunId: priorRun?.id ?? null,
      priorStartedAt: priorRun?.startedAt ?? null,
      comparableItems: allItems.filter((item) => item.previous !== null).length,
    },
    summary: {
      trackedKeywords: run?.keywordCount ?? 0,
      trackedDevices: configuration.devices.length,
      expectedSnapshots: run?.taskCount ?? 0,
      completedSnapshots: run?.snapshotCount ?? 0,
      pendingSnapshots: run?.pendingCount ?? 0,
      failedSnapshots: run?.failedCount ?? 0,
      observed,
      notObservedWithinDepth: notObserved,
      new: newCount,
      lost,
      improved,
      declined,
      unchanged,
      rankingUrlChanges,
      verdict: verdict(run, {
        observed,
        notObserved,
        improved,
        declined,
        newCount,
        lost,
      }),
    },
    items,
    coverage: {
      totalItems: allItems.length,
      returnedItems: items.length,
      outputLimit,
      omittedItems: allItems.length - items.length,
      requestedDepth: configuration.depth,
      collectionMethod: configuration.collectionMethod,
      runState: run?.state ?? 'not-started',
    },
    cost: {
      currency: 'USD',
      estimatedMicros: run?.estimatedCostMicros ?? null,
      actualMicros: run?.actualCostMicros ?? null,
    },
    operationalWarnings: execution.operationalWarnings,
    caveats: [
      `Not observed means the target domain was not retained within the first ${configuration.depth} organic results for that exact market and device. It is not proof that the domain does not rank elsewhere.`,
      'Exact snapshots and Search Console average position answer different questions and should not be substituted for one another.',
      'Local, national, desktop, and mobile snapshots remain separate configurations and are never blended into one position.',
      'Search results can change between checks and may differ from signed-in or personalized results.',
      ...(run?.state === 'partial' || run?.state === 'failed'
        ? [
            'Failed or pending tasks make this run partial; do not treat missing rows as losses.',
          ]
        : []),
    ],
    nextSteps: [
      ...(run?.pendingCount
        ? [
            'Run the same report parameters again after queued tasks are ready; collection is free and resumes from saved task IDs.',
          ]
        : []),
      'Use Search Console opportunity reports to add clicks, impressions, and average-position context before prioritising a ranking change.',
      'Inspect ranking URL changes for intent drift or competing templates before changing content.',
      configuration.cadence === 'manual'
        ? 'Use queued collection with a daily, weekly, or monthly cadence when this set needs recurring local tracking.'
        : 'Run this report from local cron at the configured cadence; overlapping runs are refused and schedule advancement is deterministic.',
    ],
  }
}
