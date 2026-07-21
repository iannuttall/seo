import type { SerpSnapshotRequest } from '../providers/contracts.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
} from '../providers/dataforseo/client.js'
import {
  locationRequest,
  normalizedKeyword,
} from '../providers/dataforseo/keyword-mapping.js'
import {
  DataForSeoSerpSnapshotProvider,
  mapDataForSeoSerpSnapshot,
} from '../providers/dataforseo/serp-snapshot.js'
import type { RankTrackingCollector } from './types.js'

const QUEUED_RESULT_ENDPOINT =
  'v3/serp/google/organic/task_get/advanced/{taskId}'

export class DataForSeoRankTrackingCollector implements RankTrackingCollector {
  readonly provider = 'dataforseo' as const
  private readonly client: DataForSeoClient
  private readonly liveProvider: DataForSeoSerpSnapshotProvider

  constructor(options: DataForSeoClientOptions = {}) {
    this.client = new DataForSeoClient(options)
    this.liveProvider = new DataForSeoSerpSnapshotProvider({
      client: this.client,
    })
  }

  live(input: SerpSnapshotRequest) {
    return this.liveProvider.serpSnapshot(input)
  }

  async post(input: Parameters<NonNullable<RankTrackingCollector['post']>>[0]) {
    const snapshot = await this.client.serpTaskPost({
      tasks: input.tasks.map(({ taskKey, request }) => {
        const market = request.market
        return {
          tag: taskKey,
          keyword: normalizedKeyword(request.keyword),
          languageCode: market.languageCode.split('-')[0] as string,
          ...locationRequest(market, 'serp-snapshot'),
          device: market.device ?? 'desktop',
          depth: request.depth,
        }
      }),
      context: input.context,
    })
    return {
      provider: this.provider,
      receipts: snapshot.taskReceipts.map((receipt) => ({
        taskKey: receipt.tag,
        providerTaskId: receipt.providerTaskId,
      })),
      estimatedCostMicros: snapshot.estimatedCostMicros,
      actualCostMicros: snapshot.actualCostMicros,
      warnings: snapshot.warnings,
    }
  }

  ready() {
    return this.client.serpTasksReady().then((tasks) =>
      tasks.map((task) => ({
        providerTaskId: task.providerTaskId,
        taskKey: task.tag,
      })),
    )
  }

  async collect(input: {
    providerTaskId: string
    request: SerpSnapshotRequest
  }) {
    const snapshot = await this.client.serpTaskGet(input.providerTaskId)
    return mapDataForSeoSerpSnapshot(
      input.request,
      snapshot,
      QUEUED_RESULT_ENDPOINT,
    )
  }
}
