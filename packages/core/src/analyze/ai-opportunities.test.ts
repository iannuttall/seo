import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../types.js'
import {
  classifyCommunityIntent,
  communityIntentReport,
} from './community-intent.js'
import type { QueryOpportunityDependencies } from './query-opportunity-source.js'
import { aiPromptsForQuery, seoToAiQueryReport } from './seo-to-ai-query.js'

function row(
  query: string,
  impressions = 100,
  clicks = 10,
  position = 5,
): GscRow {
  return {
    keys: [query],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position,
  }
}

function dependencies(
  rows: GscRow[],
  rowsFetched = rows.length,
): QueryOpportunityDependencies {
  return {
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    searchAnalytics: async () => ({ rows, rowsFetched, calls: 2 }),
  }
}

test('AI prompts preserve valid questions and Unicode subjects', () => {
  assert.equal(
    aiPromptsForQuery('how to choose payroll software')[0],
    'how to choose payroll software?',
  )
  assert.equal(
    aiPromptsForQuery('how to choose payroll software').some((prompt) =>
      prompt.includes('about payroll software'),
    ),
    true,
  )
  assert.equal(
    aiPromptsForQuery('São Paulo hotéis').some((prompt) =>
      prompt.includes('São Paulo hotéis'),
    ),
    true,
  )
})

test('AI prompts avoid duplicated grammar and substring intent matches', () => {
  const cost = aiPromptsForQuery('how much does payroll software cost')
  const best = aiPromptsForQuery('who is the best payroll provider')
  assert.equal(
    cost.some((prompt) => /does does|cost cost/i.test(prompt)),
    false,
  )
  assert.equal(
    cost.includes('What factors determine payroll software cost?'),
    true,
  )
  assert.equal(
    best.some((prompt) => /which who|best best/i.test(prompt)),
    false,
  )
  assert.equal(
    aiPromptsForQuery('costume ideas').some((prompt) =>
      prompt.includes('affects the price'),
    ),
    false,
  )
  assert.equal(
    aiPromptsForQuery('product previews').some((prompt) =>
      prompt.includes('pros, cons'),
    ),
    false,
  )
  for (const query of [
    'cost of payroll software',
    'software engineer salary',
    'interest rate',
  ]) {
    assert.equal(
      aiPromptsForQuery(query).some((prompt) =>
        /does .* (?:cost|salary|rate) cost/i.test(prompt),
      ),
      false,
      query,
    )
  }
})

test('AI prompts render comparison language without repeating vs', () => {
  assert.equal(
    aiPromptsForQuery('QuickBooks vs Xero').includes(
      'Compare QuickBooks and Xero, including tradeoffs and use-case fit.',
    ),
    true,
  )
})

test('AI prompts remove decision and review grammar from the subject', () => {
  const cases = [
    ['is payroll software worth it', /worth it worth considering/i],
    ['should I use payroll software', /about I use/i],
    ['hubspot reviews', /hubspot reviews worth considering/i],
  ] as const
  for (const [query, malformed] of cases) {
    assert.equal(
      aiPromptsForQuery(query).some((prompt) => malformed.test(prompt)),
      false,
      query,
    )
  }
  assert.equal(
    aiPromptsForQuery('is payroll software worth it').includes(
      'Is payroll software worth considering? Include evidence, pros, cons, and alternatives.',
    ),
    true,
  )
})

test('community intent uses narrow lexical evidence and preserves all signals', () => {
  assert.deepEqual(classifyCommunityIntent('best crm reddit'), {
    intent: 'forum/reddit',
    signals: ['forum/reddit', 'recommendation'],
    matchedTerms: ['reddit', 'best'],
    confidence: 'low',
    method: 'query-language-heuristic',
    action:
      'Retrieve the page or pages associated with this query. If relevant pages lack practical first-party detail, add evidence, examples, and limitations without imitating forum posts.',
  })
  assert.equal(
    classifyCommunityIntent('hubspot reviews and complaints')?.intent,
    'reviews',
  )
  assert.equal(
    classifyCommunityIntent('my experience with payroll software')?.intent,
    'experience',
  )
  assert.equal(
    classifyCommunityIntent('QuickBooks vs Xero')?.intent,
    'comparison',
  )
})

test('community intent rejects ambiguous real, user, top, and alternative terms', () => {
  for (const query of [
    'real estate prices',
    'real madrid fixtures',
    'linux user permissions',
    'top up mobile phone',
    'alternative medicine courses',
    'vs code extensions',
  ]) {
    assert.equal(classifyCommunityIntent(query), undefined, query)
  }
})

