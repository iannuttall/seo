import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Ga4ReportRequest, Ga4RunReportResult } from '../ga4/client.js'
import { aiReferralSourceForValue, aiReferralsReport } from './ai-referrals.js'
import { fetchAiReferralRows } from './ai-referrals-query.js'

function sourceResult(
  rows: Array<{
    source: string
    sessions: string
    eventCount: string
  }>,
  rowCount = rows.length,
): Ga4RunReportResult {
  return {
    dimensionHeaders: [{ name: 'sessionSource' }],
    metricHeaders: [{ name: 'sessions' }, { name: 'eventCount' }],
    rows: rows.map((row) => ({
      dimensionValues: [{ value: row.source }],
      metricValues: [{ value: row.sessions }, { value: row.eventCount }],
    })),
    rowCount,
  }
}

function detailResult(
  rows: Array<{
    date: string
    source: string
    landingPage: string
    sessions: string
    eventCount: string
  }>,
  rowCount = rows.length,
): Ga4RunReportResult {
  return {
    dimensionHeaders: [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'landingPagePlusQueryString' },
    ],
    metricHeaders: [{ name: 'sessions' }, { name: 'eventCount' }],
    rows: rows.map((row) => ({
      dimensionValues: [
        { value: row.date },
        { value: row.source },
        { value: row.landingPage },
      ],
      metricValues: [{ value: row.sessions }, { value: row.eventCount }],
    })),
    rowCount,
  }
}

function usersResult(totalUsers: string): Ga4RunReportResult {
  return {
    metricHeaders: [{ name: 'totalUsers' }],
    rows: [{ metricValues: [{ value: totalUsers }] }],
    rowCount: 1,
  }
}

test('AI referral sources match exact domains and safe subdomains', () => {
  assert.equal(aiReferralSourceForValue('chatgpt.com')?.label, 'ChatGPT')
  assert.equal(
    aiReferralSourceForValue('ＣＨＡＴＧＰＴ．ＣＯＭ')?.label,
    'ChatGPT',
  )
  assert.equal(
    aiReferralSourceForValue('https://www.perplexity.ai/')?.label,
    'Perplexity',
  )
  assert.equal(aiReferralSourceForValue('news.claude.ai:443')?.label, 'Claude')
  assert.equal(aiReferralSourceForValue('chat.deepseek.com')?.label, 'DeepSeek')
  assert.equal(aiReferralSourceForValue('copilot.com')?.label, 'Copilot')
  assert.equal(aiReferralSourceForValue('openai.com'), undefined)
  assert.equal(aiReferralSourceForValue('notchatgpt.com'), undefined)
  assert.equal(aiReferralSourceForValue('claude.ai.evil.example'), undefined)
  assert.equal(
    aiReferralSourceForValue('grokking-algorithms.example'),
    undefined,
  )
  assert.equal(aiReferralSourceForValue('(direct)'), undefined)
})

