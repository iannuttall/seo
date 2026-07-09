import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow, QueryContentCoverage } from '../types.js'
import {
  type StrikingDistanceDependencies,
  strikingDistance,
} from './striking-distance.js'

function row(input: {
  query: string
  url?: string
  impressions?: number
  clicks?: number
  position?: number
  ctr?: number
}): GscRow {
  const impressions = input.impressions ?? 200
  const clicks = input.clicks ?? 4
  return {
    keys: [input.query, input.url ?? `https://example.com/${input.query}`],
    impressions,
    clicks,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 12,
  }
}

function coverage(input: {
  query: string
  url: string
  status?: 'verified' | 'failed'
  classification?: QueryContentCoverage['classification']
}): QueryContentCoverage {
  const emptyField = {
    phraseCount: 0,
    termCoverage: 0,
    matchedTerms: [],
    missingTerms: [input.query],
  }
  const status = input.status ?? 'verified'
  return {
    verifiedAt: '2026-07-09T12:00:00.000Z',
    query: input.query,
    url: input.url,
    status,
    error: status === 'failed' ? 'fetch failed' : undefined,
    contentGapScore: 1,
    queryTerms: [input.query],
    fields: {
      title: emptyField,
      h1: emptyField,
      metaDescription: emptyField,
      mainContent: emptyField,
    },
    classification:
      input.classification ??
      (status === 'failed' ? 'fetch-failed' : 'content-gap'),
    signals: input.classification === 'technical-check' ? ['meta-noindex'] : [],
    recommendation: 'Inspect the page evidence.',
    summary: status === 'failed' ? 'Verification failed.' : 'Evidence found.',
  }
}

function dependencies(
  rows: GscRow[],
  verify: StrikingDistanceDependencies['verifyContent'] = async (input) =>
    coverage(input),
): StrikingDistanceDependencies {
  return {
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    searchAnalytics: async () => ({
      rows,
      calls: 2,
      rowsFetched: rows.length,
    }),
    verifyContent: verify,
  }
}

test('queries bounded retained rows and publishes source semantics', async () => {
  let request:
    | Parameters<StrikingDistanceDependencies['searchAnalytics']>[1]
    | undefined
  const deps = dependencies([
    row({
      query: 'high ctr candidate',
      ctr: 0.8,
      clicks: 160,
      position: 10.5,
    }),
  ])
  deps.searchAnalytics = async (_site, body) => {
    request = body
    return {
      rows: [row({ query: 'high ctr candidate', ctr: 0.8 })],
      calls: 1,
      rowsFetched: 1,
    }
  }

  const report = await strikingDistance({ site: 'sc-domain:example.com' }, deps)

  assert.equal(request?.maxRows, 100_000)
  assert.deepEqual(request?.dimensions, ['query', 'page'])
  assert.equal(report.rangeDays, 28)
  assert.equal(report.source.completeness, 'retained-query-rows-only')
  assert.equal(report.methodology.ctrEligibilityFilter, false)
  assert.equal(report.items[0]?.query, 'high ctr candidate')
  assert.equal(report.items[0]?.priority.estimatedClickLift, false)
  assert.match(report.caveats.join(' '), /Anonymized and lower-value/)
})

test('rejects invalid date windows before querying Search Console', async () => {
  let called = false
  const deps = dependencies([])
  deps.searchAnalytics = async () => {
    called = true
    return { rows: [], calls: 0, rowsFetched: 0 }
  }

  await assert.rejects(
    strikingDistance({ site: 'sc-domain:example.com', days: 1.5 }, deps),
    /whole number between 1 and 548/,
  )
  assert.equal(called, false)
})

test('verification is bounded and technical evidence takes precedence', async () => {
  const rows = [
    row({ query: 'technical candidate', impressions: 400 }),
    row({ query: 'failed candidate', impressions: 300 }),
    row({ query: 'unverified candidate', impressions: 200 }),
  ]
  const report = await strikingDistance(
    {
      site: 'sc-domain:example.com',
      verifyLimit: 2,
    },
    dependencies(rows, async (input) =>
      input.query === 'technical candidate'
        ? coverage({ ...input, classification: 'technical-check' })
        : coverage({ ...input, status: 'failed' }),
    ),
  )

  assert.deepEqual(report.verification, {
    requested: true,
    limit: 2,
    attempted: 2,
    verified: 1,
    technical: 1,
    failed: 1,
  })
  assert.equal(report.items[0]?.recommendation.type, 'fix-technical')
  assert.equal(report.items[0]?.recommendation.confidence, 'medium')
  assert.equal(report.items[1]?.recommendation.type, 'verification-failed')
  assert.equal(report.items[2]?.contentVerification, undefined)
  assert.equal(report.items[2]?.recommendation.confidence, 'low')
})

test('does not hide Search Console provider failures', async () => {
  const deps = dependencies([])
  deps.searchAnalytics = async () => {
    throw new Error('Search Console unavailable')
  }

  await assert.rejects(
    strikingDistance({ site: 'sc-domain:example.com' }, deps),
    /Search Console unavailable/,
  )
})
