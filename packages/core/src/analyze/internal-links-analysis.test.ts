import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import { analyzeInternalLinksFromRows } from './internal-links-analysis.js'

const targetUrl = 'https://example.com/technical-audit/'

function row(input: {
  query: string
  page?: string
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
}): GscRow {
  const impressions = input.impressions ?? 100
  const clicks = input.clicks ?? 10
  return {
    keys: [input.query, input.page ?? targetUrl],
    clicks,
    impressions,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 4,
  }
}

function analyze(targetRows: GscRow[], sourceRows: GscRow[]) {
  return analyzeInternalLinksFromRows({
    targetRows,
    sourceRows,
    site: 'sc-domain:example.com',
    targetAliases: [targetUrl],
    minImpressions: 1,
    includeBrand: true,
  })
}

test('matches queries pairwise instead of combining unrelated target terms', () => {
  const result = analyze(
    [
      row({ query: 'technical crawl audit' }),
      row({ query: 'keyword research tools' }),
    ],
    [
      row({
        query: 'technical research',
        page: 'https://example.com/source',
      }),
    ],
  )

  assert.equal(result.candidates.length, 0)
  assert.equal(result.selection.sourceUnmatchedQueries, 1)
})

test('keeps lexical review matching precision-first', () => {
  const result = analyze(
    [row({ query: 'technical crawl audit' })],
    [
      row({
        query: 'technical crawl audit checklist',
        page: 'https://example.com/source',
      }),
      row({
        query: 'technical services',
        page: 'https://example.com/unrelated',
      }),
    ],
  )

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0]?.bestMatchKind, 'lexical-review')
  assert.deepEqual(result.candidates[0]?.matches[0]?.sharedTerms, [
    'audit',
    'crawl',
    'technical',
  ])
  assert.ok((result.candidates[0]?.bestRelevanceScore ?? 0) >= 0.72)
})

test('validates metrics and preserves target URL variant identity', () => {
  const invalid = [
    { ...row({ query: 'technical crawl audit' }), keys: ['missing-page'] },
    row({ query: 'technical crawl audit', page: 'ftp://example.com/source' }),
    row({ query: 'technical crawl audit', impressions: Number.NaN }),
    row({ query: 'technical crawl audit', clicks: 101 }),
    row({ query: 'technical crawl audit', ctr: 2 }),
    row({ query: 'technical crawl audit', position: 0 }),
  ]
  const result = analyze(
    [row({ query: 'technical crawl audit' })],
    [
      ...invalid,
      row({
        query: 'technical crawl audit',
        page: 'https://example.com/technical-audit#section',
      }),
      row({
        query: 'technical crawl audit',
        page: 'https://example.com/technical-audit/#section',
      }),
    ],
  )

  assert.equal(result.selection.sourceInvalidRows, invalid.length)
  assert.equal(result.selection.sourceTargetAliasRows, 1)
  assert.equal(result.candidates.length, 1)
  assert.equal(
    result.candidates[0]?.sourceUrl,
    'https://example.com/technical-audit',
  )
})
