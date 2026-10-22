import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bingCall } from '../bing/api.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { runReport } from './report.js'
import { mcpCall } from './tools.js'
import type { CommandDeps } from './types.js'

// Bing Webmaster payloads in Bing's own shape: "/Date(ms)/" dates, a "d"
// wrapper, weekly query rows, -1 for an unknown position and a broken row.
const ms = (date: string) => `/Date(${Date.parse(`${date}T00:00:00Z`)})/`

const BING: Record<string, unknown> = {
  GetUserSites: [
    { Url: 'https://example.com/', IsVerified: true },
    { Url: 'https://other.com/', IsVerified: false },
  ],
  GetRankAndTrafficStats: [
    { Date: ms('2026-09-01'), Clicks: 30, Impressions: 300 },
    { Date: ms('2026-09-02'), Clicks: 10, Impressions: 100 },
    { Date: ms('2026-08-05'), Clicks: 4, Impressions: 40 },
  ],
  GetQueryStats: [
    {
      Date: ms('2026-08-29'),
      Query: 'blue widgets',
      Clicks: 20,
      Impressions: 200,
      AvgImpressionPosition: 2,
    },
    {
      Date: ms('2026-09-05'),
      Query: 'blue widgets',
      Clicks: 10,
      Impressions: 100,
      AvgImpressionPosition: 5,
    },
    {
      Date: ms('2026-09-05'),
      Query: 'widget chart',
      Clicks: 5,
      Impressions: 50,
      AvgImpressionPosition: -1,
    },
    { Date: 'not a date', Query: 'broken', Clicks: 1, Impressions: 1 },
  ],
  GetPageStats: [
    {
      Date: ms('2026-09-05'),
      Query: 'https://example.com/pay',
      Clicks: 7,
      Impressions: 70,
      AvgImpressionPosition: 3,
    },
  ],
}

function fakeBing() {
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('apikey'), 'key')
    const method = url.pathname.split('/').at(-1) ?? ''
    return Response.json({ d: BING[method] ?? [] })
  }) as typeof fetch
}

const google: SearchAnalyticsQuery = async (_site, body) => {
  const dims = body.dimensions ?? []
  const row = (keys: string[], clicks: number, position = 4) => ({
    keys,
    clicks,
    impressions: clicks * 10,
    ctr: 0.1,
    position,
  })
  if (dims.length === 0) {
    return {
      rows: [row([], body.startDate === '2026-08-10' ? 60 : 40)],
      calls: 1,
      rowsFetched: 1,
    }
  }
  if (dims[0] === 'query' && dims.length === 1) {
    return {
      rows: [row(['Blue Widgets'], 3, 7.25)],
      calls: 1,
      rowsFetched: 1,
    }
  }
  return { rows: [], calls: 1, rowsFetched: 0 }
}

function deps(bing: CommandDeps['bing']): CommandDeps {
  return {
    searchAnalytics: google,
    checkPages: async () => [],
    liveCheck: async () => {
      throw new Error('not used')
    },
    inspect: async () => {
      throw new Error('not used')
    },
    call: mcpCall,
    bing,
    bingConnect: 'Connect Bing here.',
    now: () => new Date('2026-09-10T12:00:00Z'),
  }
}

test('the bing section sums Bing weeks in the window and puts Google beside each query', async () => {
  fakeBing()
  const call = bingCall({ apiKey: 'key' }, { signIn: 'x' })
  const result = await runReport(
    {
      site: 'sc-domain:example.com',
      section: 'bing',
      startDate: '2026-08-10',
      endDate: '2026-09-06',
      detail: 'full',
    },
    deps(async () => call),
  )
  const report = result.data as {
    bingSite: string
    items: Record<string, unknown>[]
    topPages: Record<string, unknown>[]
    caveats: string[]
  }
  assert.equal(report.bingSite, 'https://example.com/')
  // Two weeks of "blue widgets" add up; position is weighted by impressions.
  assert.deepEqual(report.items[0], {
    query: 'blue widgets',
    bingClicks: 30,
    bingImpressions: 300,
    bingPosition: 3,
    googleClicks: 3,
    googleImpressions: 30,
    googlePosition: 7.3,
  })
  // An unknown Bing position stays unknown; a query Google did not show is 0.
  assert.deepEqual(report.items[1], {
    query: 'widget chart',
    bingClicks: 5,
    bingImpressions: 50,
    bingPosition: null,
    googleClicks: 0,
    googleImpressions: 0,
    googlePosition: null,
  })
  assert.equal(report.topPages[0]?.page, 'https://example.com/pay')
  assert.ok(
    report.caveats.some((line) => /1 Bing rows were not valid/.test(line)),
  )
})

test('the overview puts Bing totals beside Google for the same dates, and names a missing Bing', async () => {
  fakeBing()
  const call = bingCall({ apiKey: 'key' }, { signIn: 'x' })
  const input = {
    site: 'sc-domain:example.com',
    section: 'overview' as const,
    startDate: '2026-08-10',
    endDate: '2026-09-06',
  }
  const withBing = await runReport(
    input,
    deps(async () => call),
  )
  assert.match(
    withBing.text,
    /Google \(Search Console\): clicks 60 \(was 40, \+50%\).*Bing \(https:\/\/example.com\/\): clicks 40 \(was 4,/,
  )
  assert.match(withBing.text, /Share of these clicks: Google 60%, Bing 40%/)
  assert.match(withBing.text, /Bing has data for 2 of 28 days/)

  const without = await runReport(
    input,
    deps(async () => null),
  )
  assert.match(
    without.text,
    /Bing: Bing is not connected\. Connect Bing here\./,
  )
})
