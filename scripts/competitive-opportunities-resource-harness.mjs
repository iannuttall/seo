import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MEBIBYTE = 1024 * 1024
const HEAP_LIMIT_MIB = 192
const WORKER_ENV = 'SEO_COMPETITIVE_OPPORTUNITIES_RESOURCE_WORKER'
const MAX_DURATION_MS = 5_000
const MAX_RSS_GROWTH = 128 * MEBIBYTE
const MAX_OUTPUT_BYTES = 2 * MEBIBYTE

if (process.env[WORKER_ENV] !== '1') {
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      `--max-old-space-size=${HEAP_LIMIT_MIB}`,
      fileURLToPath(import.meta.url),
    ],
    {
      env: { ...process.env, [WORKER_ENV]: '1' },
      stdio: 'inherit',
    },
  )
  if (child.error) throw child.error
  process.exit(child.status ?? 1)
}

const { competitiveOpportunitiesReport, observedValue, unavailableValue } =
  await import('../dist/index.js')

const market = {
  searchEngine: 'google',
  countryCode: 'GB',
  languageCode: 'en',
  device: 'desktop',
}
const generatedAt = '2026-07-24T12:00:00.000Z'

function coverage(rows) {
  return {
    requestedRows: rows,
    returnedRows: rows,
    retainedRows: rows,
    invalidRows: 0,
    providerTotalRows: rows,
    completeness: 'complete',
    nextCursor: null,
  }
}

function cost() {
  return {
    currency: 'USD',
    estimatedMicros: 1_000,
    actualMicros: 1_000,
    taskIds: ['resource-fixture'],
  }
}

const ideas = Array.from({ length: 100 }, (_, index) => ({
  keyword: `topic ${String(index).padStart(3, '0')}`,
  sources: ['ideas', 'related', 'suggestions'].map((source) => ({
    seed: 'topic 000',
    source,
  })),
  monthlySearchVolume: observedValue(10_000 - index),
  monthlySearches: unavailableValue('missing', 'Not in resource fixture.'),
  searchVolumeUpdatedAt: observedValue('2026-07-01'),
  cpcUsd: observedValue(2),
  paidCompetition: observedValue(0.4),
  keywordDifficulty: observedValue(20),
  intent: observedValue('commercial'),
  resultCount: observedValue(1_000),
}))

