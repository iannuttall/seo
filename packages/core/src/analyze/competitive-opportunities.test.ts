import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../errors.js'
import type {
  KeywordIdea,
  MarketIndependentProviderEvidence,
  ProviderEvidence,
  SearchMarket,
  SerpSnapshot,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import type { DomainRatingObservation } from '../providers/domain-rating-contracts.js'
import type {
  LinkSummary,
  LinkSummaryProvider,
} from '../providers/link-contracts.js'
import { competitiveOpportunitiesReport } from './competitive-opportunities.js'
import type { DomainRatingReport } from './domain-rating.js'
import type { KeywordResearchReport } from './keyword-research.js'
import type { SerpResultsReport } from './serp-results.js'

const market: SearchMarket = {
  searchEngine: 'google',
  countryCode: 'GB',
  languageCode: 'en',
  device: 'desktop',
}

function cost() {
  return {
    currency: 'USD' as const,
    estimatedMicros: 1_000,
    actualMicros: 1_000,
    taskIds: ['fixture-task'],
  }
}

function coverage(rows: number) {
  return {
    requestedRows: rows,
    returnedRows: rows,
    retainedRows: rows,
    invalidRows: 0,
    providerTotalRows: rows,
    completeness: 'complete' as const,
    nextCursor: null,
  }
}

function keywordIdea(
  keyword: string,
  volume: number,
  sourceCount = 1,
): KeywordIdea {
  return {
    keyword,
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      seed: 'seo tools',
      source:
        (['ideas', 'related', 'suggestions'] as const)[index % 3] ?? 'ideas',
    })),
    monthlySearchVolume: observedValue(volume),
    monthlySearches: unavailableValue('missing', 'Not in fixture.'),
    searchVolumeUpdatedAt: observedValue('2026-07-01'),
    cpcUsd: observedValue(2),
    paidCompetition: observedValue(0.4),
    keywordDifficulty: observedValue(20),
    intent: observedValue('commercial'),
    resultCount: observedValue(1_000),
  }
}

