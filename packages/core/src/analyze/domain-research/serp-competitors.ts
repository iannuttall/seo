import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type { SerpCompetitorsProvider } from '../../providers/domain-contracts.js'
import type {
  ClassifiedSerpCompetitor,
  CompetitorSiteType,
  SerpCompetitorsReport,
  SerpCompetitorsReportInput,
} from '../domain-research-contract.js'
import {
  compareText,
  type DomainResearchDependencies,
  limit,
  normalizeDomain,
  normalizedKeyword,
  offset,
  providerFailure,
  reportStatus,
  researchProvider,
  validatedMarket,
  validatedProvider,
  value,
} from './shared.js'

const MAX_DECLARED_COMPETITORS = 10
const SITE_TYPES = new Set<CompetitorSiteType>([
  'business',
  'publisher',
  'directory',
  'community',
  'marketplace',
  'unknown',
])

function declaredCompetitors(
  input: SerpCompetitorsReportInput['declaredCompetitors'],
): Map<string, CompetitorSiteType> {
  if ((input?.length ?? 0) > MAX_DECLARED_COMPETITORS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Use at most ${MAX_DECLARED_COMPETITORS} declared competitors.`,
    )
  }
  const entries = (input ?? []).map((competitor) => {
    if (!SITE_TYPES.has(competitor.siteType)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Each declared competitor requires an explicit supported site type.',
      )
    }
    return [normalizeDomain(competitor.domain), competitor.siteType] as const
  })
  if (new Set(entries.map(([domain]) => domain)).size !== entries.length) {
    throw new SeoError('INVALID_INPUT', 'Declare each competitor domain once.')
  }
  return new Map(entries)
}

export async function serpCompetitorsReport(
  input: SerpCompetitorsReportInput,
  dependencies: DomainResearchDependencies = {},
): Promise<SerpCompetitorsReport> {
  const now = (dependencies.now ?? (() => new Date()))()
  const market = validatedMarket(input.market)
  const providerId = validatedProvider(input.provider)
  const keywords = [...new Set(input.keywords.map(normalizedKeyword))]
    .filter(Boolean)
    .sort(compareText)
  if (
    keywords.length < 2 ||
    keywords.length > 200 ||
    keywords.some(
      (keyword) => keyword.length > 80 || keyword.split(/\s+/u).length > 10,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'SERP competitor research requires 2 to 200 keywords of at most 80 characters and 10 words.',
    )
  }
  const target = input.targetDomain ? normalizeDomain(input.targetDomain) : null
  const declared = declaredCompetitors(input.declaredCompetitors)
  if (target && declared.has(target)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The target domain cannot also be a declared competitor.',
    )
  }
  const rowLimit = limit(input.limit, 25, 100)
  const rowOffset = offset(input.offset)
  const provider = await researchProvider<SerpCompetitorsProvider>({
    capability: 'serp-competitors',
    market,
    provider: providerId,
    dependencies,
    method: 'serpCompetitors',
  })
  let evidence: Awaited<ReturnType<SerpCompetitorsProvider['serpCompetitors']>>
  try {
    evidence = await provider.serpCompetitors({
      keywords,
      market,
      includeSubdomains: false,
      resultTypes: input.resultTypes,
      limit: rowLimit,
      offset: rowOffset,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'serp-competitors',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return providerFailure(error)
  }
  const competitors: ClassifiedSerpCompetitor[] = evidence.data.rows.map(
    (row, index) => {
      const siteType = declared.get(row.domain)
      const relationship =
        target === row.domain
          ? 'self'
          : siteType
            ? 'declared-competitor'
            : 'search-competitor'
      return {
        evidenceRef: `evidence.data.rows[${index}]`,
        domain: row.domain,
        relationship,
        siteType: siteType ?? ('unknown' as const),
        classificationSource:
          relationship === 'self'
            ? 'target'
            : siteType
              ? 'declared'
              : 'unclassified',
        matchedKeywords: row.matchedKeywords,
        keywordCoverage: row.matchedKeywords / keywords.length,
        averagePosition: value(row.averagePosition),
        visibility: value(row.visibility),
        sampleKeywords: row.keywordPositions
          .map((item) => item.keyword)
          .slice(0, 5),
      }
    },
  )
  const retainedCompetitors = competitors.filter(
    (competitor) => competitor.relationship !== 'self',
  )
  const findings: SerpCompetitorsReport['findings'] = []
  for (const [index, competitor] of competitors.entries()) {
    if (competitor.relationship === 'self') continue
    if (competitor.relationship === 'declared-competitor') {
      findings.push({
        code: 'declared-competitor-observed',
        domain: competitor.domain,
        evidenceRefs: [competitor.evidenceRef, `competitors[${index}]`],
        detail: `${competitor.domain} appeared for ${competitor.matchedKeywords} of ${keywords.length} supplied keywords and was declared as ${competitor.siteType}.`,
        action:
          'Inspect its ranking pages and keywords, then compare only terms that match the site purpose and current result intent.',
      })
    } else if (competitor.matchedKeywords >= 2) {
      findings.push({
        code: 'repeated-search-competitor',
        domain: competitor.domain,
        evidenceRefs: [competitor.evidenceRef, `competitors[${index}]`],
        detail: `${competitor.domain} appeared for ${competitor.matchedKeywords} of ${keywords.length} supplied keywords. Its site type remains unclassified.`,
        action:
          'Classify the domain as a business, publisher, directory, community, or marketplace before using it in a keyword-gap report.',
      })
    }
    if (findings.length >= 10) break
  }
  const declaredFound = retainedCompetitors.filter(
    (competitor) => competitor.relationship === 'declared-competitor',
  ).length
  const unclassified = retainedCompetitors.filter(
    (competitor) => competitor.siteType === 'unknown',
  ).length

  return {
    schemaVersion: 1,
    methodology: 'serp_competitors_v1',
    generatedAt: now.toISOString(),
    dataStatus: reportStatus(evidence.coverage),
    market,
    summary: {
      querySetSize: keywords.length,
      providerRows: evidence.data.rows.length,
      retainedCompetitors: retainedCompetitors.length,
      declaredCompetitorsFound: declaredFound,
      unclassifiedSearchCompetitors: unclassified,
      verdict: `${retainedCompetitors.length} search competitor${retainedCompetitors.length === 1 ? '' : 's'} appeared across the ${keywords.length}-keyword set; ${unclassified} still need site-type review.`,
    },
    evidence,
    competitors,
    findings,
    caveats: [
      'This is a country-level provider comparison across the supplied keyword set. It is not a complete market share, business-competitor, or local-rank study.',
      'A domain is a search competitor when it appears in this result set. Publisher, directory, community, marketplace, and business labels come only from the supplied classification; unknown domains stay unknown.',
      'Visibility and estimated traffic are provider calculations. Query-set size, filters, result types, pagination, and update time all affect them.',
    ],
    nextSteps: [
      'Classify unknown domains before treating them as strategic competitors. A directory or community can reveal intent without being a business competitor.',
      'Run ranking-pages for the strongest relevant domains to inspect repeated page patterns and representative URLs.',
      'Run competitor-keyword-gap with a small explicit competitor list after excluding irrelevant site types.',
    ],
  }
}
