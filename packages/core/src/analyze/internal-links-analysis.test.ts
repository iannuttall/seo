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

test('normalizes exact query punctuation and checks exact matches beyond the lexical cap', () => {
  const targetRows = Array.from({ length: 51 }, (_, index) =>
    row({
      query: index === 50 ? 'Rare exact query' : `Target topic ${index}`,
      impressions: 1_000 - index,
    }),
  )
  const result = analyze(targetRows, [
    row({
      query: 'rare exact: query',
      page: 'https://example.com/source',
      impressions: 12,
    }),
  ])

  assert.equal(result.selection.targetEligibleQueries, 51)
  assert.equal(result.selection.selectedLexicalTargetQueries, 50)
  assert.equal(result.candidates[0]?.bestMatchKind, 'exact-query')
})

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

test('preserves Unicode distinctions and one-codepoint CJK terms', () => {
  const result = analyze(
    [row({ query: '東京 技術 監査' }), row({ query: 'café audit' })],
    [
      row({
        query: '東京 技術 監査 チェック',
        page: 'https://example.com/jp',
      }),
      row({
        query: 'cafe audit checklist',
        page: 'https://example.com/cafe',
      }),
    ],
  )

  assert.deepEqual(
    result.candidates.map((candidate) => candidate.sourceUrl),
    ['https://example.com/jp'],
  )
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

test('aggregates fragments but preserves trailing-slash URL identity', () => {
  const sourceRows = [
    row({
      query: 'technical crawl audit',
      page: 'https://example.com/b#first',
      impressions: 20,
      clicks: 2,
    }),
    row({
      query: 'Technical crawl audit',
      page: 'https://example.com/b#second',
      impressions: 30,
      clicks: 3,
    }),
    row({
      query: 'technical crawl audit',
      page: 'https://example.com/b/',
      impressions: 40,
      clicks: 4,
    }),
    row({
      query: 'technical crawl audit',
      page: 'https://example.com/a',
      impressions: 50,
      clicks: 5,
    }),
  ]
  const forward = analyze([row({ query: 'technical crawl audit' })], sourceRows)
  const reversed = analyze(
    [row({ query: 'technical crawl audit' })],
    [...sourceRows].reverse(),
  )

  assert.deepEqual(forward, reversed)
  assert.equal(forward.candidates[0]?.sourceUrl, 'https://example.com/a')
  assert.equal(forward.candidates[1]?.matchedQueryImpressions, 50)
  assert.equal(forward.candidates[1]?.matchedQueries, 1)
  assert.equal(forward.candidates[2]?.sourceUrl, 'https://example.com/b/')
  assert.equal(forward.candidates[2]?.matchedQueryImpressions, 40)
})

test('applies brand filtering symmetrically', () => {
  const excluded = analyzeInternalLinksFromRows({
    targetRows: [row({ query: 'Acme technical audit' })],
    sourceRows: [
      row({
        query: 'Acme technical audit',
        page: 'https://example.com/source',
      }),
    ],
    site: 'sc-domain:example.com',
    targetAliases: [targetUrl],
    minImpressions: 1,
    brandTerms: ['Acme'],
  })
  const included = analyzeInternalLinksFromRows({
    targetRows: [row({ query: 'Acme technical audit' })],
    sourceRows: [
      row({
        query: 'Acme technical audit',
        page: 'https://example.com/source',
      }),
    ],
    site: 'sc-domain:example.com',
    targetAliases: [targetUrl],
    minImpressions: 1,
    brandTerms: ['Acme'],
    includeBrand: true,
  })

  assert.equal(excluded.selection.targetBrandQueries, 1)
  assert.equal(excluded.candidates.length, 0)
  assert.equal(included.candidates.length, 1)
})
