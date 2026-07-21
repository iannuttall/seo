import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type { RankedKeywordsProvider } from '../../providers/domain-contracts.js'
import { ProviderError } from '../../providers/errors.js'
import type {
  CompetitorKeywordGapReport,
  CompetitorKeywordGapReportInput,
  GapCompetitor,
} from '../domain-research-contract.js'
import {
  acquireGscQueries,
  type DomainResearchDependencies,
  days,
  limit,
  normalizeDomain,
  providerFailure,
  researchProvider,
  validatedMarket,
  validatedProvider,
} from './shared.js'

export const MAX_GAP_COMPETITORS = 3
const GAP_SITE_TYPES = new Set<GapCompetitor['siteType']>([
  'business',
  'publisher',
  'directory',
  'community',
  'marketplace',
])

export type GapAcquisition = {
  now: Date
  market: ReturnType<typeof validatedMarket>
  ownDomain: string
  sourceRows: Awaited<ReturnType<typeof acquireGscQueries>>
  ownSource: CompetitorKeywordGapReport['source']['ownDomain']
  competitors: CompetitorKeywordGapReport['source']['competitors']
  limitPerDomain: number
  candidateLimit: number
  minSearchVolume: number
  maxRank: number
}

function competitors(input: GapCompetitor[]): GapCompetitor[] {
  if (input.length < 1 || input.length > MAX_GAP_COMPETITORS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Competitor keyword gaps require 1 to ${MAX_GAP_COMPETITORS} explicit competitors.`,
    )
  }
  if (input.some((item) => !GAP_SITE_TYPES.has(item.siteType))) {
    throw new SeoError(
      'INVALID_INPUT',
      'Each gap competitor requires an explicit non-unknown site type.',
    )
  }
  const normalized = input.map((item) => ({
    domain: normalizeDomain(item.domain),
    siteType: item.siteType,
  }))
  if (
    new Set(normalized.map((item) => item.domain)).size !== normalized.length
  ) {
    throw new SeoError('INVALID_INPUT', 'Use each competitor domain once.')
  }
  return normalized
}

export async function acquireCompetitorGap(
  input: CompetitorKeywordGapReportInput,
  dependencies: DomainResearchDependencies,
): Promise<GapAcquisition> {
  const now = (dependencies.now ?? (() => new Date()))()
  const market = validatedMarket(input.market)
  const providerId = validatedProvider(input.provider)
  const ownDomain = normalizeDomain(input.site)
  const compared = competitors(input.competitors)
  if (compared.some((item) => item.domain === ownDomain)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Search Console site cannot also be a competitor.',
    )
  }
  const rangeDays = days(input.days)
  const limitPerDomain = limit(
    input.limitPerDomain,
    100,
    250,
    'Per-domain limit',
  )
  const candidateLimit = limit(input.candidateLimit, 50, 100, 'Candidate limit')
  const minSearchVolume = input.minSearchVolume ?? 10
  if (!Number.isSafeInteger(minSearchVolume) || minSearchVolume < 0) {
    throw new SeoError(
      'INVALID_INPUT',
      'Minimum search volume must be a nonnegative whole number.',
    )
  }
  const maxRank = input.maxRank ?? 20
  if (!Number.isSafeInteger(maxRank) || maxRank < 1 || maxRank > 100) {
    throw new SeoError(
      'INVALID_INPUT',
      'Maximum competitor rank must be a whole number from 1 to 100.',
    )
  }
  const provider = await researchProvider<RankedKeywordsProvider>({
    capability: 'ranked-keywords',
    market,
    provider: providerId,
    dependencies,
    method: 'rankedKeywords',
  })
  const reportRunId = randomUUID()
  const sourceRows = await acquireGscQueries({
    site: input.site,
    days: rangeDays,
    refresh: input.refresh,
    dependencies,
    now,
  })
  let ownSource: CompetitorKeywordGapReport['source']['ownDomain'] = {
    status: 'unavailable',
    evidence: null,
  }
  try {
    const evidence = await provider.rankedKeywords({
      target: ownDomain,
      market,
      includeSubdomains: input.includeSubdomains ?? true,
      resultTypes: ['organic'],
      minSearchVolume,
      maxRank: 100,
      limit: limitPerDomain,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'competitor-keyword-gap',
        reportRunId,
      },
    })
    ownSource = {
      status:
        evidence.coverage.completeness === 'complete'
          ? 'complete'
          : evidence.coverage.completeness === 'filtered'
            ? 'filtered'
            : 'partial',
      evidence,
    }
  } catch (error) {
    if (
      !(error instanceof ProviderError) ||
      [
        'configuration',
        'authentication',
        'budget-limit',
        'rate-limit',
      ].includes(error.code)
    ) {
      return providerFailure(error)
    }
    ownSource = {
      status: 'unavailable',
      evidence: null,
      error: { code: error.code, message: error.message },
    }
  }
  const competitorSources: GapAcquisition['competitors'] = []
  for (const competitor of compared) {
    try {
      const evidence = await provider.rankedKeywords({
        target: competitor.domain,
        market,
        includeSubdomains: input.includeSubdomains ?? true,
        resultTypes: ['organic'],
        minSearchVolume,
        maxRank,
        limit: limitPerDomain,
        refresh: input.refresh,
        context: {
          projectId: input.projectId,
          reportId: 'competitor-keyword-gap',
          reportRunId,
        },
      })
      competitorSources.push({
        domain: competitor.domain,
        siteType: competitor.siteType,
        status:
          evidence.coverage.completeness === 'complete'
            ? 'complete'
            : evidence.coverage.completeness === 'filtered'
              ? 'filtered'
              : 'partial',
        evidence,
      })
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error
      if (
        [
          'configuration',
          'authentication',
          'budget-limit',
          'rate-limit',
        ].includes(error.code)
      ) {
        return providerFailure(error)
      }
      competitorSources.push({
        domain: competitor.domain,
        siteType: competitor.siteType,
        status: 'unavailable',
        evidence: null,
        error: { code: error.code, message: error.message },
      })
    }
  }
  return {
    now,
    market,
    ownDomain,
    sourceRows,
    ownSource,
    competitors: competitorSources,
    limitPerDomain,
    candidateLimit,
    minSearchVolume,
    maxRank,
  }
}