function keywordReport(ideas: KeywordIdea[]): KeywordResearchReport {
  const evidence: ProviderEvidence<KeywordIdea[]> = {
    schemaVersion: 1,
    provider: 'semrush',
    capability: 'keyword-discovery',
    data: ideas,
    observedAt: '2026-07-24T12:00:00.000Z',
    market,
    coverage: coverage(ideas.length),
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      ...cost(),
      native: {
        unit: 'api-units',
        estimatedUnits: 10,
        actualUnits: 10,
        remainingBefore: 1_000,
      },
    },
    request: {
      operation: 'keyword-discovery',
      endpoint: 'fixture',
      limit: ideas.length,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-24T12:00:00.000Z',
    dataStatus: 'complete',
    market,
    summary: {
      requestedSeeds: 1,
      requestedSources: 3,
      discoveredKeywords: ideas.length,
      keywordsWithObservedVolume: ideas.length,
      observedZeroVolume: 0,
      missingOrInvalidVolume: 0,
      keywordsFoundBySeveralSources: ideas.filter(
        (idea) => new Set(idea.sources.map((source) => source.source)).size > 1,
      ).length,
      increasingTrends: 0,
      verdict: `${ideas.length} ideas.`,
    },
    evidence,
    analysis: [],
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

function serpReport(
  keyword: string,
  results: Array<{ domain: string; rank: number }>,
): SerpResultsReport {
  const snapshot: SerpSnapshot = {
    keyword,
    effectiveKeyword: keyword,
    searchEngineDomain: 'google.co.uk',
    checkedAt: '2026-07-24T12:00:00.000Z',
    checkUrl: null,
    resultCount: null,
    pagesCount: null,
    features: [],
    organicResults: results.map((result) => ({
      rankGroup: result.rank,
      rankAbsolute: result.rank,
      page: 1,
      domain: result.domain,
      url: `https://${result.domain}/${keyword.replaceAll(' ', '-')}`,
      title: keyword,
      description: null,
      isFeaturedSnippet: false,
    })),
    localPack: {
      present: false,
      returnedRows: 0,
      retainedRows: 0,
      invalidRows: 0,
      results: [],
    },
  }
  const evidence: ProviderEvidence<SerpSnapshot> = {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'serp-snapshot',
    data: snapshot,
    observedAt: snapshot.checkedAt,
    market,
    coverage: coverage(results.length),
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: cost(),
    request: {
      operation: 'serp-snapshot',
      endpoint: 'fixture',
      limit: results.length,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
  return {
    schemaVersion: 1,
    generatedAt: snapshot.checkedAt,
    dataStatus: 'complete',
    market,
    summary: {
      keyword,
      effectiveKeyword: keyword,
      requestedDepth: results.length,
      organicResults: results.length,
      localPackResults: 0,
      uniqueDomains: new Set(results.map((result) => result.domain)).size,
      observedFeatures: 0,
      correctedQuery: false,
      verdict: 'Fixture snapshot.',
    },
    evidence,
    domains: [],
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

function ratingEvidence(
  target: string,
  value: number,
): MarketIndependentProviderEvidence<DomainRatingObservation> {
  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: 'domain-rating',
    data: {
      target,
      targetMode: 'domain',
      domainRating: observedValue(value),
      licenseUrl: 'https://ahrefs.com/terms',
      attribution: 'Domain Rating by Ahrefs',
      attributionUrl: 'https://ahrefs.com/',
    },
    observedAt: '2026-07-24T12:00:00.000Z',
    market: null,
    coverage: coverage(1),
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 0,
      actualMicros: 0,
      taskIds: [],
      native: {
        unit: 'api-units',
        estimatedUnits: 0,
        actualUnits: 0,
        remainingBefore: 1_000,
      },
    },
    request: {
      operation: 'domain-rating',
      endpoint: 'fixture',
      limit: 1,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function ratingReport(target: string, value: number): DomainRatingReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-24T12:00:00.000Z',
    dataStatus: 'complete',
    summary: {
      target,
      targetMode: 'domain',
      domainRating: value,
      verdict: `${target} has DR ${value}.`,
    },
    evidence: ratingEvidence(target, value),
    caveats: [],
    nextSteps: [],
  }
}

function linkEvidence(
  target: string,
  count: number,
): MarketIndependentProviderEvidence<LinkSummary> {
  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: 'link-summary',
    data: {
      target,
      scope: 'domain',
      backlinks: observedValue(count * 5),
      referringDomains: observedValue(count),
      referringPages: unavailableValue('unavailable', 'Not in fixture.'),
      brokenBacklinks: unavailableValue('unavailable', 'Not in fixture.'),
      brokenPages: unavailableValue('unavailable', 'Not in fixture.'),
      metrics: [],
    },
    observedAt: '2026-07-24T12:00:00.000Z',
    market: null,
    coverage: coverage(1),
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: cost(),
    request: {
      operation: 'link-summary',
      endpoint: 'fixture',
      limit: 1,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function linkProvider(counts: Record<string, number>): LinkSummaryProvider {
  return {
    provider: 'ahrefs',
    capabilitySupport: [
      {
        capability: 'link-summary',
        status: 'available',
        markets: 'all',
      },
    ],
    linkSummary: async (input) =>
      linkEvidence(input.target, counts[input.target] ?? 0),
  }
}

test('orders a bounded research queue from current and provider evidence', async () => {
  const ratings: Record<string, number> = {
    'target.example': 50,
    'weak.example': 30,
    'strong.example': 70,
  }
  const report = await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      keywordLimit: 2,
      competitionEvidence: 'link-summary',
    },
    {
      id: () => 'fixture-run',
      now: () => new Date('2026-07-24T12:00:00.000Z'),
      keywordResearchReport: async () =>
        keywordReport([
          keywordIdea('seo tools', 500, 1),
          keywordIdea('seo audit software', 1_200, 3),
        ]),
      serpResultsReport: async (input) =>
        input.keyword === 'seo tools'
          ? serpReport(input.keyword, [
              { domain: 'target.example', rank: 4 },
              { domain: 'strong.example', rank: 1 },
            ])
          : serpReport(input.keyword, [
              { domain: 'weak.example', rank: 2 },
              { domain: 'strong.example', rank: 3 },
            ]),
      domainRatingReport: async (input) =>
        ratingReport(input.target, ratings[input.target] ?? 0),
      linkSummaryProvider: linkProvider({
        'target.example': 100,
        'weak.example': 20,
        'strong.example': 200,
      }),
    },
  )

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.completedSerps, 2)
  assert.equal(report.opportunities[0]?.keyword, 'seo tools')
  assert.ok(
    report.opportunities[0]?.reviewReasons.some(
      (reason) => reason.code === 'target-already-observed',
    ),
  )
  const second = report.opportunities.find(
    (opportunity) => opportunity.keyword === 'seo audit software',
  )
  assert.ok(
    second?.reviewReasons.some(
      (reason) => reason.code === 'lower-domain-rating-result',
    ),
  )
  assert.ok(
    second?.reviewReasons.some(
      (reason) => reason.code === 'fewer-referring-domains-result',
    ),
  )
  const lowerRatingReason = second?.reviewReasons.find(
    (reason) => reason.code === 'lower-domain-rating-result',
  )
  assert.ok(
    lowerRatingReason?.evidenceRefs.includes(
      'source.domainRatings.observations[0]',
    ),
  )
  assert.ok(
    lowerRatingReason?.evidenceRefs.includes(
      'source.domainRatings.observations[2]',
    ),
  )
  const fewerLinksReason = second?.reviewReasons.find(
    (reason) => reason.code === 'fewer-referring-domains-result',
  )
  assert.ok(
    fewerLinksReason?.evidenceRefs.includes(
      'source.linkSummaries.observations[0]',
    ),
  )
  assert.ok(
    fewerLinksReason?.evidenceRefs.includes(
      'source.linkSummaries.observations[2]',
    ),
  )
  assert.equal(report.summary.keywordsWithLowerDomainRatingResult, 1)
  assert.equal(report.summary.keywordsWithFewerReferringDomainsResult, 1)
  assert.match(report.caveats.join(' '), /does not make a result easy/iu)
})

test('keeps SERP device out of country-level keyword discovery', async () => {
  let discoveryMarket: SearchMarket | undefined
  let serpMarket: SearchMarket | undefined

  await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      keywordProvider: 'ahrefs',
      serpProvider: 'dataforseo',
      discoverySources: ['ideas'],
      discoveryLimit: 1,
      keywordLimit: 1,
      competitionEvidence: 'serp',
    },
    {
      keywordResearchReport: async (input) => {
        discoveryMarket = input.market
        return keywordReport([keywordIdea('seo tools', 100)])
      },
      serpResultsReport: async (input) => {
        serpMarket = input.market
        return serpReport(input.keyword, [
          { domain: 'competitor.example', rank: 1 },
        ])
      },
      id: () => 'report-run',
      now: () => new Date('2026-07-24T12:00:00.000Z'),
    },
  )

  assert.deepEqual(discoveryMarket, {
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google',
  })
  assert.deepEqual(serpMarket, market)
})

test('spreads bounded competitor checks across each keyword highest results', async () => {
  const report = await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      keywordLimit: 3,
      competitorLimit: 4,
      competitionEvidence: 'serp',
    },
    {
      keywordResearchReport: async () =>
        keywordReport([
          keywordIdea('seo tools', 300),
          keywordIdea('keyword two', 200),
          keywordIdea('keyword three', 100),
        ]),
      serpResultsReport: async (input) => {
        const rows: Record<string, Array<{ domain: string; rank: number }>> = {
          'seo tools': [
            { domain: 'first.example', rank: 1 },
            { domain: 'second.example', rank: 2 },
            { domain: 'recurring.example', rank: 9 },
          ],
          'keyword two': [
            { domain: 'third.example', rank: 1 },
            { domain: 'fourth.example', rank: 2 },
            { domain: 'recurring.example', rank: 9 },
          ],
          'keyword three': [
            { domain: 'fifth.example', rank: 1 },
            { domain: 'sixth.example', rank: 2 },
            { domain: 'recurring.example', rank: 9 },
          ],
        }
        return serpReport(input.keyword, rows[input.keyword] ?? [])
      },
    },
  )

  assert.deepEqual(
    report.competitors.map((competitor) => competitor.domain),
    ['first.example', 'third.example', 'fifth.example', 'second.example'],
  )
  assert.equal(report.summary.recurringCompetitors, 1)
  assert.equal(
    report.selection.competitorOrder,
    'keyword-round-robin-absolute-rank-domain-v1',
  )
})

