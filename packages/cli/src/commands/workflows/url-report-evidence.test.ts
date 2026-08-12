import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  SearchConsoleExportEvidence,
  SearchConsoleExportReconciliation,
  TopFix,
} from '@seo/core'
import {
  EXPORT_PAGE_INVENTORY_NOTE,
  exportPageInventory,
  exportSummarySentence,
  issueCountSummarySentence,
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

test('technicalCrawlActions ranks unreached-audit groups in the same queue by severity then count', () => {
  const actions = technicalCrawlActions({
    topFixes: [fix({ ruleId: 'canonical_missing', severity: 'low', count: 1 })],
    reviewObservations: [],
    unreachedAudit: {
      reportId: 'unreached-report-1',
      topFixes: [
        fix({
          ruleId: 'missing_meta_description',
          severity: 'medium',
          count: 12,
        }),
      ],
      reviewObservations: [],
      titlePrefix: 'unreached pages:',
    },
  })
  assert.equal(actions.length, 2)
  assert.match(
    actions[0]?.title ?? '',
    /^unreached pages: missing_meta_description/,
    'a medium issue on 12 pages outranks a low issue on 1 page',
  )
  assert.match(actions[1]?.title ?? '', /^canonical_missing/)
  assert.deepEqual(actions[0]?.affectedUrlsReport, {
    id: 'affected-urls',
    params: {
      reportId: 'unreached-report-1',
      ruleId: 'missing_meta_description',
    },
  })
})

test('technicalCrawlActions adds an unreached-pages action when the export join found gaps', () => {
  const actions = technicalCrawlActions({
    topFixes: [],
    reviewObservations: [],
    reconciliation: reconciliation(),
  })
  assert.equal(actions.length, 1)
  assert.match(actions[0]?.title ?? '', /not reached by this crawl/)
  assert.match(actions[0]?.action ?? '', /not proof of orphan status/)
})

test('technicalCrawlActions is deterministic for identical input', () => {
  const input = {
    topFixes: [
      fix({ ruleId: 'canonical_multiple', severity: 'medium', score: 50 }),
      fix({ ruleId: 'canonical_missing', severity: 'medium', score: 50 }),
    ],
    reviewObservations: [],
  }
  assert.deepEqual(
    JSON.stringify(technicalCrawlActions(input)),
    JSON.stringify(technicalCrawlActions(input)),
  )
  assert.match(
    technicalCrawlActions(input)[0]?.title ?? '',
    /^canonical_missing/,
    'equal severity and score fall back to rule id order',
  )
})

test('exportSummarySentence reports unreached counts and the all-reached case', () => {
  const base = { evidence: evidence() }
  assert.match(exportSummarySentence(base), /1 query row, 1 page row/)
  assert.match(
    exportSummarySentence({ ...base, reconciliation: reconciliation() }),
    /1 exported page URL with impressions were not reached/,
  )
  assert.match(
    exportSummarySentence({
      ...base,
      reconciliation: reconciliation({ unreachedCount: 0, unreachedPages: [] }),
    }),
    /Every exported page URL was reached/,
  )
})

test('issueCountSummarySentence leads with issue counts', () => {
  assert.equal(
    issueCountSummarySentence({
      highIssues: 2,
      mediumIssues: 5,
      lowIssues: 4,
      crawledUrls: 5,
    }),
    'Found 2 high, 5 medium, and 4 low technical issues across 5 crawled pages.',
  )
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

test('topicOverlapCandidates finds a query phrase shared by two page titles', () => {
  const result = topicOverlapCandidates({
    queries: [
      queryRow({
        query: 'project management tips',
        clicks: 4,
        impressions: 120,
      }),
    ],
    pages: [
      {
        url: 'https://example.com/blog/pm-basics',
        title: '12 Project Management Tips for Small Teams',
      },
      {
        url: 'https://example.com/guides/pm',
        title: 'Project   management tips: the complete guide',
      },
      {
        url: 'https://example.com/pricing',
        title: 'Pricing',
      },
    ],
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.eligibleQueries, 1)
  assert.equal(result.consideredQueries, 1)
  assert.equal(result.queryLimitReached, false)
  assert.equal(result.candidateLimitReached, false)
  assert.equal(result.capped, false)
  assert.equal(result.candidates[0]?.query, 'project management tips')
  assert.equal(result.candidates[0]?.impressions, 120)
  assert.equal(result.candidates[0]?.clicks, 4)
  assert.deepEqual(
    result.candidates[0]?.pages.map((page) => page.url),
    ['https://example.com/blog/pm-basics', 'https://example.com/guides/pm'],
  )
})

test('topicOverlapCandidates skips single-word queries', () => {
  const result = topicOverlapCandidates({
    queries: [queryRow({ query: 'tips', impressions: 900 })],
    pages: [
      { url: 'https://example.com/a', title: 'Tips for planning' },
      { url: 'https://example.com/b', title: 'More tips here' },
    ],
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(result.consideredQueries, 0)
  assert.equal(result.capped, false)
})

test('topicOverlapCandidates matches whole phrase tokens, not word fragments', () => {
  const result = topicOverlapCandidates({
    queries: [queryRow({ query: 'seo art', impressions: 100 })],
    pages: [
      { url: 'https://example.com/article', title: 'The SEO article' },
      { url: 'https://example.com/art', title: 'SEO art guide' },
    ],
  })

  assert.deepEqual(result.candidates, [])
})

test('topicOverlapCandidates needs two distinct page paths', () => {
  const result = topicOverlapCandidates({
    queries: [queryRow({ query: 'invoice templates free', impressions: 50 })],
    pages: [
      {
        url: 'https://example.com/invoices',
        title: 'Invoice templates free to download',
      },
      { url: 'https://example.com/about', title: 'About us' },
    ],
  })
  assert.equal(result.candidates.length, 0)
})

test('topicOverlapCandidates counts trailing-slash variants as one page', () => {
  const result = topicOverlapCandidates({
    queries: [queryRow({ query: 'meeting agenda template', impressions: 80 })],
    pages: [
      {
        url: 'https://example.com/agenda',
        title: 'Meeting agenda template',
      },
      {
        url: 'https://example.com/agenda/',
        title: 'Meeting agenda template',
      },
    ],
  })
  assert.equal(result.candidates.length, 0)
})

test('topicOverlapCandidates ignores pages without titles', () => {
  const result = topicOverlapCandidates({
    queries: [queryRow({ query: 'team retro ideas', impressions: 10 })],
    pages: [
      { url: 'https://example.com/a', title: null },
      { url: 'https://example.com/b', title: undefined },
      { url: 'https://example.com/c', title: 'Team retro ideas' },
    ],
  })
  assert.equal(result.candidates.length, 0)
})

test('topicOverlapCandidates is deterministic for identical input', () => {
  const input = {
    queries: [
      queryRow({
        query: 'project management tips',
        clicks: 2,
        impressions: 40,
      }),
      queryRow({ query: 'weekly status report', clicks: 2, impressions: 40 }),
    ],
    pages: [
      { url: 'https://example.com/b', title: 'Project management tips B' },
      { url: 'https://example.com/a', title: 'Project management tips A' },
      { url: 'https://example.com/d', title: 'Weekly status report D' },
      { url: 'https://example.com/c', title: 'Weekly status report C' },
    ],
  }
  const first = JSON.stringify(topicOverlapCandidates(input))
  const second = JSON.stringify(topicOverlapCandidates(input))
  assert.equal(first, second)
  const result = topicOverlapCandidates(input)
  assert.equal(
    result.candidates[0]?.query,
    'project management tips',
    'equal impressions and clicks fall back to query codepoint order',
  )
  assert.deepEqual(
    result.candidates[0]?.pages.map((page) => page.url),
    ['https://example.com/a', 'https://example.com/b'],
  )
})

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

test('topicOverlapCandidates bounds considered queries by impressions then clicks', () => {
  const result = topicOverlapCandidates({
    queries: [
      queryRow({ query: 'low volume phrase', impressions: 1 }),
      queryRow({ query: 'project management tips', impressions: 100 }),
    ],
    pages: [
      { url: 'https://example.com/a', title: 'Low volume phrase A' },
      { url: 'https://example.com/b', title: 'Low volume phrase B' },
    ],
    maxQueries: 1,
  })
  assert.equal(result.consideredQueries, 1)
  assert.equal(result.eligibleQueries, 2)
  assert.equal(result.queryLimitReached, true)
  assert.equal(result.candidateLimitReached, false)
  assert.equal(result.capped, true)
  assert.equal(
    result.candidates.length,
    0,
    'only the top query by impressions was considered and it did not match',
  )
})

test('technicalCrawlActions appends one labelled topic-overlap action', () => {
  const actions = technicalCrawlActions({
    topFixes: [],
    reviewObservations: [],
    topicOverlap: {
      candidates: [
        {
          query: 'project management tips',
          impressions: 120,
          clicks: 4,
          pages: [
            {
              url: 'https://example.com/blog/pm-basics',
              title: '12 Project Management Tips for Small Teams',
            },
            {
              url: 'https://example.com/guides/pm',
              title: 'Project management tips: the complete guide',
            },
          ],
        },
      ],
      eligibleQueries: 1,
      consideredQueries: 1,
      queryLimitReached: false,
      candidateLimitReached: false,
      capped: false,
    },
  })
  assert.equal(actions.length, 1)
  assert.equal(
    actions[0]?.title,
    'topic overlap candidates: 1 exported query appears in 2+ page titles',
  )
  assert.equal(actions[0]?.confidence, 'medium')
  assert.match(actions[0]?.action ?? '', /"project management tips"/)
  assert.match(actions[0]?.action ?? '', /\/blog\/pm-basics and \/guides\/pm/)
  assert.match(actions[0]?.action ?? '', /title-based heuristic/)
  assert.match(actions[0]?.action ?? '', /no query-to-page mapping/)
  assert.match(actions[0]?.action ?? '', /seo cannibal/)
})

test('technicalCrawlActions adds no topic-overlap action without candidates', () => {
  const actions = technicalCrawlActions({
    topFixes: [],
    reviewObservations: [],
    topicOverlap: {
      candidates: [],
      eligibleQueries: 3,
      consideredQueries: 3,
      queryLimitReached: false,
      candidateLimitReached: false,
      capped: false,
    },
  })
  assert.equal(actions.length, 0)
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

test('exportPageInventory fires each tier rule on its own row', () => {
  const pages = [
    pageRow({ url: 'https://example.com/guides/pm', impressions: 500 }),
    pageRow({
      url: 'https://example.com/pricing',
      clicks: 3,
      impressions: 400,
      position: 8,
    }),
    pageRow({
      url: 'https://example.com/blog/older-article',
      impressions: 300,
      position: 12,
    }),
    pageRow({
      url: 'https://example.com/blog/weak-article',
      impressions: 200,
      position: 42,
    }),
    pageRow({ url: 'https://example.com/blog/quiet-article', position: 3 }),
  ]
  const result = exportPageInventory({
    pages,
    reconciliation: reconciliation({
      unreachedPages: [
        pageRow({
          url: 'https://example.com/blog/older-article',
          impressions: 300,
          position: 12,
        }),
      ],
      unreachedCount: 1,
    }),
    crawledPages: [
      {
        url: 'http://127.0.0.1:8080/guides/pm',
        title: 'Project management tips guide',
      },
      { url: 'http://127.0.0.1:8080/pricing', title: 'Pricing' },
      { url: 'http://127.0.0.1:8080/blog/weak-article', title: 'Weak article' },
      { url: 'http://127.0.0.1:8080/blog/quiet-article', title: null },
    ],
    overlap: {
      candidates: [
        {
          query: 'project management tips',
          impressions: 120,
          clicks: 4,
          pages: [
            {
              url: 'http://127.0.0.1:8080/guides/pm',
              title: 'Project management tips guide',
            },
            {
              url: 'http://127.0.0.1:8080/blog/pm-basics',
              title: 'Project management tips basics',
            },
          ],
        },
      ],
      eligibleQueries: 1,
      consideredQueries: 1,
      queryLimitReached: false,
      candidateLimitReached: false,
      capped: false,
    },
  })
  assert.equal(result.totalPages, 5)
  assert.equal(result.capped, false)
  assert.equal(result.criteria.length, 5)
  assert.deepEqual(
    result.rows.map((row) => [row.path, row.suggestedDisposition, row.tier]),
    [
      [
        '/guides/pm',
        'review',
        'shares a search phrase with another page title and needs query-to-page and intent verification',
      ],
      ['/pricing', 'keep', 'has clicks in the export window'],
      [
        '/blog/older-article',
        'review',
        'has impressions but no crawl path reached it',
      ],
      [
        '/blog/weak-article',
        'update',
        'has impressions with a weak average position',
      ],
      [
        '/blog/quiet-article',
        'review',
        'low observed demand in the export window',
      ],
    ],
  )
  assert.equal(result.rows[0]?.overlapQuery, 'project management tips')
  assert.equal(result.rows[1]?.overlapQuery, null)
  assert.equal(result.rows[2]?.reachedByCrawl, false)
  assert.equal(result.rows[3]?.reachedByCrawl, true)
})

test('exportPageInventory joins titles and reach across differing origins', () => {
  const result = exportPageInventory({
    pages: [
      pageRow({ url: 'https://example.com/agenda/', impressions: 90 }),
      pageRow({ url: 'https://example.com/never-fetched', impressions: 50 }),
    ],
    reconciliation: reconciliation({
      unreachedPages: [pageRow({ url: 'https://example.com/never-fetched' })],
      unreachedCount: 1,
    }),
    crawledPages: [
      { url: 'http://127.0.0.1:8080/agenda', title: 'Meeting agenda template' },
    ],
  })
  assert.equal(result.rows[0]?.title, 'Meeting agenda template')
  assert.equal(result.rows[0]?.reachedByCrawl, true)
  assert.equal(result.rows[1]?.title, null)
  assert.equal(result.rows[1]?.reachedByCrawl, false)
})

test('exportPageInventory keeps title overlap in review even when the page has clicks', () => {
  const result = exportPageInventory({
    pages: [
      pageRow({
        url: 'https://example.com/guides/pm',
        clicks: 9,
        impressions: 100,
      }),
    ],
    reconciliation: reconciliation({ unreachedPages: [], unreachedCount: 0 }),
    crawledPages: [
      {
        url: 'http://127.0.0.1:8080/guides/pm',
        title: 'Project management tips guide',
      },
    ],
    overlap: {
      candidates: [
        {
          query: 'project management tips',
          impressions: 100,
          clicks: 9,
          pages: [
            {
              url: 'http://127.0.0.1:8080/guides/pm',
              title: 'Project management tips guide',
            },
            {
              url: 'http://127.0.0.1:8080/blog/pm-basics',
              title: 'Project management tips basics',
            },
          ],
        },
      ],
      eligibleQueries: 1,
      consideredQueries: 1,
      queryLimitReached: false,
      candidateLimitReached: false,
      capped: false,
    },
  })
  assert.equal(result.rows[0]?.suggestedDisposition, 'review')
  assert.equal(result.rows[0]?.overlapQuery, 'project management tips')
})

test('exportPageInventory caps rows by impressions, clicks, then url order', () => {
  const result = exportPageInventory({
    pages: [
      pageRow({ url: 'https://example.com/c', impressions: 10 }),
      pageRow({ url: 'https://example.com/a', impressions: 20 }),
      pageRow({ url: 'https://example.com/b', impressions: 20 }),
    ],
    crawledPages: [],
    maxRows: 2,
  })
  assert.equal(result.totalPages, 3)
  assert.equal(result.capped, true)
  assert.deepEqual(
    result.rows.map((row) => row.path),
    ['/a', '/b'],
  )
  assert.equal(result.rows[0]?.reachedByCrawl, null)
  assert.equal(result.rows[1]?.reachedByCrawl, null)
  assert.equal(result.page, 1)
  assert.equal(result.pageCount, 2)
  assert.equal(result.nextPage, 2)
})

test('exportPageInventory returns a requested page without losing total counts', () => {
  const result = exportPageInventory({
    pages: [
      pageRow({ url: 'https://example.com/c', impressions: 10 }),
      pageRow({ url: 'https://example.com/a', impressions: 30 }),
      pageRow({ url: 'https://example.com/b', impressions: 20 }),
    ],
    crawledPages: [],
    maxRows: 2,
    page: 2,
  })

  assert.equal(result.totalPages, 3)
  assert.equal(result.page, 2)
  assert.equal(result.pageCount, 2)
  assert.equal(result.nextPage, null)
  assert.deepEqual(
    result.rows.map((row) => row.path),
    ['/c'],
  )
  assert.match(result.note, /Fetch every page/)
})

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

test('exportPageInventory keeps reach unknown beyond a capped reconciliation', () => {
  const result = exportPageInventory({
    pages: [
      pageRow({ url: 'https://example.com/known-unreached', impressions: 20 }),
      pageRow({ url: 'https://example.com/not-retained', impressions: 10 }),
    ],
    reconciliation: reconciliation({
      unreachedPages: [pageRow({ url: 'https://example.com/known-unreached' })],
      unreachedCount: 2,
      capped: true,
    }),
    crawledPages: [],
  })

  assert.equal(result.rows[0]?.reachedByCrawl, false)
  assert.equal(result.rows[1]?.reachedByCrawl, null)
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

test('technicalCrawlActions places one suggested-disposition inventory action after the overlap action', () => {
  const overlap = {
    candidates: [
      {
        query: 'project management tips',
        impressions: 120,
        clicks: 4,
        pages: [
          {
            url: 'https://example.com/blog/pm-basics',
            title: 'Project management tips basics',
          },
          {
            url: 'https://example.com/guides/pm',
            title: 'Project management tips guide',
          },
        ],
      },
    ],
    eligibleQueries: 1,
    consideredQueries: 1,
    queryLimitReached: false,
    candidateLimitReached: false,
    capped: false,
  }
  const inventory = exportPageInventory({
    pages: [
      pageRow({
        url: 'https://example.com/guides/pm',
        impressions: 2400,
        position: 42,
      }),
      pageRow({
        url: 'https://example.com/pricing',
        clicks: 5,
        impressions: 100,
      }),
      pageRow({ url: 'https://example.com/quiet' }),
    ],
    reconciliation: reconciliation({ unreachedPages: [], unreachedCount: 0 }),
    crawledPages: [
      {
        url: 'https://example.com/guides/pm',
        title: 'Project management tips guide',
      },
    ],
    overlap,
  })
  const actions = technicalCrawlActions({
    topFixes: [],
    reviewObservations: [],
    topicOverlap: overlap,
    pageInventory: inventory,
  })
  assert.equal(actions.length, 2)
  assert.match(actions[0]?.title ?? '', /^topic overlap candidates/)
  assert.equal(
    actions[1]?.title,
    'content inventory: 3 exported pages tiered with suggested dispositions',
  )
  assert.equal(actions[1]?.confidence, 'medium')
  assert.match(actions[1]?.action ?? '', /keep 1, update 0, review 2/)
  assert.match(
    actions[1]?.action ?? '',
    /\/guides\/pm \(0 clicks, 2400 impressions, position 42\)/,
  )
  assert.match(
    actions[1]?.action ?? '',
    /Suggested dispositions are heuristic tiers/,
  )
  assert.match(actions[1]?.action ?? '', /Decide each page with the owner\./)
  assert.match(
    actions[1]?.action ?? '',
    /page by page instead of applying one blanket policy/,
  )
})

test('technicalCrawlActions adds no inventory action for an empty inventory', () => {
  const actions = technicalCrawlActions({
    topFixes: [],
    reviewObservations: [],
    pageInventory: {
      rows: [],
      totalPages: 0,
      capped: false,
      sourceCapped: false,
      page: 1,
      pageSize: 50,
      pageCount: 0,
      nextPage: null,
      criteria: [],
      note: EXPORT_PAGE_INVENTORY_NOTE,
    },
  })
  assert.equal(actions.length, 0)
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

test('searchConsoleExportSection attaches the suggested-disposition note to the inventory', () => {
  const inventory = exportPageInventory({
    pages: [pageRow({ url: 'https://example.com/pricing', clicks: 2 })],
    reconciliation: reconciliation({ unreachedPages: [], unreachedCount: 0 }),
    crawledPages: [],
  })
  const section = searchConsoleExportSection({
    evidence: evidence(),
    pageInventory: inventory,
  })
  assert.equal(section.pageInventory?.rows.length, 1)
  assert.match(section.pageInventory?.note ?? '', /^Suggested dispositions/)
  assert.match(
    section.pageInventory?.note ?? '',
    /Decide each page with the owner\./,
  )
})
