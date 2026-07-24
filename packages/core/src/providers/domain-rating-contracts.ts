import type {
  MarketIndependentProviderEvidence,
  ProviderAdapter,
  ProviderRequestContext,
  ProviderValue,
} from './contracts.js'

export type DomainRatingTargetMode = 'domain' | 'url'

export type DomainRatingObservation = {
  target: string
  targetMode: DomainRatingTargetMode
  domainRating: ProviderValue<number>
  licenseUrl: string
  attribution: 'Domain Rating by Ahrefs'
  attributionUrl: 'https://ahrefs.com/'
}

export type DomainRatingRequest = {
  target: string
  targetMode?: DomainRatingTargetMode
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface DomainRatingProvider extends ProviderAdapter {
  domainRating(
    input: DomainRatingRequest,
  ): Promise<MarketIndependentProviderEvidence<DomainRatingObservation>>
}