test('keeps completed SERPs when a later provider request times out', async () => {
  let serpCalls = 0
  const report = await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      keywordLimit: 3,
      competitionEvidence: 'serp',
    },
    {
      keywordResearchReport: async () =>
        keywordReport([
          keywordIdea('seo tools', 300),
          keywordIdea('keyword two', 200),
          keywordIdea('keyword three', 100),
        ]),
      serpResultsReport: async (input) => {
        serpCalls++
        if (serpCalls > 1) {
          throw new SeoError(
            'PROVIDER_UNAVAILABLE',
            'The result provider timed out.',
          )
        }
        return serpReport(input.keyword, [
          { domain: 'competitor.example', rank: 1 },
        ])
      },
    },
  )

  assert.equal(serpCalls, 2)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.completedSerps, 1)
  assert.equal(report.summary.failedSerps, 2)
  assert.equal(report.source.serps.observations[1]?.status, 'unavailable')
  assert.match(
    report.source.serps.observations[2]?.reason ?? '',
    /Not requested after the provider became unavailable/u,
  )
})

test('keeps missing enrichment unavailable instead of converting it to zero', async () => {
  const report = await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      competitionEvidence: 'domain-rating',
    },
    {
      keywordResearchReport: async () =>
        keywordReport([keywordIdea('seo tools', 500)]),
      serpResultsReport: async (input) =>
        serpReport(input.keyword, [{ domain: 'weak.example', rank: 1 }]),
      domainRatingReport: async () => {
        throw new Error('Ahrefs is unavailable in the fixture.')
      },
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(
    report.source.domainRatings.observations[0]?.status,
    'unavailable',
  )
  assert.equal(report.opportunities[0]?.competitors[0]?.domainRating, null)
  assert.equal(
    report.opportunities[0]?.competitors[0]?.domainRatingComparedWithTarget,
    'unknown',
  )
  assert.equal(report.summary.keywordsWithLowerDomainRatingResult, 0)
})

