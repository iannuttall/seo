import assert from 'node:assert/strict'
import test from 'node:test'
import type { MarketIndependentProviderEvidence } from '../providers/contracts.js'
import type {
  ExternalBacklinkPage,
  LinkSummary,
} from '../providers/link-contracts.js'
import { collectDataForSeoLinkEvidence } from './dataforseo.js'

function providerEvidence<T>(input: {
  capability: 'link-summary' | 'backlinks'
  data: T
  returnedRows: number
  retainedRows: number
  completeness: 'complete' | 'filtered' | 'capped'
  actualMicros: number
  cache?: 'hit' | 'miss'
}): MarketIndependentProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: input.capability,
    data: input.data,
    observedAt: '2026-07-22T08:00:00.000Z',
    market: null,
    coverage: {
      requestedRows: input.capability === 'link-summary' ? 1 : 100,
      returnedRows: input.returnedRows,
      retainedRows: input.retainedRows,
      invalidRows: 0,
      providerTotalRows: input.capability === 'link-summary' ? 1 : 500,
      completeness: input.completeness,
      nextCursor: input.completeness === 'capped' ? '100' : null,
    },
    cache: {
      status: input.cache ?? 'miss',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: input.actualMicros,
      actualMicros: input.actualMicros,
      taskIds: [`${input.capability}-task`],
    },
    request: {
      operation: input.capability,
      endpoint:
        input.capability === 'link-summary'
          ? 'v3/backlinks/summary/live'
          : 'v3/backlinks/backlinks/live',
      limit: input.capability === 'link-summary' ? 1 : 100,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function summary(): MarketIndependentProviderEvidence<LinkSummary> {
  return providerEvidence({
    capability: 'link-summary',
    data: {
      target: 'example.com',
      scope: 'domain',
      backlinks: { state: 'observed', value: 500 },
      referringDomains: { state: 'observed', value: 120 },
      referringPages: { state: 'observed', value: 300 },
      brokenBacklinks: { state: 'observed', value: 5 },
      brokenPages: { state: 'observed', value: 3 },
      metrics: [],
    },
    returnedRows: 1,
    retainedRows: 1,
    completeness: 'complete',
    actualMicros: 24_036,
  })
}

function backlinkPage(): MarketIndependentProviderEvidence<ExternalBacklinkPage> {
  return providerEvidence({
    capability: 'backlinks',
    data: {
      target: 'example.com',
      mode: 'representative',
      totalRows: 120,
      rows: [
        {
          sourceUrl: 'https://source.example/post',
          sourceDomain: 'source.example',
          targetUrl: 'https://example.com/page',
          anchorText: 'Useful page',
          linkType: 'anchor',
          dofollow: true,
          attributes: [],
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: null,
          state: 'live',
          indirect: false,
          linksFromPage: 1,
          linksFromDomain: 4,
          metrics: [
            {
              provider: 'dataforseo',
              id: 'source-domain-rank',
              label: 'DataForSEO source domain rank',
              value: 20,
              scale: { minimum: 0, maximum: 100 },
            },
          ],
        },
      ],
    },
    returnedRows: 1,
    retainedRows: 1,
    completeness: 'filtered',
    actualMicros: 27_600,
  })
}

test('DataForSEO link collection uses one bounded representative request and preserves provider evidence', async () => {
  const calls: string[] = []
  const result = await collectDataForSeoLinkEvidence({
    target: 'www.example.com',
    provider: {
      linkSummary: async (input) => {
        calls.push(`summary:${input.target}`)
        return summary()
      },
      backlinks: async (input) => {
        calls.push(
          `backlinks:${input.target}:${input.mode}:${input.status}:${input.limit}`,
        )
        return backlinkPage()
      },
    },
  })

  assert.deepEqual(calls, [
    'summary:www.example.com',
    'backlinks:example.com:representative:live:100',
  ])
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.nofollow, false)
  assert.equal(result.rows[0]?.providerMetrics?.[0]?.value, 20)
  assert.equal(result.provenance.completeness, 'partial')
  assert.equal(result.provenance.capped, false)
  assert.deepEqual(result.provenance.providerRequests?.methods, [
    'v3/backlinks/summary/live',
    'v3/backlinks/backlinks/live',
  ])
  assert.equal(result.externalProvider?.summary.cost.actualMicros, 24_036)
  assert.equal(result.externalProvider?.backlinks.cost.actualMicros, 27_600)
  assert.match(result.warnings[0] ?? '', /one representative backlink/i)
})

test('DataForSEO link collection only reports a cache hit when both paid calls hit cache', async () => {
  const cachedSummary = summary()
  cachedSummary.cache.status = 'hit'
  cachedSummary.cost.actualMicros = 0
  const result = await collectDataForSeoLinkEvidence({
    target: 'example.com',
    provider: {
      linkSummary: async () => cachedSummary,
      backlinks: async () => backlinkPage(),
    },
  })

  assert.equal(result.provenance.cached, false)
})

test('DataForSEO link collection rejects excessive provider acquisition before making a call', async () => {
  let calls = 0
  await assert.rejects(
    collectDataForSeoLinkEvidence({
      target: 'example.com',
      rowLimit: 501,
      provider: {
        linkSummary: async () => {
          calls += 1
          return summary()
        },
        backlinks: async () => {
          calls += 1
          return backlinkPage()
        },
      },
    }),
    /between 1 and 500/,
  )
  assert.equal(calls, 0)
})
