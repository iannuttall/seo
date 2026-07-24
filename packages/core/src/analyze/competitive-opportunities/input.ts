import { SeoError } from '../../errors.js'
import {
  type KeywordDiscoverySource,
  keywordDiscoverySourceSchema,
  providerIdSchema,
  searchMarketSchema,
} from '../../providers/contracts.js'
import type {
  CompetitiveOpportunitiesInput,
  CompetitiveOpportunityEvidence,
} from '../competitive-opportunity-contract.js'
import { normalizeDomain } from '../domain-research/shared.js'

export const COMPETITIVE_OPPORTUNITY_LIMITS = {
  seeds: 5,
  discoveryRows: 100,
  keywords: 10,
  serpDepth: 20,
  competitors: 10,
  findings: 20,
} as const

export const DEFAULT_COMPETITIVE_DISCOVERY_SOURCES = [
  'ideas',
  'related',
  'suggestions',
] as const satisfies readonly KeywordDiscoverySource[]

export type ValidatedCompetitiveOpportunitiesInput = {
  target: string
  seeds: string[]
  market: CompetitiveOpportunitiesInput['market']
  keywordProvider: CompetitiveOpportunitiesInput['keywordProvider']
  discoverySources: KeywordDiscoverySource[]
  discoveryLimit: number
  keywordLimit: number
  serpProvider: CompetitiveOpportunitiesInput['serpProvider']
  serpDepth: number
  competitorLimit: number
  competitionEvidence: CompetitiveOpportunityEvidence
  linkProvider: 'ahrefs' | 'dataforseo'
  projectId: string | undefined
  refresh: boolean | undefined
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be from ${minimum} to ${maximum}.`,
    )
  }
  return resolved
}

function normalizedSeeds(values: string[]): string[] {
  if (
    values.length < 1 ||
    values.length > COMPETITIVE_OPPORTUNITY_LIMITS.seeds
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Competitive opportunities requires 1 to ${COMPETITIVE_OPPORTUNITY_LIMITS.seeds} topic seeds.`,
    )
  }
  const seeds = [
    ...new Set(
      values.map((value) => value.trim().replace(/\s+/gu, ' ').toLowerCase()),
    ),
  ]
  if (
    seeds.some(
      (seed) =>
        seed.length < 1 || seed.length > 80 || seed.split(/\s+/u).length > 10,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Each topic seed must contain at most 80 characters and 10 words.',
    )
  }
  return seeds.sort(compareText)
}

function discoverySources(
  values: KeywordDiscoverySource[] | undefined,
): KeywordDiscoverySource[] {
  const sources = [...new Set(values ?? DEFAULT_COMPETITIVE_DISCOVERY_SOURCES)]
  if (
    sources.length < 1 ||
    sources.length > 3 ||
    sources.some(
      (source) => !keywordDiscoverySourceSchema.safeParse(source).success,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Choose one to three supported keyword discovery sources.',
    )
  }
  return sources.sort(compareText)
}

export function validateCompetitiveOpportunitiesInput(
  input: CompetitiveOpportunitiesInput,
): ValidatedCompetitiveOpportunitiesInput {
  const target = normalizeDomain(input.target)
  const seeds = normalizedSeeds(input.seeds)
  const market = searchMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid search market.')
  }
  if (market.data.searchEngine !== 'google') {
    throw new SeoError(
      'INVALID_INPUT',
      'Competitive opportunities currently supports Google result research.',
    )
  }
  if (market.data.location) {
    throw new SeoError(
      'INVALID_INPUT',
      'Competitive opportunities currently compares country-level keyword research and result evidence. Omit the canonical location.',
    )
  }
  const keywordProvider = input.keywordProvider
    ? providerIdSchema.safeParse(input.keywordProvider)
    : undefined
  const serpProvider = input.serpProvider
    ? providerIdSchema.safeParse(input.serpProvider)
    : undefined
  if (keywordProvider && !keywordProvider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported keyword provider.')
  }
  if (serpProvider && !serpProvider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported SERP provider.')
  }
  const sources = discoverySources(input.discoverySources)
  const discoveryLimit = boundedInteger(
    input.discoveryLimit,
    30,
    sources.length * seeds.length,
    COMPETITIVE_OPPORTUNITY_LIMITS.discoveryRows,
    'Discovery limit',
  )
  const keywordLimit = boundedInteger(
    input.keywordLimit,
    5,
    1,
    COMPETITIVE_OPPORTUNITY_LIMITS.keywords,
    'Keyword limit',
  )
  const serpDepth = boundedInteger(
    input.serpDepth,
    10,
    1,
    COMPETITIVE_OPPORTUNITY_LIMITS.serpDepth,
    'SERP depth',
  )
  const competitorLimit = boundedInteger(
    input.competitorLimit,
    5,
    1,
    COMPETITIVE_OPPORTUNITY_LIMITS.competitors,
    'Competitor limit',
  )
  const competitionEvidence = input.competitionEvidence ?? 'domain-rating'
  if (
    !['serp', 'domain-rating', 'link-summary'].includes(competitionEvidence)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Competition evidence must be serp, domain-rating, or link-summary.',
    )
  }
  if (input.linkProvider && competitionEvidence !== 'link-summary') {
    throw new SeoError(
      'INVALID_INPUT',
      'Set competitionEvidence to link-summary before choosing a link provider.',
    )
  }

  return {
    target,
    seeds,
    market: market.data,
    keywordProvider: keywordProvider?.data,
    discoverySources: sources,
    discoveryLimit,
    keywordLimit,
    serpProvider: serpProvider?.data,
    serpDepth,
    competitorLimit,
    competitionEvidence,
    linkProvider: input.linkProvider ?? 'ahrefs',
    projectId: input.projectId,
    refresh: input.refresh,
  }
}
