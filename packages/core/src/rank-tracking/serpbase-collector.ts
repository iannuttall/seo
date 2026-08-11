import type { SerpSnapshotRequest } from '../providers/contracts.js'
import type { SerpBaseClientOptions } from '../providers/serpbase/client.js'
import { SerpBaseSerpSnapshotProvider } from '../providers/serpbase/serp-snapshot.js'
import type { RankTrackingCollector } from './types.js'

export class SerpBaseRankTrackingCollector implements RankTrackingCollector {
  readonly provider = 'serpbase' as const
  private readonly liveProvider: SerpBaseSerpSnapshotProvider

  constructor(options: SerpBaseClientOptions = {}) {
    this.liveProvider = new SerpBaseSerpSnapshotProvider(options)
  }

  live(input: SerpSnapshotRequest) {
    return this.liveProvider.serpSnapshot(input)
  }
}
