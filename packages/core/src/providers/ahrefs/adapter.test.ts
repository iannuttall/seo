import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { keywordMetricsReport } from '../../analyze/keyword-metrics.js'
import Database from '../../storage/sqlite.js'
import type { ProviderCandidate } from '../resolver.js'
import { AhrefsClient, type AhrefsClientOptions } from './client.js'
import { AhrefsDomainRatingProvider } from './domain-rating.js'
import { AhrefsDomainResearchProvider } from './domain-research.js'
import { AhrefsKeywordDiscoveryProvider } from './keyword-discovery.js'
import { AhrefsKeywordMetricsProvider } from './keyword-metrics.js'
import { AhrefsLinkProvider } from './link-research.js'

const market = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
}

function limitsFixture() {
  return {
    limits_and_usage: {
      api_key_expiration_date: '2027-07-24T00:00:00Z',
      subscription: 'Lite',
      units_limit_api_key: 100_000,
      units_limit_workspace: 250_000,
      units_usage_api_key: 1_250,
      units_usage_workspace: 2_500,
      usage_reset_date: '2026-08-01',
    },
  }
}

function cacheDatabase(): Database.Database {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE provider_cache (
      provider TEXT NOT NULL,
      credential_scope TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      row_count INTEGER,
      source_cost_micros INTEGER,
      task_ids_json TEXT NOT NULL DEFAULT '[]',
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(provider, credential_scope, operation, request_hash)
    ) WITHOUT ROWID;
  `)
  return database
}

function paidResponse(
  data: unknown,
  input: {
    rows: number
    costPerRow: number
    expectedUnits?: number
    actualUnits?: number
  },
) {
  return new Response(JSON.stringify(data), {
    headers: {
      'x-api-rows': String(input.rows),
      'x-api-units-cost-row': String(input.costPerRow),
      'x-api-units-cost-total': String(
        input.expectedUnits ?? Math.max(50, input.costPerRow * input.rows),
      ),
      'x-api-units-cost-total-actual': String(
        input.actualUnits ?? Math.max(50, input.costPerRow * input.rows),
      ),
      'x-api-cache': 'miss',
    },
  })
}

function clientOptions(
  database: Database.Database,
  fetch: NonNullable<AhrefsClientOptions['fetch']>,
): AhrefsClientOptions {
  return {
    apiKey: 'ahrefs-adapter-test-key',
    baseUrl: 'https://provider.invalid/v3/',
    database,
    fetch,
    now: () => new Date('2026-07-24T12:00:00.000Z'),
    spendLimits: {
      dailyNoticeMicros: 5_000_000,
      dailyHardLimitMicros: null,
      monthlyHardLimitMicros: null,
      maxRequestsPerReport: 20,
      maxRowsPerReport: 10_000,
    },
  }
}

test('Ahrefs keyword adapters preserve typed zeroes, omissions, and seed provenance', async () => {
  const database = cacheDatabase()
  const requests: URL[] = []
  const options = clientOptions(database, async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/limits-and-usage')) {
      return new Response(JSON.stringify(limitsFixture()))
    }
    requests.push(parsed)
    if (parsed.pathname.endsWith('/overview')) {
      return paidResponse(
        {
          keywords: [
            {
              keyword: 'zero keyword',
              volume: 0,
              cpc: 0,
              difficulty: 0,
              intents: { informational: true },
            },
          ],
        },
        { rows: 1, costPerRow: 32 },
      )
    }
    const seed = parsed.searchParams.get('keywords')
    return paidResponse(
      {
        keywords: [
          { keyword: seed === 'alpha' ? 'shared idea' : 'other idea' },
        ],
      },
      { rows: 1, costPerRow: 1 },
    )
  })
  const client = new AhrefsClient(options)
  const metricsProvider = new AhrefsKeywordMetricsProvider({ client })
  const metrics = await metricsProvider.keywordMetrics({
    keywords: ['Missing Keyword', 'zero keyword', 'Zero  Keyword'],
    market,
  })

  assert.equal(
    requests[0]?.searchParams.get('keywords'),
    'missing keyword,zero keyword',
  )
  assert.deepEqual(
    metrics.data.map((row) => row.keyword),
    ['missing keyword', 'zero keyword'],
  )
  assert.equal(metrics.data[0]?.monthlySearchVolume.state, 'missing')
  assert.deepEqual(metrics.data[1]?.monthlySearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.equal(metrics.coverage.completeness, 'partial')

  const report = await keywordMetricsReport(
    {
      keywords: ['zero keyword'],
      market,
      provider: 'ahrefs',
      refresh: true,
    },
    {
      candidates: [
        {
          adapter: metricsProvider,
          connected: true,
          priority: 1,
        },
      ] satisfies ProviderCandidate[],
      now: () => new Date('2026-07-24T13:00:00.000Z'),
    },
  )
  assert.equal(report.evidence.provider, 'ahrefs')
  assert.equal(report.summary.observedZeroVolume, 1)

  const discovery = await new AhrefsKeywordDiscoveryProvider({
    client,
  }).discoverKeywords({
    seeds: ['beta', 'alpha'],
    sources: ['related', 'ideas'],
    market,
    limit: 8,
    refresh: true,
  })
  const discoveryRequests = requests.filter((request) =>
    request.pathname.includes('/keywords-explorer/'),
  )
  assert.equal(discoveryRequests.length, 6)
  assert.ok(
    discoveryRequests
      .slice(-4)
      .every((request) => request.searchParams.get('limit') === '2'),
  )
  assert.deepEqual(
    discovery.data.map((row) => row.keyword),
    ['other idea', 'shared idea'],
  )
  assert.equal(discovery.data[0]?.sources.length, 2)
  assert.equal(discovery.data[1]?.sources.length, 2)
  assert.equal(discovery.request.filters.providerRequests, 4)
  database.close()
})

test('Ahrefs domain research maps only compatible native fields and filters requests', async () => {
  const database = cacheDatabase()
  const requests: URL[] = []
  const options = clientOptions(database, async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/limits-and-usage')) {
      return new Response(JSON.stringify(limitsFixture()))
    }
    requests.push(parsed)
    if (parsed.pathname.endsWith('/metrics')) {
      return paidResponse(
        {
          metrics: {
            org_cost: 25_000,
            org_keywords: 5,
            org_keywords_1_3: 2,
            org_traffic: 100,
            paid_cost: 0,
            paid_keywords: 0,
            paid_pages: 0,
            paid_traffic: 0,
          },
        },
        { rows: 1, costPerRow: 44 },
      )
    }
    if (parsed.pathname.endsWith('/organic-keywords')) {
      return paidResponse(
        {
          keywords: [
            {
              keyword: 'zero keyword',
              best_position: 1,
              best_position_kind: 'organic',
              best_position_url: 'https://example.com/zero',
              volume: 0,
              cpc: 0,
              keyword_difficulty: 0,
              sum_traffic: 0,
              is_branded: false,
              is_commercial: false,
              is_informational: true,
              is_local: false,
              is_navigational: false,
              is_transactional: false,
            },
          ],
        },
        { rows: 1, costPerRow: 41 },
      )
    }
    if (parsed.pathname.endsWith('/top-pages')) {
      return paidResponse(
        {
          pages: [
            {
              url: 'https://example.com/page',
              keywords: 3,
              sum_traffic: 40,
              value: 2_500,
            },
          ],
        },
        { rows: 1, costPerRow: 22 },
      )
    }
    const keyword = parsed.searchParams.get('keyword')
    return paidResponse(
      {
        positions:
          keyword === 'first'
            ? [
                {
                  position: 1,
                  type: ['organic'],
                  url: 'https://example.com/a',
                },
                {
                  position: 2,
                  type: ['organic'],
                  url: 'https://other.com/a',
                },
              ]
            : [
                {
                  position: 3,
                  type: ['organic'],
                  url: 'https://example.com/b',
                },
                {
                  position: 1,
                  type: ['organic'],
                  url: 'https://third.com/b',
                },
              ],
      },
      { rows: 2, costPerRow: 3 },
    )
  })
  const provider = new AhrefsDomainResearchProvider({
    client: new AhrefsClient(options),
    now: options.now,
  })

  const overview = await provider.domainOverview({
    domain: 'example.com',
    market,
  })
  assert.deepEqual(overview.data.organic.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 100,
  })
  assert.deepEqual(overview.data.organic.estimatedMonthlyTrafficCostUsd, {
    state: 'observed',
    value: 250,
  })
  assert.equal(overview.data.organic.rankings.state, 'unavailable')
  assert.equal(overview.coverage.completeness, 'complete')
  assert.equal(overview.coverage.providerTotalRows, 1)

  const ranked = await provider.rankedKeywords({
    target: 'example.com',
    market,
    includeSubdomains: false,
    resultTypes: ['organic'],
    minSearchVolume: 0,
    maxRank: 10,
    excludeTerms: ['jobs'],
    limit: 10,
  })
  assert.deepEqual(ranked.data.rows[0]?.monthlySearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.deepEqual(ranked.data.rows[0]?.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 0,
  })
  const rankedRequest = requests.find((request) =>
    request.pathname.endsWith('/organic-keywords'),
  )
  assert.equal(rankedRequest?.searchParams.get('mode'), 'domain')
  assert.deepEqual(
    JSON.parse(rankedRequest?.searchParams.get('where') ?? '{}'),
    {
      and: [
        { field: 'best_position_kind', is: ['eq', 'organic'] },
        { field: 'volume', is: ['gte', 0] },
        { field: 'best_position', is: ['lte', 10] },
        { not: { field: 'keyword', is: ['isubstring', 'jobs'] } },
      ],
    },
  )

  const pages = await provider.rankingPages({
    domain: 'example.com',
    market,
    limit: 10,
  })
  assert.deepEqual(pages.data.rows[0]?.organic.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 40,
  })
  assert.deepEqual(pages.data.rows[0]?.organic.estimatedMonthlyTrafficCostUsd, {
    state: 'observed',
    value: 25,
  })

  const competitors = await provider.serpCompetitors({
    keywords: ['second', 'first'],
    market,
    includeSubdomains: false,
    resultTypes: ['organic'],
    limit: 10,
  })
  assert.equal(competitors.data.rows[0]?.domain, 'example.com')
  assert.equal(competitors.data.rows[0]?.matchedKeywords, 2)
  assert.deepEqual(competitors.data.rows[0]?.averagePosition, {
    state: 'observed',
    value: 2,
  })
  assert.equal(competitors.data.rows[0]?.visibility.state, 'unavailable')
  database.close()
})

test('Ahrefs link research and Domain Rating preserve source semantics and attribution', async () => {
  const database = cacheDatabase()
  const requests: URL[] = []
  const options = clientOptions(database, async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/limits-and-usage')) {
      return new Response(JSON.stringify(limitsFixture()))
    }
    requests.push(parsed)
    if (parsed.pathname.endsWith('/domain-rating-free')) {
      return new Response(
        JSON.stringify({
          domain_rating: {
            domain_rating: 42.5,
            license: 'https://ahrefs.com/terms',
          },
        }),
      )
    }
    if (parsed.pathname.endsWith('/backlinks-stats')) {
      return paidResponse(
        {
          metrics: {
            all_time: 500,
            all_time_refdomains: 100,
            live: 400,
            live_refdomains: 80,
          },
        },
        { rows: 1, costPerRow: 12 },
      )
    }
    if (parsed.pathname.endsWith('/refdomains')) {
      return paidResponse(
        {
          refdomains: [
            {
              domain: 'source.example',
              domain_rating: 20,
              first_seen: '2025-01-01T00:00:00Z',
              links_to_target: 3,
            },
          ],
        },
        { rows: 1, costPerRow: 4 },
      )
    }
    return paidResponse(
      {
        backlinks: [
          {
            url_from: 'https://source.example/post',
            root_name_source: 'source.example',
            url_to: 'https://example.com/page',
            anchor: 'Example',
            link_type: 'text',
            is_dofollow: true,
            first_seen_link: '2025-01-01T00:00:00Z',
            last_seen: null,
            is_lost: false,
            is_redirect: false,
            links_external: 12,
            domain_rating_source: 20,
            url_rating_source: 5,
            link_group_count: 3,
          },
        ],
      },
      { rows: 1, costPerRow: 14 },
    )
  })
  const client = new AhrefsClient(options)
  const links = new AhrefsLinkProvider({ client, now: options.now })
  const summary = await links.linkSummary({
    target: 'example.com',
    includeSubdomains: true,
  })
  assert.deepEqual(summary.data.backlinks, {
    state: 'observed',
    value: 400,
  })
  assert.deepEqual(summary.data.referringDomains, {
    state: 'observed',
    value: 80,
  })
  assert.equal(summary.data.brokenBacklinks.state, 'unavailable')

  const refdomains = await links.referringDomains({
    target: 'example.com',
    limit: 10,
  })
  assert.deepEqual(refdomains.data.rows[0]?.backlinks, {
    state: 'observed',
    value: 3,
  })
  assert.equal(
    refdomains.data.rows[0]?.metrics[0]?.label,
    'Ahrefs Domain Rating',
  )

  const backlinks = await links.backlinks({
    target: 'example.com',
    mode: 'representative',
    status: 'live',
    limit: 10,
  })
  assert.equal(backlinks.data.rows[0]?.linksFromPage, null)
  assert.equal(backlinks.data.rows[0]?.linksFromDomain, 3)
  assert.deepEqual(backlinks.data.rows[0]?.metrics[0], {
    provider: 'ahrefs',
    id: 'source-domain-rating',
    label: 'Ahrefs source Domain Rating',
    value: 20,
    scale: { minimum: 0, maximum: 100 },
  })
  const backlinksRequest = requests.find((request) =>
    request.pathname.endsWith('/all-backlinks'),
  )
  assert.equal(
    backlinksRequest?.searchParams.get('aggregation'),
    '1_per_domain',
  )
  assert.equal(backlinksRequest?.searchParams.get('history'), 'live')

  const rating = await new AhrefsDomainRatingProvider({
    client,
  }).domainRating({ target: 'example.com' })
  assert.deepEqual(rating.data.domainRating, {
    state: 'observed',
    value: 42.5,
  })
  assert.equal(rating.data.attribution, 'Domain Rating by Ahrefs')
  assert.equal(rating.data.attributionUrl, 'https://ahrefs.com/')
  assert.equal(rating.data.licenseUrl, 'https://ahrefs.com/terms')
  assert.equal(rating.cost.native?.actualUnits, 0)
  database.close()
})

test('Ahrefs competitor acquisition is capped at 20 calls and 2000 rows', async () => {
  const database = cacheDatabase()
  let calls = 0
  let acquiredRows = 0
  const options = clientOptions(database, async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/limits-and-usage')) {
      return new Response(JSON.stringify(limitsFixture()))
    }
    calls += 1
    const positions = Array.from({ length: 100 }, (_, index) => ({
      position: index + 1,
      type: ['organic'],
      url: `https://domain-${index}.example/page`,
    }))
    acquiredRows += positions.length
    return paidResponse(
      { positions },
      { rows: positions.length, costPerRow: 3 },
    )
  })
  const result = await new AhrefsDomainResearchProvider({
    client: new AhrefsClient(options),
  }).serpCompetitors({
    keywords: Array.from({ length: 20 }, (_, index) => `keyword ${index}`),
    market,
    includeSubdomains: false,
    resultTypes: ['organic'],
    limit: 100,
  })

  assert.equal(calls, 20)
  assert.equal(acquiredRows, 2_000)
  assert.equal(result.data.rows.length, 100)
  assert.equal(result.coverage.completeness, 'capped')
  assert.ok(JSON.stringify(result).length < 500_000)
  database.close()
})
