import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDataForSeoWebsiteTraffic } from './dataforseo-traffic.ts'
import { ProviderAdapterError } from './provider-adapter.ts'

const now = () => new Date('2026-08-09T10:30:00.000Z')

function response(items: unknown[], cost: number): Response {
  return Response.json({
    status_code: 20_000,
    tasks: [
      {
        status_code: 20_000,
        cost,
        result: [
          {
            target: 'example.com',
            location_code: 2826,
            language_code: 'en',
            items,
          },
        ],
      },
    ],
  })
}

const organic = {
  pos_1: 2,
  pos_2_3: 3,
  pos_4_10: 5,
  pos_11_20: 7,
  pos_21_30: 1,
  pos_31_40: 1,
  pos_41_50: 1,
  pos_51_60: 1,
  pos_61_70: 1,
  pos_71_80: 1,
  pos_81_90: 1,
  pos_91_100: 1,
  etv: 1234.5,
  count: 25,
  estimated_paid_traffic_cost: 987.65,
  is_new: 4,
  is_up: 6,
  is_down: 3,
  is_lost: 2,
}

test('returns bounded estimates, the top 20 keywords and the top pages', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const keywordItems = Array.from({ length: 25 }, (_, index) => ({
    keyword_data: {
      keyword: `keyword ${index}`,
      keyword_info: { search_volume: 100 - index },
    },
    ranked_serp_element: {
      serp_item: {
        type: 'organic',
        rank_group: index + 1,
        rank_absolute: index + 2,
        url: `https://example.com/page-${index}#result`,
        etv: index * 10,
        estimated_paid_traffic_cost: index * 2,
      },
    },
  }))
  const pageItems = [
    {
      page_address: 'https://example.com/small',
      metrics: { organic: { ...organic, etv: 5 } },
    },
    {
      page_address: 'https://example.com/big',
      metrics: { organic: { ...organic, etv: 900 } },
    },
    { page_address: 'https://other.example/elsewhere', metrics: { organic } },
    {
      page_address: 'https://example.com/big',
      metrics: { organic: { ...organic, etv: 1 } },
    },
  ]
  const result = await checkDataForSeoWebsiteTraffic(
    {
      target: 'https://www.example.com/some-page',
      login: 'login',
      password: 'password',
      locationCode: 2826,
      languageCode: 'EN',
    },
    {
      now,
      fetch: async (input, init) => {
        calls.push({ url: input.toString(), init })
        const url = input.toString()
        if (url.endsWith('/relevant_pages/live'))
          return response(pageItems, 0.011)
        return url.endsWith('/historical_rank_overview/live')
          ? response(
              [
                { year: 2026, month: 8, metrics: { organic } },
                {
                  year: 2026,
                  month: 7,
                  metrics: { organic: { ...organic, etv: 1000 } },
                },
              ],
              0.1344,
            )
          : response(keywordItems, 0.0126)
      },
    },
  )

  assert.equal(calls.length, 3)
  assert.equal(
    calls[0]?.url,
    'https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live',
  )
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), [
    {
      target: 'example.com',
      location_code: 2826,
      language_code: 'en',
      ignore_synonyms: false,
      include_clickstream_data: false,
      date_from: '2025-09-01',
      date_to: '2026-08-09',
      correlate: true,
    },
  ])
  const keywordCall = calls.find((call) =>
    call.url.endsWith('/ranked_keywords/live'),
  )
  assert.deepEqual(JSON.parse(String(keywordCall?.init?.body)), [
    {
      target: 'example.com',
      location_code: 2826,
      language_code: 'en',
      ignore_synonyms: false,
      include_clickstream_data: false,
      item_types: ['organic'],
      historical_serp_mode: 'live',
      order_by: ['ranked_serp_element.serp_item.etv,desc'],
      limit: 20,
    },
  ])
  assert.equal(result.dataStatus, 'complete')
  assert.equal(result.latest?.month, '2026-08')
  assert.equal(result.latest?.estimatedOrganicTraffic, 1234.5)
  assert.equal(result.latest?.positions.twentyFirstToHundredth, 8)
  assert.equal(result.history.length, 2)
  assert.equal(result.topKeywords.length, 20)
  assert.equal(result.topKeywords[0]?.keyword, 'keyword 24')
  assert.equal(result.topKeywords.at(-1)?.keyword, 'keyword 5')
  assert.equal(result.topKeywords[0]?.rankingUrl, 'https://example.com/page-24')
  assert.deepEqual(
    result.topPages.map((page) => [
      page.url,
      page.estimatedOrganicTraffic,
      page.topThree,
    ]),
    [
      ['https://example.com/big', 900, 5],
      ['https://example.com/small', 5, 5],
    ],
  )
  assert.equal(result.provenance.providerCostUsd, 0.158)
  assert.deepEqual(result.provenance.period, {
    dateFrom: '2025-09-01',
    dateTo: '2026-08-09',
    requestedMonths: 12,
    returnedMonths: 2,
  })
})

test('aborts a provider fetch at the configured timeout', async () => {
  await assert.rejects(
    checkDataForSeoWebsiteTraffic(
      {
        target: 'example.com',
        login: 'login',
        password: 'password',
        locationCode: 2826,
        languageCode: 'en',
      },
      {
        timeoutMs: 5,
        fetch: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('provider internals', 'AbortError')),
            )
          }),
      },
    ),
    (error: unknown) =>
      error instanceof ProviderAdapterError && error.code === 'timeout',
  )
})
