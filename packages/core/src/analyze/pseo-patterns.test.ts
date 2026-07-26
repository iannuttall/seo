import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '../errors.js'
import {
  observedValue,
  type SearchMarket,
  unavailableValue,
} from '../providers/contracts.js'
import type { KeywordMetricsReport } from './keyword-metrics.js'
import { buildPseoAuditReportFromRows } from './pseo/audit.js'
import type { PseoPageRow, PseoQueryPageRow } from './pseo/types.js'
import type { PseoPatternsFirstPartyEvidence } from './pseo-patterns/first-party.js'
import {
  generatePseoPatternCandidates,
  pseoPatternsReport,
  validatePseoPatternsInput,
} from './pseo-patterns.js'
import type { SerpResultsReport } from './serp-results.js'

const generatedAt = '2026-07-26T12:00:00.000Z'
const market: SearchMarket = {
  searchEngine: 'google',
  countryCode: 'US',
  languageCode: 'en',
  device: 'desktop',
}

function firstPartyEvidence(): PseoPatternsFirstPartyEvidence {
  const queryRows: PseoQueryPageRow[] = [
    {
      query: 'inoreader vs feedly',
      page: 'https://example.com/compare/feedly-vs-inoreader',
      clicks: 1,
      impressions: 1_000,
      position: 8,
    },
    {
      query: 'feedly vs inoreader',
      page: 'https://example.com/compare/feedly-vs-inoreader',
      clicks: 2,
      impressions: 250,
      position: 6,
    },
    {
      query: 'feedly alternatives',
      page: 'https://example.com/alternatives/feedly',
      clicks: 3,
      impressions: 300,
      position: 7,
    },
    {
      query: 'reading time calculator',
      page: 'https://example.com/tools/reading-time',
      clicks: 4,
      impressions: 200,
      position: 5,
    },
    {
      query: 'best rss readers',
      page: 'https://example.com/blog/rss-readers',
      clicks: 1,
      impressions: 100,
      position: 9,
    },
    {
      query: 'research brief template',
      page: 'https://example.com/templates/research-brief',
      clicks: 1,
      impressions: 80,
      position: 10,
    },
  ]
  const byPage = new Map<string, PseoPageRow>()
  for (const row of queryRows) {
    const existing = byPage.get(row.page)
    byPage.set(row.page, {
      page: row.page,
      clicks: (existing?.clicks ?? 0) + row.clicks,
      impressions: (existing?.impressions ?? 0) + row.impressions,
      position: existing
        ? (existing.position * existing.impressions +
            row.position * row.impressions) /
          (existing.impressions + row.impressions)
        : row.position,
    })
  }
  const pageRows = [...byPage.values()]
  const sitemapUrls = [
    ...pageRows.map((row) => row.page),
    'https://example.com/compare/feedly-vs-pocket',
  ]
  const audit = buildPseoAuditReportFromRows({
    site: 'sc-domain:example.com',
    generatedAt,
    range: { startDate: '2026-04-25', endDate: '2026-07-23' },
    days: 90,
    queryPageRows: queryRows,
    pageRows,
    sitemapUrls,
    templateLimit: 25,
    minimumTemplateUrls: 2,
    minimumTemplateShare: 0,
    minimumTemplateImpressions: 0,
    crawlSamplesPerTemplate: 0,
    inspectionSamplesPerTemplate: 0,
    maxRowsPerRequest: 50_000,
    pageRowsFetched: pageRows.length,
    queryPageRowsFetched: queryRows.length,
    sitemapsRequested: 1,
    maxUrlsPerSitemap: 50_000,
    includeBrand: true,
  })
  return {
    audit,
    queryRows,
    pageRows,
    discoveredUrls: sitemapUrls,
  }
}

function comparisonInput(values: string[]) {
  return {
    site: 'sc-domain:example.com',
    patternSets: [
      {
        id: 'reader-comparisons',
        kind: 'comparison' as const,
        shape: 'pairs' as const,
        coveragePolicy: 'complete-set' as const,
        pairing: 'all-pairs' as const,
        values,
        queryTemplates: ['{left} vs {right}', '{right} vs {left}'],
        pathTemplate: '/compare/{left}-vs-{right}',
      },
    ],
  }
}

