import assert from 'node:assert/strict'
import test from 'node:test'
import type { SerpResultsReport } from '../serp-results.js'
import { buildLocalSerpInsights } from './serp-insights.js'

function report(input: {
  query: string
  organic: Array<{ domain: string; rank: number; url?: string }>
  listings?: Array<{
    title: string
    cid?: string
    rank: number
    rating?: number
  }>
}): SerpResultsReport {
  return {
    evidence: {
      data: {
        keyword: input.query,
        effectiveKeyword: input.query,
        checkedAt: '2026-07-22T12:00:00.000Z',
        organicResults: input.organic.map((item, index) => ({
          rankGroup: index + 1,
          rankAbsolute: item.rank,
          page: 1,
          domain: item.domain,
          url: item.url ?? `https://${item.domain}/${index}`,
          title: null,
          description: null,
          isFeaturedSnippet: false,
        })),
        localPack: {
          present: Boolean(input.listings?.length),
          returnedRows: input.listings?.length ?? 0,
          retainedRows: input.listings?.length ?? 0,
          invalidRows: 0,
          results: (input.listings ?? []).map((item, index) => ({
            rankGroup: index + 1,
            rankAbsolute: item.rank,
            page: 1,
            title: item.title,
            domain: null,
            url: null,
            cid: item.cid ?? null,
            phone: null,
            description: null,
            isPaid: false,
            rating:
              item.rating === undefined
                ? null
                : {
                    type: 'Max5',
                    value: item.rating,
                    votesCount: 20,
                    maximum: 5,
                  },
          })),
        },
      },
    },
  } as SerpResultsReport
}

test('aggregates repeated local competitors and listings without classifying them', () => {
  const insights = buildLocalSerpInsights({
    site: 'sc-domain:example.test',
    reports: [
      report({
        query: 'plumber london',
        organic: [
          { domain: 'www.example.test', rank: 2 },
          { domain: 'directory.test', rank: 3 },
          { domain: 'business.test', rank: 7 },
        ],
        listings: [{ title: 'Local business', cid: '123', rank: 1, rating: 5 }],
      }),
      report({
        query: 'emergency plumber london',
        organic: [
          { domain: 'DIRECTORY.TEST', rank: 1 },
          { domain: 'other.test', rank: 4 },
        ],
        listings: [
          { title: 'Local business renamed', cid: '123', rank: 2, rating: 4.8 },
        ],
      }),
    ],
  })

  assert.equal(insights.organicCompetitors.available, 3)
  assert.deepEqual(insights.organicCompetitors.items[0], {
    domain: 'directory.test',
    relationship: 'search-competitor',
    siteType: 'unknown',
    classificationSource: 'unclassified',
    appearances: 2,
    matchedQueries: 2,
    queryCoverage: 1,
    bestAbsoluteRank: 1,
    sampleQueries: ['emergency plumber london', 'plumber london'],
    sampleUrls: ['https://DIRECTORY.TEST/0', 'https://directory.test/1'],
    evidenceRefs: [
      'serpEvidence.reports[0].evidence.data.organicResults[1]',
      'serpEvidence.reports[1].evidence.data.organicResults[0]',
    ],
  })
  assert.equal(insights.localPackListings.available, 1)
  assert.equal(insights.localPackListings.items[0]?.identifier.value, '123')
  assert.equal(insights.localPackListings.items[0]?.matchedQueries, 2)
  assert.equal(
    insights.localPackListings.items[0]?.ratingObservations.length,
    2,
  )
  assert.equal(insights.queryObservations[0]?.selfBestAbsoluteRank, 2)
})

test('bounds result lists and remains deterministic across report order', () => {
  const reports = [
    report({
      query: 'query b',
      organic: [{ domain: 'b.test', rank: 2 }],
      listings: [{ title: 'B', rank: 3 }],
    }),
    report({
      query: 'query a',
      organic: [{ domain: 'a.test', rank: 2 }],
      listings: [{ title: 'A', rank: 3 }],
    }),
  ]
  const first = buildLocalSerpInsights({
    site: 'example.test',
    reports,
    competitorLimit: 1,
    listingLimit: 1,
  })
  const reversed = buildLocalSerpInsights({
    site: 'example.test',
    reports: [...reports].reverse(),
    competitorLimit: 1,
    listingLimit: 1,
  })

  assert.equal(first.organicCompetitors.returned, 1)
  assert.equal(first.organicCompetitors.omitted, 1)
  assert.equal(first.localPackListings.returned, 1)
  assert.deepEqual(
    first.organicCompetitors.items.map(({ evidenceRefs: _, ...item }) => item),
    reversed.organicCompetitors.items.map(
      ({ evidenceRefs: _, ...item }) => item,
    ),
  )
  assert.deepEqual(
    first.localPackListings.items.map(({ evidenceRefs: _, ...item }) => item),
    reversed.localPackListings.items.map(
      ({ evidenceRefs: _, ...item }) => item,
    ),
  )
})
