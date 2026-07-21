import type {
  ProviderId,
  SearchMarket,
  SerpSnapshotRequest,
} from '../providers/contracts.js'

export type RankTrackingDevice = 'desktop' | 'mobile'
export type RankTrackingCadence = 'manual' | 'daily' | 'weekly' | 'monthly'
export type RankTrackingCollectionMethod = 'live' | 'queued'
export type RankTrackingRunState = 'pending' | 'partial' | 'failed' | 'complete'

export type RankTrackingConfiguration = {
  schemaVersion: 1
  id: string
  projectId: string
  keywordSetId: string
  targetDomain: string
  tag: string | null
  market: Omit<SearchMarket, 'device'>
  devices: RankTrackingDevice[]
  provider: ProviderId
  collectionMethod: RankTrackingCollectionMethod
  cadence: RankTrackingCadence
  depth: number
  keywordLimit: number
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export type RankTrackingRun = {
  schemaVersion: 1
  id: string
  configId: string
  state: RankTrackingRunState
  collectionMethod: RankTrackingCollectionMethod
  scheduledFor: string
  startedAt: string
  completedAt: string | null
  keywordCount: number
  taskCount: number
  snapshotCount: number
  pendingCount: number
  failedCount: number
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  errorSummary: string | null
}

export type RankTrackingTask = {
  id: string
  runId: string
  normalizedKeyword: string
  displayKeyword: string
  device: RankTrackingDevice
  state: 'pending' | 'posting' | 'posted' | 'complete' | 'failed'
  providerTaskId: string | null
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
}

export type RankObservation = {
  taskId: string
  runId: string
  keyword: string
  normalizedKeyword: string
  device: RankTrackingDevice
  state: 'observed' | 'not_observed_within_depth'
  organicPosition: number | null
  absolutePosition: number | null
  rankingUrl: string | null
  observedFeatures: string[]
  checkedAt: string
  provider: ProviderId
  providerTaskId: string | null
  requestedDepth: number
  returnedRows: number | null
  retainedRows: number | null
  invalidRows: number
  completeness: string
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  warnings: Array<{
    code: string
    message: string
    field?: string
    row?: number
  }>
}

export type QueuedSerpPostReceipt = {
  taskKey: string
  providerTaskId: string
}

export type QueuedSerpPostResult = {
  provider: ProviderId
  receipts: QueuedSerpPostReceipt[]
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  warnings: Array<{ code: string; message: string }>
}

export type QueuedSerpReadyTask = {
  providerTaskId: string
  taskKey: string | null
}

export type RankTrackingCollector = {
  provider: ProviderId
  live(
    input: SerpSnapshotRequest,
  ): Promise<
    import('../providers/contracts.js').ProviderEvidence<
      import('../providers/contracts.js').SerpSnapshot
    >
  >
  post?(input: {
    tasks: Array<{ taskKey: string; request: SerpSnapshotRequest }>
    context: NonNullable<SerpSnapshotRequest['context']>
  }): Promise<QueuedSerpPostResult>
  ready?(): Promise<QueuedSerpReadyTask[]>
  collect?(input: {
    providerTaskId: string
    request: SerpSnapshotRequest
  }): Promise<
    import('../providers/contracts.js').ProviderEvidence<
      import('../providers/contracts.js').SerpSnapshot
    >
  >
}