test('AI referrals use source totals, exact detail filters, and unique users', async () => {
  const requests: Ga4ReportRequest[] = []
  const report = await aiReferralsReport(
    {
      property: '123',
      startDate: '2026-06-01',
      endDate: '2026-06-28',
      maxRows: 100,
    },
    {
      now: () => new Date('2026-07-01T12:00:00.000Z'),
      runGa4Report: async (_property, request) => {
        requests.push(request)
        if (requests.length === 1) {
          return sourceResult([
            { source: 'chat.openai.com', sessions: '1', eventCount: '2' },
            { source: 'chatgpt.com', sessions: '3', eventCount: '8' },
            { source: 'google', sessions: '50', eventCount: '100' },
            { source: 'perplexity.ai', sessions: '2', eventCount: '5' },
          ])
        }
        if (requests.length === 2) {
          return detailResult([
            {
              date: '20260602',
              source: 'perplexity.ai',
              landingPage: '/guide',
              sessions: '2',
              eventCount: '5',
            },
            {
              date: '20260601',
              source: 'chatgpt.com',
              landingPage: '/pricing',
              sessions: '3',
              eventCount: '8',
            },
            {
              date: '20260602',
              source: 'chat.openai.com',
              landingPage: '/guide',
              sessions: '1',
              eventCount: '2',
            },
          ])
        }
        return usersResult('5')
      },
    },
  )

  assert.equal(report.schemaVersion, 3)
  assert.equal(report.generatedAt, '2026-07-01T12:00:00.000Z')
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.sessions, 6)
  assert.equal(report.summary.eventCount, 15)
  assert.equal(report.summary.totalUsers, 5)
  assert.deepEqual(report.selection.landingPages, {
    limit: 25,
    retainedRows: 2,
    returnedRows: 2,
    omittedRows: 0,
  })
  assert.deepEqual(report.sources, [
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      source: 'ChatGPT',
      observedSessionSources: ['chat.openai.com', 'chatgpt.com'],
      sessions: 4,
      eventCount: 10,
      totalUsers: null,
      shareOfAiSessions: 2 / 3,
      share: 2 / 3,
    },
    {
      id: 'perplexity',
      label: 'Perplexity',
      source: 'Perplexity',
      observedSessionSources: ['perplexity.ai'],
      sessions: 2,
      eventCount: 5,
      totalUsers: null,
      shareOfAiSessions: 1 / 3,
      share: 1 / 3,
    },
  ])
  assert.deepEqual(report.landingPages[0], {
    landingPage: '/guide',
    sessions: 3,
    eventCount: 7,
    totalUsers: null,
    topSource: 'Perplexity',
    topSourceDetails: { id: 'perplexity', label: 'Perplexity' },
  })
  assert.deepEqual(Object.keys(report.sources[0] ?? {}).sort(), [
    'eventCount',
    'id',
    'label',
    'observedSessionSources',
    'sessions',
    'share',
    'shareOfAiSessions',
    'source',
    'totalUsers',
  ])
  assert.deepEqual(Object.keys(report.landingPages[0] ?? {}).sort(), [
    'eventCount',
    'landingPage',
    'sessions',
    'topSource',
    'topSourceDetails',
    'totalUsers',
  ])
  assert.deepEqual(Object.keys(report.daily[0] ?? {}).sort(), [
    'date',
    'eventCount',
    'sessions',
    'totalUsers',
  ])
  assert.deepEqual(
    requests[0]?.dimensions?.map((dimension) => dimension.name),
    ['sessionSource'],
  )
  assert.deepEqual(requests[0]?.dateRanges, [
    { startDate: '2026-06-01', endDate: '2026-06-28' },
  ])
  assert.ok(
    requests.every(
      (request) =>
        !request.dateRanges.some((range) => Object.hasOwn(range, 'kind')),
    ),
  )
  assert.deepEqual(
    requests[0]?.metrics.map((metric) => metric.name),
    ['sessions', 'eventCount'],
  )
  assert.deepEqual(
    requests[1]?.dimensions?.map((dimension) => dimension.name),
    ['date', 'sessionSource', 'landingPagePlusQueryString'],
  )
  assert.deepEqual(requests[1]?.dimensionFilter, {
    filter: {
      fieldName: 'sessionSource',
      inListFilter: {
        values: ['chat.openai.com', 'chatgpt.com', 'perplexity.ai'],
        caseSensitive: true,
      },
    },
  })
  assert.equal(requests[1]?.dimensionFilter, requests[2]?.dimensionFilter)
  assert.equal(requests[2]?.dimensions, undefined)
  assert.deepEqual(
    requests[2]?.metrics.map((metric) => metric.name),
    ['totalUsers'],
  )
})

test('AI referrals bound landing-page output without reducing provider evidence', async () => {
  let calls = 0
  const report = await aiReferralsReport(
    { property: '123', maxRows: 100, resultLimit: 2 },
    {
      runGa4Report: async () => {
        calls += 1
        if (calls === 1) {
          return sourceResult([
            { source: 'chatgpt.com', sessions: '9', eventCount: '9' },
          ])
        }
        if (calls === 2) {
          return detailResult([
            {
              date: '20260601',
              source: 'chatgpt.com',
              landingPage: '/first',
              sessions: '5',
              eventCount: '5',
            },
            {
              date: '20260602',
              source: 'chatgpt.com',
              landingPage: '/second',
              sessions: '3',
              eventCount: '3',
            },
            {
              date: '20260603',
              source: 'chatgpt.com',
              landingPage: '/third',
              sessions: '1',
              eventCount: '1',
            },
          ])
        }
        return usersResult('7')
      },
    },
  )

  assert.equal(calls, 3)
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.dataSource.detail.returnedRows, 3)
  assert.equal(report.summary.landingPages, 3)
  assert.deepEqual(report.selection.landingPages, {
    limit: 2,
    retainedRows: 3,
    returnedRows: 2,
    omittedRows: 1,
  })
  assert.deepEqual(
    report.landingPages.map((page) => page.landingPage),
    ['/first', '/second'],
  )
  assert.match(report.caveats.join('\n'), /1 lower-ranked pages are omitted/)
})

