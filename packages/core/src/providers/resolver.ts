import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderCapabilitySupport,
  ProviderId,
  ProviderMarketSupport,
  SearchMarket,
} from './contracts.js'

export type ProviderCandidate = {
  adapter: ProviderAdapter
  connected: boolean
  priority: number
}

export type ProviderResolution =
  | {
      status: 'available'
      provider: ProviderAdapter
      considered: ProviderId[]
    }
  | {
      status: 'unavailable'
      reason:
        | 'provider-not-registered'
        | 'provider-not-connected'
        | 'capability-not-supported'
        | 'market-not-supported'
      considered: ProviderId[]
    }

function normalizedIncludes(
  values: readonly string[] | undefined,
  value: string,
): boolean {
  return !values || values.some((item) => item === value)
}

function supportsMarket(
  support: ProviderMarketSupport,
  market: SearchMarket,
): boolean {
  if (
    !normalizedIncludes(support.searchEngines, market.searchEngine) ||
    !normalizedIncludes(support.countryCodes, market.countryCode) ||
    !normalizedIncludes(support.languageCodes, market.languageCode) ||
    (market.device && !normalizedIncludes(support.devices, market.device))
  ) {
    return false
  }
  if (support.location === 'country-only' && market.location) return false
  if (support.location === 'canonical' && !market.location) return false
  return true
}

function capabilitySupport(
  candidate: ProviderCandidate,
  capability: ProviderCapability,
): ProviderCapabilitySupport | undefined {
  return candidate.adapter.capabilitySupport.find(
    (support) =>
      support.capability === capability && support.status === 'available',
  )
}

function supportsCapabilityMarket(
  support: ProviderCapabilitySupport,
  market: SearchMarket,
): boolean {
  return (
    support.markets === 'all' ||
    support.markets.some((item) => supportsMarket(item, market))
  )
}

function orderedCandidates(
  candidates: readonly ProviderCandidate[],
): ProviderCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.adapter.provider.localeCompare(right.adapter.provider),
  )
}

export function resolveProvider(input: {
  capability: ProviderCapability
  market: SearchMarket
  candidates: readonly ProviderCandidate[]
  provider?: ProviderId
}): ProviderResolution {
  const ordered = orderedCandidates(input.candidates)
  const considered = ordered.map((item) => item.adapter.provider)
  const eligible = input.provider
    ? ordered.filter((item) => item.adapter.provider === input.provider)
    : ordered

  if (input.provider && eligible.length === 0) {
    return {
      status: 'unavailable',
      reason: 'provider-not-registered',
      considered,
    }
  }

  const capable = eligible
    .map((candidate) => ({
      candidate,
      support: capabilitySupport(candidate, input.capability),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: ProviderCandidate
        support: ProviderCapabilitySupport
      } => Boolean(item.support),
    )
  if (capable.length === 0) {
    return {
      status: 'unavailable',
      reason: 'capability-not-supported',
      considered,
    }
  }

  const marketSupported = capable.filter((item) =>
    supportsCapabilityMarket(item.support, input.market),
  )
  if (marketSupported.length === 0) {
    return { status: 'unavailable', reason: 'market-not-supported', considered }
  }

  const connected = marketSupported.find((item) => item.candidate.connected)
  if (!connected) {
    return {
      status: 'unavailable',
      reason: 'provider-not-connected',
      considered,
    }
  }

  return {
    status: 'available',
    provider: connected.candidate.adapter,
    considered,
  }
}