test('validates acquisition bounds before calling a provider', async () => {
  let calls = 0
  await assert.rejects(
    competitiveOpportunitiesReport(
      {
        target: 'target.example',
        seeds: ['seo tools'],
        market,
        keywordLimit: 11,
      },
      {
        keywordResearchReport: async () => {
          calls++
          return keywordReport([])
        },
      },
    ),
    /Keyword limit must be from 1 to 10/u,
  )
  assert.equal(calls, 0)

  await assert.rejects(
    competitiveOpportunitiesReport(
      {
        target: 'target.example',
        seeds: ['seo tools'],
        market: { ...market, searchEngine: 'bing' },
      },
      {
        keywordResearchReport: async () => {
          calls++
          return keywordReport([])
        },
      },
    ),
    /supports Google result research/u,
  )
  assert.equal(calls, 0)

  await assert.rejects(
    competitiveOpportunitiesReport(
      {
        target: 'target.example',
        seeds: ['seo tools'],
        market,
        competitionEvidence: 'serp',
        linkProvider: 'ahrefs',
      },
      {
        keywordResearchReport: async () => keywordReport([]),
      },
    ),
    /competitionEvidence to link-summary/u,
  )
})

test('stops after one fatal SERP provider error', async () => {
  let serpCalls = 0
  let ratingCalls = 0
  await assert.rejects(
    competitiveOpportunitiesReport(
      {
        target: 'target.example',
        seeds: ['seo tools'],
        market,
        keywordLimit: 2,
      },
      {
        keywordResearchReport: async () =>
          keywordReport([
            keywordIdea('seo tools', 500),
            keywordIdea('seo audit software', 400),
          ]),
        serpResultsReport: async () => {
          serpCalls++
          throw new SeoError(
            'PROVIDER_UNAVAILABLE',
            'The selected provider cannot return live SERP results.',
          )
        },
        domainRatingReport: async (input) => {
          ratingCalls++
          return ratingReport(input.target, 40)
        },
      },
    ),
    /cannot return live SERP results/u,
  )
  assert.equal(serpCalls, 1)
  assert.equal(ratingCalls, 0)
})

test('bounds maximum provider rows before acquisition and output', async () => {
  const ideas = Array.from({ length: 100 }, (_, index) =>
    keywordIdea(`topic ${String(index).padStart(3, '0')}`, 1_000 - index, 3),
  )
  let serpCalls = 0
  let ratingCalls = 0
  let linkCalls = 0
  const report = await competitiveOpportunitiesReport(
    {
      target: 'target.example',
      seeds: ['seo tools'],
      market,
      discoveryLimit: 100,
      keywordLimit: 10,
      serpDepth: 20,
      competitorLimit: 10,
      competitionEvidence: 'link-summary',
    },
    {
      keywordResearchReport: async () => keywordReport(ideas),
      serpResultsReport: async (input) => {
        serpCalls++
        return serpReport(
          input.keyword,
          Array.from({ length: 20 }, (_, index) => ({
            domain: `competitor-${index % 10}.example`,
            rank: index + 1,
          })),
        )
      },
      domainRatingReport: async (input) => {
        ratingCalls++
        return ratingReport(input.target, 40)
      },
      linkSummaryProvider: {
        ...linkProvider({}),
        linkSummary: async (input) => {
          linkCalls++
          return linkEvidence(input.target, 50)
        },
      },
    },
  )

  assert.equal(serpCalls, 10)
  assert.equal(ratingCalls, 11)
  assert.equal(linkCalls, 11)
  assert.equal(report.processing.discoveryRowsRead, 100)
  assert.equal(report.processing.organicRowsRead, 200)
  assert.equal(report.competitors.length, 10)
  assert.equal(report.opportunities.length, 10)
  assert.ok(report.detailBudget.returned <= report.detailBudget.limit)
  assert.equal(report.detailBudget.limit, 200)
  assert.equal(report.detailBudget.sections.competitorComparisons, 100)
})
