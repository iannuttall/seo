import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  SearchConsoleExportEvidence,
  SearchConsoleExportReconciliation,
  TopFix,
} from '@seo/core'
import {
  exportPageInventory,
  searchConsoleExportSection,
  technicalCrawlActions,
  topicOverlapCandidates,
} from './url-report-evidence.js'

function fix(overrides: Partial<TopFix>): TopFix {
  return {
    ruleId: 'canonical_missing',
    title: 'Missing canonical',
    category: 'canonical',
    severity: 'low',
    count: 1,
    sampleUrls: ['https://example.com/pricing'],
    recommendation: 'fix',
    score: 100,
    scoreFactors: {
      severity: 100,
      affectedUrls: 1,
      searchVisibleUrls: 0,
      clicks: 0,
      impressions: 0,
      sessions: 0,
      effort: 'low',
      effortScore: 10,
    },
    whyThisRanks: 'test',
    howToFix: 'Add a canonical.',
    howToVerify: 'Re-crawl the page.',
    ...overrides,
  } as TopFix
}

function evidence(): SearchConsoleExportEvidence {
  return {
    source: 'search-console-export',
    exportedAt: null,
    importedAt: '2026-08-11T00:00:00.000Z',
    files: [],
    queries: {
      rows: [{ query: 'a', clicks: 2, impressions: 10, ctr: 0.2, position: 4 }],
      totalRows: 1,
      capped: false,
    },
    pages: {
      rows: [
        {
          url: 'https://example.com/blog/older-article',
          clicks: 1,
          impressions: 2400,
          ctr: null,
          position: 42,
        },
      ],
      totalRows: 1,
      capped: false,
    },
    warnings: [],
    caveats: ['caveat'],
  }
}

function reconciliation(
  overrides: Partial<SearchConsoleExportReconciliation> = {},
): SearchConsoleExportReconciliation {
  return {
    joinBasis: 'path',
    crawlOrigin: 'http://127.0.0.1:8080',
    exportOrigins: ['https://example.com'],
    originMismatch: true,
    matchedPages: 0,
    unreachedPages: evidence().pages.rows,
    unreachedCount: 1,
    capped: false,
    ...overrides,
  }
}

test('technicalCrawlActions orders fixes by severity then score and appends review items', () => {
  const actions = technicalCrawlActions({
    crawlReportId: 'crawl-report-1',
    topFixes: [
      fix({ ruleId: 'missing_meta_description', severity: 'low', score: 900 }),
      fix({ ruleId: 'server_error', severity: 'high', score: 100 }),
    ],
    reviewObservations: [
      fix({ ruleId: 'noindex', severity: 'low', recommendation: 'review' }),
    ],
  })
  assert.equal(actions.length, 3)
  assert.match(actions[0]?.title ?? '', /^server_error/)
  assert.match(actions[1]?.title ?? '', /^missing_meta_description/)
  assert.match(actions[2]?.title ?? '', /^noindex/)
  assert.equal(actions[0]?.confidence, 'high')
  assert.equal(actions[2]?.confidence, 'medium')
  assert.match(actions[2]?.action ?? '', /intent confirmation/)
  assert.deepEqual(actions[0]?.affectedUrlsReport, {
    id: 'affected-urls',
    params: { reportId: 'crawl-report-1', ruleId: 'server_error' },
  })
})

function queryRow(overrides: {
  query: string
  clicks?: number
  impressions?: number
}) {
  return {
    query: overrides.query,
    clicks: overrides.clicks ?? 0,
    impressions: overrides.impressions ?? 0,
    ctr: null,
    position: null,
  }
}

test('topicOverlapCandidates reports capping instead of dropping silently', () => {
  const result = topicOverlapCandidates({
    queries: [
      queryRow({ query: 'project management tips', impressions: 100 }),
      queryRow({ query: 'weekly status report', impressions: 90 }),
    ],
    pages: [
      { url: 'https://example.com/a', title: 'Project management tips A' },
      { url: 'https://example.com/b', title: 'Project management tips B' },
      { url: 'https://example.com/c', title: 'Weekly status report C' },
      { url: 'https://example.com/d', title: 'Weekly status report D' },
    ],
    maxCandidates: 1,
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.capped, true)
  assert.equal(result.queryLimitReached, false)
  assert.equal(result.candidateLimitReached, true)
  assert.equal(result.candidates[0]?.query, 'project management tips')
})

function pageRow(overrides: {
  url: string
  clicks?: number
  impressions?: number
  position?: number | null
}) {
  return {
    url: overrides.url,
    clicks: overrides.clicks ?? 0,
    impressions: overrides.impressions ?? 0,
    ctr: null,
    position: overrides.position ?? null,
  }
}

test('exportPageInventory stays partial when the source import was capped', () => {
  const result = exportPageInventory({
    pages: [pageRow({ url: 'https://example.com/a', impressions: 20 })],
    crawledPages: [],
    sourceCapped: true,
  })

  assert.equal(result.capped, true)
  assert.equal(result.sourceCapped, true)
  assert.match(result.note, /source import was capped/)
})

test('exportPageInventory returns byte-identical JSON on repeat', () => {
  const input = {
    pages: [
      pageRow({ url: 'https://example.com/b', impressions: 40, clicks: 1 }),
      pageRow({ url: 'https://example.com/a', impressions: 40, clicks: 1 }),
    ],
    reconciliation: reconciliation({ unreachedPages: [], unreachedCount: 0 }),
    crawledPages: [
      { url: 'http://127.0.0.1:8080/a', title: 'A' },
      { url: 'http://127.0.0.1:8080/b', title: 'B' },
    ],
  }
  assert.equal(
    JSON.stringify(exportPageInventory(input)),
    JSON.stringify(exportPageInventory(input)),
  )
  assert.deepEqual(
    exportPageInventory(input).rows.map((row) => row.path),
    ['/a', '/b'],
    'equal impressions and clicks fall back to url codepoint order',
  )
})

test('searchConsoleExportSection bounds rows and keeps provenance and caveats', () => {
  const section = searchConsoleExportSection({
    evidence: evidence(),
    reconciliation: reconciliation(),
    topRows: 1,
  })
  assert.equal(section.queries.rows.length, 1)
  assert.equal(section.pages.topRowsShown, 1)
  assert.deepEqual(section.caveats, ['caveat'])
  assert.equal(section.reconciliation?.joinBasis, 'path')
})