test('community report is deterministic and separates eligible from returned totals', async () => {
  const rows = [
    row('best zeta crm', 100, 5),
    row('best alpha crm', 100, 5),
    row('payroll definition', 200, 20),
  ]
  const report = await communityIntentReport(
    {
      site: 'sc-domain:example.com',
      limit: 1,
      includeBrand: true,
    },
    dependencies(rows),
  )
  const permuted = await communityIntentReport(
    {
      site: 'sc-domain:example.com',
      limit: 1,
      includeBrand: true,
    },
    dependencies([...rows].reverse()),
  )

  assert.equal(report.schemaVersion, 2)
  assert.equal(report.dataStatus, 'available')
  assert.equal(report.selection.classifiedRows, 2)
  assert.equal(report.selection.returnedRows, 1)
  assert.equal(report.selection.limitedRows, 1)
  assert.equal(report.summary.returnedImpressions, 100)
  assert.equal(report.items[0]?.query, 'best alpha crm')
  assert.deepEqual(report.items, permuted.items)
  assert.equal(report.methodology.pageContentVerified, false)
  assert.match(report.items[0]?.action ?? '', /^Retrieve the page or pages/)
})

test('a capped source makes a zero community result inconclusive', async () => {
  const report = await communityIntentReport(
    {
      site: 'sc-domain:example.com',
      maxRows: 1,
      includeBrand: true,
    },
    dependencies([row('payroll definition')], 1),
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.items.length, 0)
  assert.match(report.summary.verdict, /inconclusive/)
  assert.equal(report.source.completeness, 'possibly-truncated')
})

test('partial and brand-inclusive verdicts describe their actual state', async () => {
  const partial = await communityIntentReport(
    {
      site: 'sc-domain:example.com',
      maxRows: 1,
      includeBrand: true,
    },
    dependencies([row('best payroll software')], 1),
  )
  const filtered = await communityIntentReport(
    {
      site: 'sc-domain:example.com',
      minImpressions: 200,
      includeBrand: true,
    },
    dependencies([row('best example software')]),
  )

  assert.equal(partial.dataStatus, 'partial')
  assert.match(partial.summary.verdict, /^Partial evidence:/)
  assert.doesNotMatch(filtered.summary.verdict, /non-brand/)
})

test('query reports reject unavailable GSC dates before provider calls', async () => {
  let calls = 0
  const deps: QueryOpportunityDependencies = {
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    searchAnalytics: async () => {
      calls++
      return { rows: [], rowsFetched: 0, calls: 1 }
    },
  }

  await assert.rejects(
    communityIntentReport({ site: 'sc-domain:example.com', days: 548 }, deps),
    /16-month GSC retention boundary/,
  )
  await assert.rejects(
    communityIntentReport(
      {
        site: 'sc-domain:example.com',
        startDate: '2025-03-05',
        endDate: '2025-03-31',
      },
      deps,
    ),
    /2025-03-09/,
  )
  await assert.rejects(
    communityIntentReport(
      {
        site: 'sc-domain:example.com',
        startDate: '2027-01-01',
        endDate: '2027-01-28',
      },
      deps,
    ),
    /latest finalized GSC date/,
  )
  assert.equal(calls, 0)
})

test('query reports validate input and reject malformed provider rows', async () => {
  let calls = 0
  const deps: QueryOpportunityDependencies = {
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    searchAnalytics: async () => {
      calls++
      return {
        rows: [
          row('valid query'),
          { ...row('bad query'), impressions: Number.NaN },
          { ...row('duplicate query'), clicks: 1 },
          { ...row('duplicate query'), clicks: 2 },
        ],
        rowsFetched: 4,
        calls: 1,
      }
    },
  }
  await assert.rejects(
    seoToAiQueryReport({ site: 'sc-domain:example.com', days: 0 }, deps),
    /days must be a whole number/,
  )
  assert.equal(calls, 0)

  const report = await seoToAiQueryReport(
    { site: 'sc-domain:example.com', includeBrand: true },
    deps,
  )
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.selection.invalidRows, 1)
  assert.equal(report.selection.conflictingRows, 2)
  assert.deepEqual(
    report.items.map((item) => item.query),
    ['valid query'],
  )
})

test('query reports expose exact Pacific dates and retained-row provenance', async () => {
  let request: Record<string, unknown> | undefined
  const report = await seoToAiQueryReport(
    {
      site: 'sc-domain:example.com',
      startDate: '2026-06-01',
      endDate: '2026-06-28',
      maxRows: 500,
      includeBrand: true,
    },
    {
      now: () => new Date('2026-07-09T12:00:00.000Z'),
      searchAnalytics: async (_site, body) => {
        request = body as unknown as Record<string, unknown>
        return { rows: [row('payroll software')], rowsFetched: 1, calls: 1 }
      },
    },
  )

  assert.deepEqual(report.dateRange, {
    startDate: '2026-06-01',
    endDate: '2026-06-28',
  })
  assert.equal(report.rangeDays, 28)
  assert.equal(request?.maxRows, 500)
  assert.deepEqual(request?.dimensions, ['query'])
  assert.equal(report.source.completeness, 'retained-query-rows-only')
  assert.deepEqual(report.source.availableDateWindow, {
    earliestDate: '2025-03-09',
    latestFinalDate: '2026-07-05',
    basis: 'rolling-16-month-retention-with-finalization-lag',
  })
  assert.equal(report.methodology.observedAiPromptData, false)
})