function keywordMetricsFixture(keywords: string[]): KeywordMetricsReport {
  const data = keywords.map((keyword, index) => ({
    keyword,
    monthlySearchVolume:
      index === 0
        ? observedValue(260)
        : unavailableValue<number>(
            'missing',
            'The fixture has no estimate for this term.',
          ),
    monthlySearches: unavailableValue<
      Array<{ year: number; month: number; searchVolume: number }>
    >('missing', 'History is not in the fixture.'),
    searchVolumeUpdatedAt: observedValue('2026-07-01'),
    cpcUsd: unavailableValue<number>('missing', 'Not in the fixture.'),
    paidCompetition: unavailableValue<number>('missing', 'Not in the fixture.'),
    keywordDifficulty: observedValue(20),
    intent: observedValue('commercial'),
    resultCount: observedValue(1_000),
  }))
  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus: 'complete',
    market,
    summary: {
      requestedKeywords: keywords.length,
      providerRows: data.length,
      keywordsWithObservedVolume: 1,
      observedZeroVolume: 0,
      missingOrInvalidVolume: Math.max(0, data.length - 1),
      increasingTrends: 0,
      decreasingTrends: 0,
      stableTrends: 0,
      unavailableTrends: data.length,
      verdict: 'Fixture keyword metrics.',
    },
    evidence: {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'keyword-metrics',
      data,
      observedAt: generatedAt,
      market,
      coverage: {
        requestedRows: keywords.length,
        returnedRows: data.length,
        retainedRows: data.length,
        invalidRows: 0,
        providerTotalRows: data.length,
        completeness: 'complete',
        nextCursor: null,
      },
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: {
        currency: 'USD',
        estimatedMicros: 1_000,
        actualMicros: 800,
        taskIds: ['keyword-task'],
      },
      request: {
        operation: 'keyword-metrics',
        endpoint: '/fixture/metrics',
        limit: keywords.length,
        filters: {},
        sort: [],
      },
      warnings: [],
    },
    analysis: data.map((item) => ({
      keyword: item.keyword,
      trend: {
        state: 'unavailable',
        reason: 'History is not in the fixture.',
      },
    })),
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

function serpFixture(keyword: string): SerpResultsReport {
  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus: 'complete',
    market,
    summary: {
      keyword,
      effectiveKeyword: keyword,
      requestedDepth: 10,
      organicResults: 1,
      localPackResults: 0,
      uniqueDomains: 1,
      observedFeatures: 1,
      correctedQuery: false,
      verdict: 'Fixture result.',
    },
    evidence: {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'serp-snapshot',
      data: {
        keyword,
        effectiveKeyword: keyword,
        searchEngineDomain: 'google.com',
        checkedAt: generatedAt,
        checkUrl: null,
        resultCount: 1_000,
        pagesCount: 10,
        features: ['organic'],
        organicResults: [
          {
            rankGroup: 1,
            rankAbsolute: 1,
            page: 1,
            domain: 'example.com',
            url: 'https://example.com/result',
            title: 'Fixture result',
            description: null,
            isFeaturedSnippet: false,
          },
        ],
        localPack: {
          present: false,
          returnedRows: 0,
          retainedRows: 0,
          invalidRows: 0,
          results: [],
        },
      },
      observedAt: generatedAt,
      market,
      coverage: {
        requestedRows: 10,
        returnedRows: 1,
        retainedRows: 1,
        invalidRows: 0,
        providerTotalRows: 1,
        completeness: 'complete',
        nextCursor: null,
      },
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: {
        currency: 'USD',
        estimatedMicros: 2_000,
        actualMicros: 2_000,
        taskIds: [`serp-${keyword}`],
      },
      request: {
        operation: 'serp-snapshot-live',
        endpoint: '/fixture/serp',
        limit: 10,
        filters: {},
        sort: [],
      },
      warnings: [],
    },
    domains: [],
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

test('pSEO patterns generates all 78 unordered topics for 13 entities', () => {
  const values = [
    'Dewey',
    'Evernote',
    'Feedly',
    'Flipboard',
    'Inoreader',
    'Instapaper',
    'Keep',
    'Matter',
    'Omnivore',
    'Pocket',
    'Raindrop',
    'Readwise Reader',
    'Smry',
  ]
  const forward = validatePseoPatternsInput(comparisonInput(values))
  const reverse = validatePseoPatternsInput(
    comparisonInput([...values].reverse()),
  )
  const first = generatePseoPatternCandidates({
    sets: forward.patternSets,
    limit: forward.candidateLimit,
  })
  const second = generatePseoPatternCandidates({
    sets: reverse.patternSets,
    limit: reverse.candidateLimit,
  })

  assert.equal(first.patternSets[0]?.plannedTopics, 78)
  assert.equal(first.patternSets[0]?.plannedQueryVariants, 156)
  assert.equal(first.candidates.length, 78)
  assert.deepEqual(first, second)
  assert.equal(
    new Set(first.candidates.map((candidate) => candidate.id)).size,
    78,
  )
})

test('pSEO patterns supports term and matrix shapes without pair semantics', () => {
  const options = validatePseoPatternsInput({
    site: 'sc-domain:example.com',
    patternSets: [
      {
        id: 'search-utilities',
        kind: 'utility',
        shape: 'terms',
        values: ['reading time', 'rss feed'],
        queryTemplates: ['{value} calculator', '{value} checker'],
        pathTemplate: '/tools/{value}',
      },
      {
        id: 'reader-audiences',
        kind: 'persona',
        shape: 'matrix',
        axes: [
          {
            id: 'product',
            values: ['rss reader', 'read it later app'],
          },
          {
            id: 'audience',
            values: ['journalists', 'researchers', 'teams'],
          },
        ],
        queryTemplates: ['{product} for {audience}'],
        pathTemplate: '/for/{product}/{audience}',
      },
    ],
  })
  const generated = generatePseoPatternCandidates({
    sets: options.patternSets,
    limit: options.candidateLimit,
  })

  assert.equal(
    generated.patternSets.find((set) => set.id === 'search-utilities')
      ?.plannedTopics,
    2,
  )
  assert.equal(
    generated.patternSets.find((set) => set.id === 'reader-audiences')
      ?.plannedTopics,
    6,
  )
  assert.equal(generated.candidates.length, 8)
  assert.ok(
    generated.candidates.some(
      (candidate) => candidate.queries[0] === 'rss reader for researchers',
    ),
  )
})

test('pSEO patterns bounds generation fairly across declared sets', () => {
  const options = validatePseoPatternsInput({
    site: 'sc-domain:example.com',
    candidateLimit: 3,
    patternSets: [
      {
        id: 'first',
        kind: 'custom',
        shape: 'terms',
        values: Array.from({ length: 100 }, (_, index) => `first ${index}`),
        queryTemplates: ['{value} benchmark'],
      },
      {
        id: 'second',
        kind: 'custom',
        shape: 'terms',
        values: Array.from({ length: 100 }, (_, index) => `second ${index}`),
        queryTemplates: ['{value} benchmark'],
      },
    ],
  })
  const generated = generatePseoPatternCandidates({
    sets: options.patternSets,
    limit: options.candidateLimit,
  })

  assert.equal(generated.candidates.length, 3)
  assert.ok(generated.patternSets.every((set) => set.returnedTopics >= 1))
  assert.equal(
    generated.patternSets.reduce((sum, set) => sum + set.plannedTopics, 0),
    200,
  )
})

test('pSEO patterns returns Search Console evidence without external calls', async () => {
  let keywordCalls = 0
  let serpCalls = 0
  const report = await pseoPatternsReport(
    comparisonInput(['Feedly', 'Inoreader', 'Pocket']),
    {
      firstPartyReport: async () => firstPartyEvidence(),
      keywordMetricsReport: async () => {
        keywordCalls += 1
        return keywordMetricsFixture([])
      },
      serpResultsReport: async () => {
        serpCalls += 1
        return serpFixture('unused')
      },
    },
  )

  assert.equal(keywordCalls, 0)
  assert.equal(serpCalls, 0)
  assert.equal(report.source.external.keywordMetrics.status, 'not-requested')
  assert.ok(
    report.observedPatterns.some((pattern) => pattern.kind === 'comparison'),
  )
  assert.ok(
    report.observedPatterns.some((pattern) => pattern.kind === 'utility'),
  )
  assert.ok(
    report.observedQueries.some(
      (query) => query.query === 'inoreader vs feedly',
    ),
  )
  assert.equal(report.summary.plannedTopics, 3)
  assert.equal(report.summary.existingTopics, 2)
  assert.equal(report.summary.strategicGaps, 1)
  const feedlyInoreader = report.candidates.find(
    (candidate) =>
      candidate.variables.left?.id === 'feedly' &&
      candidate.variables.right?.id === 'inoreader',
  )
  assert.equal(feedlyInoreader?.firstParty.impressions, 1_250)
  assert.equal(feedlyInoreader?.firstParty.matchedQueries, 2)
  assert.equal(feedlyInoreader?.review.state, 'existing-topic')
  const inoreaderPocket = report.candidates.find(
    (candidate) =>
      candidate.variables.left?.id === 'inoreader' &&
      candidate.variables.right?.id === 'pocket',
  )
  assert.equal(inoreaderPocket?.firstParty.state, 'not-retained')
  assert.equal(inoreaderPocket?.review.state, 'strategic-gap')
})

test('pSEO patterns keeps complete-set gaps separate from evidence-led gaps', async () => {
  const report = await pseoPatternsReport(
    {
      site: 'sc-domain:example.com',
      patternSets: [
        {
          id: 'evidence-led-comparisons',
          kind: 'comparison',
          shape: 'pairs',
          pairing: 'explicit',
          coveragePolicy: 'evidence-led',
          values: ['Feedly', 'Inoreader', 'Pocket'],
          pairs: [
            { left: 'feedly', right: 'inoreader' },
            { left: 'inoreader', right: 'pocket' },
          ],
          queryTemplates: ['{left} vs {right}', '{right} vs {left}'],
          pathTemplate: '/planned/{left}-vs-{right}',
        },
      ],
    },
    { firstPartyReport: async () => firstPartyEvidence() },
  )

  assert.equal(report.summary.searchEvidencedGaps, 1)
  assert.equal(report.summary.strategicGaps, 0)
  assert.equal(
    report.candidates.find((candidate) =>
      candidate.id.includes('left=feedly,right=inoreader'),
    )?.review.state,
    'search-evidenced-gap',
  )
  assert.equal(
    report.candidates.find((candidate) =>
      candidate.id.includes('left=inoreader,right=pocket'),
    )?.review.state,
    'research-only',
  )
})

test('pSEO patterns keeps another ranking page visible in a search-evidenced gap', async () => {
  const report = await pseoPatternsReport(
    {
      site: 'sc-domain:example.com',
      patternSets: [
        {
          id: 'utilities',
          kind: 'utility',
          shape: 'terms',
          values: ['reading time'],
          queryTemplates: ['{value} calculator'],
          pathTemplate: '/calculators/{value}',
        },
      ],
    },
    { firstPartyReport: async () => firstPartyEvidence() },
  )

  assert.equal(report.candidates[0]?.review.state, 'search-evidenced-gap')
  assert.deepEqual(report.candidates[0]?.review.evidenceRefs, [
    'firstParty',
    'inventory',
  ])
  assert.match(report.candidates[0]?.review.reason ?? '', /another page/i)
})

test('pSEO patterns matches either path orientation for comparison pairs', async () => {
  const evidence = firstPartyEvidence()
  evidence.discoveredUrls.push('https://example.com/compare/raindrop-vs-pocket')
  const report = await pseoPatternsReport(
    {
      site: 'sc-domain:example.com',
      patternSets: [
        {
          id: 'comparisons',
          kind: 'comparison',
          shape: 'pairs',
          coveragePolicy: 'complete-set',
          pairing: 'all-pairs',
          values: ['Pocket', 'Raindrop'],
          queryTemplates: ['{left} vs {right}', '{right} vs {left}'],
          pathTemplate: '/compare/{left}-vs-{right}',
        },
      ],
    },
    { firstPartyReport: async () => evidence },
  )

  assert.equal(report.summary.existingTopics, 1)
  assert.equal(report.summary.strategicGaps, 0)
  assert.equal(report.candidates[0]?.inventory.state, 'existing')
  assert.deepEqual(report.candidates[0]?.inventory.sampleUrls, [
    'https://example.com/compare/raindrop-vs-pocket',
  ])
})

test('pSEO patterns keeps directional conversion paths distinct', async () => {
  const evidence = firstPartyEvidence()
  evidence.discoveredUrls.push('https://example.com/convert/word-to-pdf')
  const report = await pseoPatternsReport(
    {
      site: 'sc-domain:example.com',
      patternSets: [
        {
          id: 'conversions',
          kind: 'conversion',
          shape: 'pairs',
          coveragePolicy: 'complete-set',
          pairing: 'explicit',
          values: ['PDF', 'Word'],
          pairs: [{ left: 'pdf', right: 'word' }],
          queryTemplates: ['{left} to {right}'],
          pathTemplate: '/convert/{left}-to-{right}',
        },
      ],
    },
    { firstPartyReport: async () => evidence },
  )

  assert.equal(report.summary.existingTopics, 0)
  assert.equal(report.summary.strategicGaps, 1)
  assert.equal(report.candidates[0]?.inventory.state, 'missing')
})

test('pSEO patterns retains provider states, SERP evidence, and known cost', async () => {
  const metricInputs: string[][] = []
  const serpInputs: string[] = []
  const report = await pseoPatternsReport(
    {
      ...comparisonInput(['Feedly', 'Inoreader', 'Pocket']),
      includeExternal: true,
      market,
      keywordLimit: 3,
      serpLimit: 2,
    },
    {
      firstPartyReport: async () => firstPartyEvidence(),
      keywordMetricsReport: async (input) => {
        metricInputs.push(input.keywords)
        return keywordMetricsFixture(input.keywords)
      },
      serpResultsReport: async (input) => {
        serpInputs.push(input.keyword)
        return serpFixture(input.keyword)
      },
    },
  )

  assert.equal(metricInputs.length, 1)
  assert.equal(metricInputs[0]?.length, 3)
  assert.equal(serpInputs.length, 2)
  assert.equal(report.source.external.keywordMetrics.rows.length, 3)
  assert.equal(
    report.source.external.keywordMetrics.rows[1]?.monthlySearchVolume.state,
    'missing',
  )
  assert.equal(report.source.external.serps.completedQueries, 2)
  assert.equal(report.source.external.cost.knownActualMicros, 4_800)
  assert.ok(
    report.candidates.some(
      (candidate) => candidate.external.keywordMetricRefs.length > 0,
    ),
  )
})

test('pSEO patterns stops repeated SERP calls after provider failure', async () => {
  let serpCalls = 0
  const report = await pseoPatternsReport(
    {
      ...comparisonInput(['Feedly', 'Inoreader', 'Pocket']),
      includeExternal: true,
      market,
      keywordLimit: 0,
      serpLimit: 3,
    },
    {
      firstPartyReport: async () => firstPartyEvidence(),
      serpResultsReport: async () => {
        serpCalls += 1
        throw new SeoError(
          'PROVIDER_UNAVAILABLE',
          'Fixture provider is offline.',
        )
      },
    },
  )

  assert.equal(serpCalls, 1)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.external.serps.failedQueries, 1)
  assert.equal(report.source.external.serps.notAttemptedQueries, 2)
  assert.equal(
    report.source.external.serps.observations[1]?.status,
    'not-attempted',
  )
  assert.match(
    report.source.external.serps.observations[1]?.reason ?? '',
    /not attempted/i,
  )
  assert.ok(report.observedPatterns.length > 0)
})

test('pSEO patterns rejects malformed matrices before acquisition', async () => {
  let firstPartyCalls = 0
  await assert.rejects(
    () =>
      pseoPatternsReport(
        {
          site: 'sc-domain:example.com',
          patternSets: [
            {
              id: 'bad-matrix',
              kind: 'persona',
              shape: 'matrix',
              axes: [
                { id: 'product', values: ['rss reader'] },
                { id: 'audience', values: ['researchers'] },
              ],
              queryTemplates: ['{product} for people'],
            },
          ],
        },
        {
          firstPartyReport: async () => {
            firstPartyCalls += 1
            return firstPartyEvidence()
          },
        },
      ),
    (error: unknown) =>
      error instanceof SeoError && error.code === 'INVALID_INPUT',
  )
  assert.equal(firstPartyCalls, 0)
})

test('pSEO patterns rejects malformed placeholders before acquisition', async () => {
  let firstPartyCalls = 0
  await assert.rejects(
    () =>
      pseoPatternsReport(
        {
          site: 'sc-domain:example.com',
          patternSets: [
            {
              id: 'bad-template',
              kind: 'template',
              shape: 'terms',
              values: ['brief'],
              queryTemplates: ['{{value}} template'],
            },
          ],
        },
        {
          firstPartyReport: async () => {
            firstPartyCalls += 1
            return firstPartyEvidence()
          },
        },
      ),
    (error: unknown) =>
      error instanceof SeoError && error.code === 'INVALID_INPUT',
  )
  assert.equal(firstPartyCalls, 0)
})

test('pSEO patterns keeps its maximum logical output inside one detail budget', async () => {
  const report = await pseoPatternsReport(
    {
      site: 'sc-domain:example.com',
      candidateLimit: 250,
      observedQueryLimit: 250,
      patternSets: [
        {
          id: 'large-matrix',
          kind: 'custom',
          shape: 'matrix',
          axes: [
            {
              id: 'thing',
              values: Array.from(
                { length: 100 },
                (_, index) => `thing ${index}`,
              ),
            },
            {
              id: 'audience',
              values: Array.from(
                { length: 100 },
                (_, index) => `audience ${index}`,
              ),
            },
          ],
          queryTemplates: [
            '{thing} for {audience}',
            'best {thing} for {audience}',
            'free {thing} for {audience}',
            '{audience} {thing}',
            '{thing} used by {audience}',
          ],
        },
      ],
    },
    { firstPartyReport: async () => firstPartyEvidence() },
  )

  assert.equal(report.summary.plannedTopics, 10_000)
  assert.equal(report.summary.returnedTopics, 250)
  assert.equal(report.dataStatus, 'partial')
  assert.ok(report.detailBudget.returned <= report.detailBudget.limit)
  assert.equal(report.detailBudget.sections.candidates, 250)
  assert.equal(report.detailBudget.sections.queryVariants, 1_250)
})
