import type { MarketIndependentProviderEvidence } from '../contracts.js'
import { observedValue } from '../contracts.js'
import type {
  DomainRatingObservation,
  DomainRatingProvider,
  DomainRatingRequest,
} from '../domain-rating-contracts.js'
import { AhrefsClient, type AhrefsClientOptions } from './client.js'
import { ahrefsDomainRatingResponseSchema } from './schema.js'
import {
  marketIndependentEvidence,
  missing,
  requestContext,
  target,
} from './shared.js'

const ENDPOINT = 'public/domain-rating-free'
const TTL_MS = 24 * 60 * 60 * 1_000

type DomainRatingClient = Pick<AhrefsClient, 'request'>

export type AhrefsDomainRatingProviderOptions = AhrefsClientOptions & {
  client?: DomainRatingClient
}

export class AhrefsDomainRatingProvider implements DomainRatingProvider {
  readonly provider = 'ahrefs' as const
  readonly capabilitySupport = [
    {
      capability: 'domain-rating' as const,
      status: 'available' as const,
      markets: 'all' as const,
    },
  ] as const

  private readonly client: DomainRatingClient

  constructor(options: AhrefsDomainRatingProviderOptions = {}) {
    this.client = options.client ?? new AhrefsClient(options)
  }

  async domainRating(
    input: DomainRatingRequest,
  ): Promise<MarketIndependentProviderEvidence<DomainRatingObservation>> {
    const normalized = target({
      value: input.target,
      mode: input.targetMode ?? 'domain',
      operation: 'domain-rating',
    })
    const snapshot = await this.client.request({
      operation: 'domain-rating',
      capability: 'domain-rating',
      path: ENDPOINT,
      query: { target: normalized.target },
      schema: ahrefsDomainRatingResponseSchema,
      requestedRows: 1,
      perRowUnits: 0,
      rowCount: () => 1,
      free: true,
      refresh: input.refresh,
      ttlMs: TTL_MS,
      context: requestContext('domain-rating', input.context),
    })
    const result = snapshot.response.domain_rating
    const observed = result.domain_rating !== null
    return marketIndependentEvidence({
      capability: 'domain-rating',
      data: {
        target: normalized.target,
        targetMode: normalized.mode,
        domainRating: observed
          ? observedValue(result.domain_rating as number)
          : missing('Domain Rating'),
        licenseUrl: result.license,
        attribution: 'Domain Rating by Ahrefs',
        attributionUrl: 'https://ahrefs.com/',
      },
      snapshot,
      coverage: {
        requestedRows: 1,
        returnedRows: 1,
        retainedRows: observed ? 1 : 0,
        invalidRows: 0,
        providerTotalRows: null,
        completeness: observed ? 'complete' : 'unavailable',
        nextCursor: null,
      },
      endpoint: ENDPOINT,
      limit: 1,
      filters: {
        apiVersion: 3,
        targetMode: normalized.mode,
      },
      sort: [],
      warnings: result.warning
        ? [
            {
              code: 'ahrefs-domain-rating-warning',
              field: 'data.domainRating',
              message: result.warning,
            },
          ]
        : [],
    })
  }
}