function keywordReport() {
  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus: 'complete',
    market,
    summary: {
      requestedSeeds: 1,
      requestedSources: 3,
      discoveredKeywords: ideas.length,
      keywordsWithObservedVolume: ideas.length,
      observedZeroVolume: 0,
      missingOrInvalidVolume: 0,
      keywordsFoundBySeveralSources: ideas.length,
      increasingTrends: 0,
      verdict: `${ideas.length} fixture ideas.`,
    },
    evidence: {
      schemaVersion: 1,
      provider: 'semrush',
      capability: 'keyword-discovery',
      data: ideas,
      observedAt: generatedAt,
      market,
      coverage: coverage(ideas.length),
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: {
        ...cost(),
        native: {
          unit: 'api-units',
          estimatedUnits: 100,
          actualUnits: 100,
          remainingBefore: 1_000,
        },
      },
      request: {
        operation: 'keyword-discovery',
        endpoint: 'resource-fixture',
        limit: ideas.length,
        filters: {},
        sort: [],
      },
      warnings: [],
    },
    analysis: [],
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

function serpReport(keyword) {
  const organicResults = Array.from({ length: 20 }, (_, index) => {
    const domain = `competitor-${index % 10}.example`
    return {
      rankGroup: index + 1,
      rankAbsolute: index + 1,
      page: 1,
      domain,
      url: `https://${domain}/${keyword.replaceAll(' ', '-')}`,
      title: keyword,
      description: null,
      isFeaturedSnippet: false,
    }
  })
  const snapshot = {
    keyword,
    effectiveKeyword: keyword,
    searchEngineDomain: 'google.co.uk',
    checkedAt: generatedAt,
    checkUrl: null,
    resultCount: null,
    pagesCount: null,
    features: [],
    organicResults,
    localPack: {
      present: false,
      returnedRows: 0,
      retainedRows: 0,
      invalidRows: 0,
      results: [],
    },
  }
  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus: 'complete',
    market,
    summary: {
      keyword,
      effectiveKeyword: keyword,
      requestedDepth: organicResults.length,
      organicResults: organicResults.length,
      localPackResults: 0,
      uniqueDomains: 10,
      observedFeatures: 0,
      correctedQuery: false,
      verdict: 'Resource fixture snapshot.',
    },
    evidence: {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'serp-snapshot',
      data: snapshot,
      observedAt: generatedAt,
      market,
      coverage: coverage(organicResults.length),
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: cost(),
      request: {
        operation: 'serp-snapshot',
        endpoint: 'resource-fixture',
        limit: organicResults.length,
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

function ratingReport(target) {
  const domainRating = target === 'target.example' ? 50 : 40
  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus: 'complete',
    summary: {
      target,
      targetMode: 'domain',
      domainRating,
      verdict: `${target} has fixture Domain Rating ${domainRating}.`,
    },
    evidence: {
      schemaVersion: 1,
      provider: 'ahrefs',
      capability: 'domain-rating',
      data: {
        target,
        targetMode: 'domain',
        domainRating: observedValue(domainRating),
        licenseUrl: 'https://ahrefs.com/terms',
        attribution: 'Domain Rating by Ahrefs',
        attributionUrl: 'https://ahrefs.com/',
      },
      observedAt: generatedAt,
      market: null,
      coverage: coverage(1),
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: {
        currency: 'USD',
        estimatedMicros: 0,
        actualMicros: 0,
        taskIds: [],
      },
      request: {
        operation: 'domain-rating',
        endpoint: 'resource-fixture',
        limit: 1,
        filters: {},
        sort: [],
      },
      warnings: [],
    },
    caveats: [],
    nextSteps: [],
  }
}

function linkEvidence(target) {
  const referringDomains = target === 'target.example' ? 100 : 50
  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: 'link-summary',
    data: {
      target,
      scope: 'domain',
      backlinks: observedValue(referringDomains * 5),
      referringDomains: observedValue(referringDomains),
      referringPages: unavailableValue(
        'unavailable',
        'Not in resource fixture.',
      ),
      brokenBacklinks: unavailableValue(
        'unavailable',
        'Not in resource fixture.',
      ),
      brokenPages: unavailableValue('unavailable', 'Not in resource fixture.'),
      metrics: [],
    },
    observedAt: generatedAt,
    market: null,
    coverage: coverage(1),
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: cost(),
    request: {
      operation: 'link-summary',
      endpoint: 'resource-fixture',
      limit: 1,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

let keywordCalls = 0
let serpCalls = 0
let ratingCalls = 0
let linkCalls = 0
const baselineRss = process.memoryUsage().rss
let peakRss = baselineRss
const peakSample = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
}, 5)
const startedAt = performance.now()

const report = await competitiveOpportunitiesReport(
  {
    target: 'target.example',
    seeds: ['topic 000'],
    market,
    discoveryLimit: 100,
    keywordLimit: 10,
    serpDepth: 20,
    competitorLimit: 10,
    competitionEvidence: 'link-summary',
  },
  {
    id: () => 'resource-fixture',
    now: () => new Date(generatedAt),
    keywordResearchReport: async () => {
      keywordCalls++
      return keywordReport()
    },
    serpResultsReport: async ({ keyword }) => {
      serpCalls++
      return serpReport(keyword)
    },
    domainRatingReport: async ({ target }) => {
      ratingCalls++
      return ratingReport(target)
    },
    linkSummaryProvider: {
      provider: 'ahrefs',
      capabilitySupport: [
        {
          capability: 'link-summary',
          status: 'available',
          markets: 'all',
        },
      ],
      linkSummary: async ({ target }) => {
        linkCalls++
        return linkEvidence(target)
      },
    },
  },
)

clearInterval(peakSample)
peakRss = Math.max(peakRss, process.memoryUsage().rss)
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, peakRss - baselineRss)
const outputBytes = Buffer.byteLength(JSON.stringify(report))

console.log(
  JSON.stringify({
    report: 'competitive-opportunities',
    heapLimitMiB: HEAP_LIMIT_MIB,
    durationMs: Math.round(durationMs),
    peakRssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
    bytesRead: 0,
    bytesWritten: 0,
    outputBytes,
    keywordCalls,
    discoveryRows: report.processing.discoveryRowsRead,
    serpCalls,
    organicRows: report.processing.organicRowsRead,
    competitors: report.competitors.length,
    ratingCalls,
    linkCalls,
    returnedDetailRows: report.detailBudget.returned,
    detailRowLimit: report.detailBudget.limit,
  }),
)

assert.equal(keywordCalls, 1)
assert.equal(report.processing.discoveryRowsRead, 100)
assert.equal(serpCalls, 10)
assert.equal(report.processing.organicRowsRead, 200)
assert.equal(report.competitors.length, 10)
assert.equal(ratingCalls, 11)
assert.equal(linkCalls, 11)
assert.ok(report.detailBudget.returned <= report.detailBudget.limit)
assert.ok(outputBytes <= MAX_OUTPUT_BYTES)
assert.ok(durationMs <= MAX_DURATION_MS)
assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)
