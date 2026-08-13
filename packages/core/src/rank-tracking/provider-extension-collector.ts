import type { ProviderExtensionSerpSnapshotProvider } from '../provider-extensions/serp.js'
import type { RankTrackingCollector } from './types.js'

export class ProviderExtensionRankTrackingCollector
  implements RankTrackingCollector
{
  readonly provider: string
  readonly #liveProvider: ProviderExtensionSerpSnapshotProvider

  constructor(provider: ProviderExtensionSerpSnapshotProvider) {
    this.provider = provider.provider
    this.#liveProvider = provider
  }

  live(input: Parameters<RankTrackingCollector['live']>[0]) {
    return this.#liveProvider.serpSnapshot(input)
  }
}
