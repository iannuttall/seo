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

test('returns bounded historical estimates and the five highest traffic keywords', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const keywordItems = Array.from({ length: 7 }, (_, index) => ({
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
        return calls.length === 1
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

  assert.equal(calls.length, 2)
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
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), [
    {
      target: 'example.com',
      location_code: 2826,
      language_code: 'en',
      ignore_synonyms: false,
      include_clickstream_data: false,
      item_types: ['organic'],
      historical_serp_mode: 'live',
      order_by: ['ranked_serp_element.serp_item.etv,desc'],
      limit: 5,
    },
  ])
  assert.equal(result.dataStatus, 'complete')
  assert.equal(result.latest?.month, '2026-08')
  assert.equal(result.latest?.estimatedOrganicTraffic, 1234.5)
  assert.equal(result.latest?.positions.twentyFirstToHundredth, 8)
  assert.equal(result.history.length, 2)
  assert.equal(result.topKeywords.length, 5)
  assert.deepEqual(
    result.topKeywords.map((keyword) => keyword.keyword),
    ['keyword 6', 'keyword 5', 'keyword 4', 'keyword 3', 'keyword 2'],
  )
  assert.equal(result.topKeywords[0]?.rankingUrl, 'https://example.com/page-6')
  assert.equal(result.provenance.providerCostUsd, 0.147)
  assert.deepEqual(result.provenance.period, {
    dateFrom: '2025-09-01',
    dateTo: '2026-08-09',
    requestedMonths: 12,
    returnedMonths: 2,
  })
})

test('returns useful history as partial when the keyword sample fails', async () => {
  let calls = 0
  const rawError = 'private upstream failure 123'
  const result = await checkDataForSeoWebsiteTraffic(
    {
      target: 'example.com',
      login: 'login',
      password: 'password',
      locationCode: 2826,
      languageCode: 'en',
    },
    {
      now,
      fetch: async () => {
        calls += 1
        return calls === 1
          ? response([{ year: 2026, month: 8, metrics: { organic } }], 0.1)
          : new Response(rawError, { status: 503 })
      },
    },
  )

  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.history.length, 1)
  assert.deepEqual(result.topKeywords, [])
  assert.equal(result.provenance.providerCostUsd, 0.1)
  assert.ok(
    result.warnings.some((warning) => warning.code === 'keywords-unavailable'),
  )
  assert.doesNotMatch(JSON.stringify(result), /private upstream failure/u)
})

test('fails safely when historical traffic cannot be trusted', async () => {
  const rawMessage = 'secret account message 123'
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
        fetch: async () =>
          Response.json({
            status_code: 20_000,
            tasks: [
              {
                status_code: 40_200,
                status_message: rawMessage,
                result: [],
              },
            ],
          }),
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError)
      assert.equal(error.code, 'upstream-unavailable')
      assert.doesNotMatch(error.message, /secret account message|123/u)
      return true
    },
  )
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
