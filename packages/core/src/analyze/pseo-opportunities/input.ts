import { SeoError } from '../../errors.js'
import type {
  KeywordDiscoverySource,
  SearchMarket,
} from '../../providers/contracts.js'
import {
  keywordDiscoverySourceSchema,
  providerIdSchema,
  searchMarketSchema,
} from '../../providers/contracts.js'
import { pseoAuditOptions } from '../pseo/audit.js'
import type { PseoOpportunitiesInput } from '../pseo-opportunity-contract.js'
import { integerOption } from '../site-diagnostics/quick-wins-report-input.js'

export const PSEO_OPPORTUNITY_LIMITS = {
  templates: 25,
  clusters: 25,
  seeds: 5,
  discoveryRows: 100,
  candidates: 25,
  serps: 3,
  serpDepth: 20,
  organicResultsPerSnapshot: 10,
  competitors: 10,
  dataSourceBriefs: 3,
} as const

export type ValidatedPseoOpportunitiesInput = Omit<
  PseoOpportunitiesInput,
  | 'days'
  | 'templateLimit'
  | 'clusterLimit'
  | 'discoverySources'
  | 'discoveryLimit'
  | 'candidateLimit'
  | 'serpLimit'
  | 'serpDepth'
  | 'market'
  | 'provider'
> & {
  days: number
  templateLimit: number
  clusterLimit: number
  discoverySources: KeywordDiscoverySource[]
  discoveryLimit: number
  candidateLimit: number
  serpLimit: number
  serpDepth: number
  market?: SearchMarket
  provider?: PseoOpportunitiesInput['provider']
}

export function comparePseoOpportunityText(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function validatePseoOpportunitiesInput(
  input: PseoOpportunitiesInput,
): ValidatedPseoOpportunitiesInput {
  if (!input.site.trim()) {
    throw new SeoError('INVALID_INPUT', 'pSEO opportunities requires a site.')
  }
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const templateLimit = integerOption({
    value: input.templateLimit,
    fallback: 10,
    minimum: 1,
    maximum: PSEO_OPPORTUNITY_LIMITS.templates,
    label: 'templateLimit',
  })
  const clusterLimit = integerOption({
    value: input.clusterLimit,
    fallback: 10,
    minimum: 1,
    maximum: PSEO_OPPORTUNITY_LIMITS.clusters,
    label: 'clusterLimit',
  })
  const discoveryLimit = integerOption({
    value: input.discoveryLimit,
    fallback: 30,
    minimum: 1,
    maximum: PSEO_OPPORTUNITY_LIMITS.discoveryRows,
    label: 'discoveryLimit',
  })
  const candidateLimit = integerOption({
    value: input.candidateLimit,
    fallback: 20,
    minimum: 1,
    maximum: PSEO_OPPORTUNITY_LIMITS.candidates,
    label: 'candidateLimit',
  })
  const serpLimit = integerOption({
    value: input.serpLimit,
    fallback: 0,
    minimum: 0,
    maximum: PSEO_OPPORTUNITY_LIMITS.serps,
    label: 'serpLimit',
  })
  const serpDepth = integerOption({
    value: input.serpDepth,
    fallback: 10,
    minimum: 1,
    maximum: PSEO_OPPORTUNITY_LIMITS.serpDepth,
    label: 'serpDepth',
  })
  const discoverySources: KeywordDiscoverySource[] = [
    ...new Set<KeywordDiscoverySource>(
      input.discoverySources ?? (['ideas'] as const),
    ),
  ].sort(comparePseoOpportunityText)
  if (
    discoverySources.length < 1 ||
    discoverySources.length > 3 ||
    discoverySources.some(
      (source) => !keywordDiscoverySourceSchema.safeParse(source).success,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Choose at least one supported keyword discovery source.',
    )
  }
  const marketResult = input.market
    ? searchMarketSchema.safeParse(input.market)
    : undefined
  if (marketResult && !marketResult.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid external search market.')
  }
  const providerResult = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (providerResult && !providerResult.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported external provider.')
  }
  if (input.includeExternal && !marketResult?.success) {
    throw new SeoError(
      'INVALID_INPUT',
      'External pSEO research requires a country and language market.',
    )
  }
  if (serpLimit > 0 && !input.includeExternal) {
    throw new SeoError(
      'INVALID_INPUT',
      'serpLimit requires includeExternal so paid acquisition is explicit.',
    )
  }

  pseoAuditOptions({
    days,
    sitemaps: input.sitemaps,
    maxSitemapUrls: input.maxSitemapUrls,
    templateLimit,
    minimumTemplateUrls: input.minimumTemplateUrls,
    minimumTemplateShare: input.minimumTemplateShare,
    minimumTemplateImpressions: input.minimumTemplateImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })

  return {
    ...input,
    days,
    templateLimit,
    clusterLimit,
    discoverySources,
    discoveryLimit,
    candidateLimit,
    serpLimit,
    serpDepth,
    market: marketResult?.success ? marketResult.data : undefined,
    provider: providerResult?.success ? providerResult.data : undefined,
  }
}