test('landing-page and medium text never create AI referral false positives', async () => {
  let calls = 0
  const report = await aiReferralsReport(
    { property: '123' },
    {
      runGa4Report: async () => {
        calls += 1
        return sourceResult([
          { source: 'google', sessions: '20', eventCount: '50' },
          { source: 'openai-guide', sessions: '10', eventCount: '20' },
        ])
      },
    },
  )

  assert.equal(calls, 1)
  assert.equal(report.summary.sessions, 0)
  assert.equal(report.summary.totalUsers, 0)
  assert.equal(report.dataStatus, 'complete')
  assert.match(report.summary.verdict, /No sessions attributed/)
})

test('GA4 pagination uses stable offsets and reports complete row counts', async () => {
  const offsets: Array<string | number | undefined> = []
  const result = await fetchAiReferralRows({
    property: '123',
    request: {
      dateRanges: [{ startDate: '2026-06-01', endDate: '2026-06-28' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
    },
    maxRows: 5,
    pageSize: 2,
    label: 'test query',
    query: async (_property, request) => {
      offsets.push(request.offset)
      return request.offset === 0
        ? sourceResult(
            [
              { source: 'a.example', sessions: '1', eventCount: '1' },
              { source: 'b.example', sessions: '1', eventCount: '1' },
            ],
            3,
          )
        : sourceResult(
            [{ source: 'c.example', sessions: '1', eventCount: '1' }],
            3,
          )
    },
  })

  assert.deepEqual(offsets, [0, 2])
  assert.equal(result.calls, 2)
  assert.equal(result.returnedRows, 3)
  assert.equal(result.availableRows, 3)
  assert.equal(result.truncated, false)
})

test('GA4 pagination does not double count overlapping dimension rows', async () => {
  const result = await fetchAiReferralRows({
    property: '123',
    request: {
      dateRanges: [{ startDate: '2026-06-01', endDate: '2026-06-28' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
    },
    maxRows: 4,
    pageSize: 2,
    label: 'test query',
    query: async (_property, request) =>
      request.offset === 0
        ? sourceResult(
            [
              { source: 'a.example', sessions: '1', eventCount: '1' },
              { source: 'b.example', sessions: '1', eventCount: '1' },
            ],
            4,
          )
        : sourceResult(
            [
              { source: 'b.example', sessions: '1', eventCount: '1' },
              { source: 'c.example', sessions: '1', eventCount: '1' },
            ],
            4,
          ),
  })

  assert.deepEqual(
    result.rows.map((row) => row.sessionSource),
    ['a.example', 'b.example', 'c.example'],
  )
  assert.equal(result.returnedRows, 3)
  assert.match(result.warnings.join('\n'), /overlapping pagination rows/)
})

test('truncated GA4 evidence cannot produce a definitive zero', async () => {
  const report = await aiReferralsReport(
    { property: '123', maxRows: 1 },
    {
      runGa4Report: async () => sourceResult([], 10),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.dataSource.possiblyTruncated, true)
  assert.equal(report.dataSource.sourceDiscovery.availableRows, 10)
  assert.match(report.summary.verdict, /cannot establish absence/)
})

test('sampling and a failed users query preserve counts but stay partial', async () => {
  let calls = 0
  const report = await aiReferralsReport(
    { property: '123' },
    {
      runGa4Report: async () => {
        calls += 1
        if (calls === 1) {
          return {
            ...sourceResult([
              { source: 'chatgpt.com', sessions: '2', eventCount: '4' },
            ]),
            metadata: {
              dataLossFromOtherRow: true,
              subjectToThresholding: true,
              timeZone: 'Europe/London',
              samplingMetadatas: [
                { samplesReadCount: '50', samplingSpaceSize: '100' },
              ],
            },
          }
        }
        if (calls === 2) {
          return detailResult([
            {
              date: '20260601',
              source: 'chatgpt.com',
              landingPage: '/',
              sessions: '2',
              eventCount: '4',
            },
          ])
        }
        throw new Error('users query unavailable')
      },
    },
  )

  assert.equal(report.summary.sessions, 2)
  assert.equal(report.summary.totalUsers, null)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.dataSource.totalUsers.status, 'unavailable')
  assert.equal(report.dataSource.sourceDiscovery.timeZone, 'Europe/London')
  assert.match(report.dataSource.partialReasons.join('\n'), /sampled/)
  assert.match(report.dataSource.partialReasons.join('\n'), /thresholding/)
  assert.match(report.dataSource.partialReasons.join('\n'), /\(other\)/)
  assert.match(
    report.dataSource.partialReasons.join('\n'),
    /users query unavailable/,
  )
})

test('detail aggregation differences are explicit partial evidence', async () => {
  let calls = 0
  const report = await aiReferralsReport(
    { property: '123' },
    {
      runGa4Report: async () => {
        calls += 1
        if (calls === 1) {
          return sourceResult([
            { source: 'chatgpt.com', sessions: '3', eventCount: '6' },
          ])
        }
        if (calls === 2) {
          return detailResult([
            {
              date: '20260601',
              source: 'chatgpt.com',
              landingPage: '/',
              sessions: '2',
              eventCount: '4',
            },
          ])
        }
        return usersResult('2')
      },
    },
  )

  assert.equal(report.summary.sessions, 3)
  assert.equal(report.landingPages[0]?.sessions, 2)
  assert.equal(report.dataStatus, 'partial')
  assert.match(
    report.dataSource.partialReasons.join('\n'),
    /detail totals differ/,
  )
})

test('a failed detail query preserves authoritative source totals', async () => {
  let calls = 0
  const report = await aiReferralsReport(
    { property: '123' },
    {
      runGa4Report: async () => {
        calls += 1
        if (calls === 1) {
          return sourceResult([
            { source: 'copilot.com', sessions: '3', eventCount: '6' },
          ])
        }
        if (calls === 2) throw new Error('incompatible detail dimensions')
        return usersResult('2')
      },
    },
  )

  assert.equal(report.summary.sessions, 3)
  assert.equal(report.summary.totalUsers, 2)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.dataSource.detail.status, 'unavailable')
  assert.equal(report.landingPages.length, 0)
  assert.match(
    report.dataSource.partialReasons.join('\n'),
    /incompatible detail dimensions/,
  )
})

test('invalid matched metrics fail instead of becoming zero', async () => {
  await assert.rejects(
    aiReferralsReport(
      { property: '123' },
      {
        runGa4Report: async () =>
          sourceResult([
            {
              source: 'chatgpt.com',
              sessions: 'not-a-number',
              eventCount: '4',
            },
          ]),
      },
    ),
    /invalid sessions/,
  )
})

test('AI referral inputs reject unsafe bounds and mixed date syntax', async () => {
  let calls = 0
  const runGa4Report = async (): Promise<Ga4RunReportResult> => {
    calls += 1
    return sourceResult([])
  }
  await assert.rejects(
    aiReferralsReport({ property: '123', maxRows: -1 }, { runGa4Report }),
    /whole number between 1 and 100000/,
  )
  await assert.rejects(
    aiReferralsReport(
      {
        property: '123',
        startDate: '2026-06-01',
        endDate: 'yesterday',
      },
      { runGa4Report },
    ),
    /must both be YYYY-MM-DD/,
  )
  await assert.rejects(
    aiReferralsReport(
      { property: '123', maxRows: 10, limit: 20 },
      { runGa4Report },
    ),
    /maxRows or the legacy limit/,
  )
  await assert.rejects(
    aiReferralsReport(
      { property: '123', resultLimit: 1_001 },
      { runGa4Report },
    ),
    /resultLimit must be a whole number between 1 and 1000/,
  )
  assert.equal(calls, 0)
})
