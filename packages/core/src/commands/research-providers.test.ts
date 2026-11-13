import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { runIndexCheck } from './index-check.js'
import { runResearch } from './research.js'
import { research } from './research-providers.js'
import { zeroVolumeRows } from './research-zero-volume.js'

const dataForSeo = new Headers({
  'x-dataforseo-login': 'login',
  'x-dataforseo-password': 'password',
})

// DataForSEO's live SERP sometimes answers 40102 "No Search Results" for a
// search Google does show results for. That used to come back as "No rows".
test('serp asks again after an empty results page and names keywords still empty', async () => {
  const answers = new Map<string, number[]>([
    ['flaky search', [40102, 20000]],
    ['empty search', [40102, 40102]],
  ])
  globalThis.fetch = (async (input: Request) => {
    const [task] = (await input.json()) as { keyword: string }[]
    const keyword = task?.keyword ?? ''
    const status = answers.get(keyword)?.shift()
    return Response.json({
      tasks: [
        {
          status_code: status,
          status_message: status === 40102 ? 'No Search Results.' : 'Ok.',
          cost: 0.002,
          result:
            status === 20000
              ? [
                  {
                    items: [
                      {
                        type: 'organic',
                        rank_group: 1,
                        rank_absolute: 1,
                        url: 'https://example.com/links',
                        domain: 'example.com',
                        title: 'Links',
                      },
                    ],
                  },
                ]
              : null,
        },
      ],
    })
  }) as typeof fetch

  const out = await research('dataforseo', dataForSeo, {
    action: 'serp',
    keywords: ['flaky search', 'empty search'],
    target: '',
    country: 'id',
    limit: 100,
  })
  assert.deepEqual(
    out.rows.map((row) => [row.keyword, row.position, row.url]),
    [['flaky search', 1, 'https://example.com/links']],
  )
  assert.deepEqual(out.noData, ['empty search'])
  // Four SERP tasks and the one domain_rank call.
  assert.equal(out.costUsd, 0.01)
})

// Teardowns reported rank_absolute as the position, so a third organic link
// under an AI Overview and People Also Ask read as "position 7", and about
// a third of searches failed with 40101 and were never asked again.
test('serp gives the organic position beside rank_absolute and retries 40101', async () => {
  const statuses = [40101, 20000]
  globalThis.fetch = (async (input: Request) => {
    const [task] = (await input.json()) as { device?: string }[]
    const status = input.url.includes('bulk_ranks') ? 20000 : statuses.shift()
    const items = [
      {
        type: 'ai_overview',
        rank_group: 1,
        rank_absolute: 1,
        references: [
          { domain: 'example.org', url: 'https://example.org/flags' },
        ],
      },
      {
        type: 'organic',
        rank_group: 1,
        rank_absolute: 2,
        url: 'https://example.net/a',
        domain: 'example.net',
      },
      { type: 'people_also_ask', rank_group: 1, rank_absolute: 3 },
      {
        type: 'organic',
        rank_group: 2,
        rank_absolute: 4,
        url: 'https://example.com/b',
        domain: 'example.com',
      },
    ]
    return Response.json({
      tasks: [
        {
          status_code: status,
          status_message:
            status === 40101 ? 'Internal SE Server Error.' : 'Ok.',
          cost: status === 40101 ? 0 : 0.002,
          result:
            status === 20000
              ? [{ items: task?.device === 'mobile' ? items : [] }]
              : null,
        },
      ],
    })
  }) as typeof fetch
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const pending = research('dataforseo', dataForSeo, {
      action: 'serp',
      keywords: ['feature flags'],
      target: '',
      country: 'us',
      device: 'mobile',
      noRank: true,
      limit: 100,
    })
    for (let i = 0; i < 20 && statuses.length; i++) {
      await new Promise((done) => setImmediate(done))
      mock.timers.tick(1_000)
    }
    const out = await pending
    assert.deepEqual(
      out.rows.map((row) => [row.position, row.rank_absolute, row.domain]),
      [
        [1, 2, 'example.net'],
        [2, 4, 'example.com'],
      ],
    )
    assert.deepEqual(out.missed, [])
    assert.deepEqual(out.aiOverviews?.[0]?.references[0]?.domain, 'example.org')
  } finally {
    mock.timers.reset()
  }
})

// When nothing matches a site: search, Google drops the filter and shows
// unrelated sites. The PostHog teardown read that as a missing page for the
// wrong reason; it must be no match, and a failed search makes it unknown.
test("index_check treats Google's site: fallback as no match", async () => {
  globalThis.fetch = (async (input: Request) => {
    await input.json()
    const unrelated = [
      {
        type: 'organic',
        rank_group: 1,
        rank_absolute: 1,
        url: 'https://example.org/zebra',
        domain: 'example.org',
      },
    ]
    return Response.json({
      tasks: [
        {
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.002,
          result: [{ items: unrelated }],
        },
      ],
    })
  }) as typeof fetch
  const out = await runIndexCheck(
    { url: 'https://example.com/docs/flags', phrases: ['zebra release'] },
    dataForSeo,
  )
  const data = out.data as { verdict: string; checks: { result: string }[] }
  assert.equal(data.verdict, 'not_found')
  assert.deepEqual(
    data.checks.map((check) => check.result),
    ['fallback', 'fallback', 'other_sites', 'other_sites'],
  )
})

// The link gap is the referring domains of two or more competitors minus
// the target's. A list cut at the 1,000 row limit cannot show what sits
// below its lowest Domain Rating, so the gap stops there.
test('link_gap keeps domains linking to two competitors and not the target, down to the cut', async () => {
  const lists: Record<string, { domain: string; domain_rating: number }[]> = {
    'example.com': [{ domain: 'both-and-target.example', domain_rating: 90 }],
    'example.org': [
      { domain: 'bit.ly', domain_rating: 94 },
      { domain: 'best-coupons.example', domain_rating: 70 },
      { domain: 'both-and-target.example', domain_rating: 90 },
      { domain: 'strong.example', domain_rating: 80 },
      { domain: 'only-org.example', domain_rating: 75 },
      { domain: 'weak.example', domain_rating: 20 },
      { domain: 'blog.example.com', domain_rating: 60 },
    ],
    // Cut at 1,000 rows, the lowest at Domain Rating 30.
    'example.net': [
      { domain: 'both-and-target.example', domain_rating: 90 },
      { domain: 'strong.example', domain_rating: 80 },
      { domain: 'mid.example', domain_rating: 50 },
      { domain: 'blog.example.com', domain_rating: 60 },
      ...Array.from({ length: 996 }, (_, index) => ({
        domain: `filler-${index}.example`,
        domain_rating: 30,
      })),
    ],
    // weak.example links to two competitors but sits below the cut.
    // Link lists and shorteners link to every site, so they are left out.
    'example.edu': [
      { domain: 'bit.ly', domain_rating: 94 },
      { domain: 'best-coupons.example', domain_rating: 70 },
      { domain: 'mid.example', domain_rating: 50 },
      { domain: 'strong.example', domain_rating: 80 },
      { domain: 'weak.example', domain_rating: 20 },
    ],
  }
  globalThis.fetch = (async (input: Request) => {
    const target = new URL(input.url).searchParams.get('target') ?? ''
    return Response.json({ refdomains: lists[target] ?? [] })
  }) as typeof fetch

  const out = await research('ahrefs', new Headers({ 'x-ahrefs-key': 'key' }), {
    action: 'link_gap',
    keywords: [],
    target: 'https://www.example.com/',
    competitors: ['example.org', 'www.example.net', 'example.edu'],
    country: 'us',
    limit: 100,
  })
  assert.deepEqual(out.rows, [
    {
      domain: 'strong.example',
      domain_rating: 80,
      competitors_linking: 3,
      links_to: 'example.org example.net example.edu',
    },
    {
      domain: 'mid.example',
      domain_rating: 50,
      competitors_linking: 2,
      links_to: 'example.net example.edu',
    },
  ])
  assert.deepEqual(out.floor, { field: 'domain_rating', value: 30 })
  assert.deepEqual(out.leftOut, ['best-coupons.example', 'bit.ly'])
})

// DataForSEO reads a target without its scheme as the whole domain (ranked
// keywords) or finds no links (backlinks), so a page used to come back as
// the site's keywords or a false zero.
test('dataforseo reads a page as its absolute URL and a subfolder as a filter', async () => {
  const sent: Record<string, unknown>[] = []
  globalThis.fetch = (async (input: Request) => {
    const [task] = (await input.json()) as Record<string, unknown>[]
    sent.push(task ?? {})
    return Response.json({
      tasks: [{ status_code: 20000, cost: 0, result: [{ items: [] }] }],
    })
  }) as typeof fetch
  const ask = (action: 'ranked_keywords' | 'backlinks', target: string) =>
    research('dataforseo', dataForSeo, {
      action,
      keywords: [],
      target,
      country: 'us',
      limit: 100,
    })
  await ask('ranked_keywords', 'example.com/tools/checker')
  await ask('backlinks', 'example.com/tools/checker')
  await ask('ranked_keywords', 'https://example.com/blog/')
  assert.equal(sent[0]?.target, 'https://example.com/tools/checker')
  assert.equal(sent[1]?.target, 'https://example.com/tools/checker')
  assert.equal(sent[2]?.target, 'example.com')
  assert.deepEqual(sent[2]?.filters, [
    'ranked_serp_element.serp_item.relative_url',
    'like',
    '/blog/%',
  ])
})

// A keyword DataForSEO answered with a null volume was shown as a row and
// never listed as no data, so it read like a known number.
test('keyword_metrics lists a keyword with a null volume as no data', async () => {
  globalThis.fetch = (async () =>
    Response.json({
      tasks: [
        {
          status_code: 20000,
          cost: 0.01,
          result: [
            {
              items: [
                { keyword: 'known', keyword_info: { search_volume: 90 } },
                { keyword: 'unknown', keyword_info: { search_volume: null } },
              ],
            },
          ],
        },
      ],
    })) as typeof fetch
  const out = await research('dataforseo', dataForSeo, {
    action: 'keyword_metrics',
    keywords: ['known', 'unknown'],
    target: '',
    country: 'us',
    limit: 100,
  })
  assert.deepEqual(out.noData, ['unknown'])
})

// Reading the next page, or the same rows in full, asked the provider again
// and paid again.
test('paging a research result reads the saved rows at no new cost', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return Response.json({
      tasks: [
        {
          status_code: 20000,
          cost: 0.05,
          result: [
            {
              items: Array.from({ length: 80 }, (_, index) => ({
                keyword: `keyword ${index}`,
                keyword_info: { search_volume: 100 - index },
              })),
            },
          ],
        },
      ],
    })
  }) as typeof fetch
  const saved = new Map<string, string>()
  const store = {
    get: async (key: string) => saved.get(key) ?? null,
    put: async (key: string, value: string) => {
      saved.set(key, value)
    },
  }
  const ask = (offset: number, detail: 'rows' | 'full') =>
    runResearch(
      {
        action: 'keyword_ideas',
        keywords: ['seed'],
        offset,
        detail,
      },
      dataForSeo,
      { call: () => '', store },
    )
  const first = (await ask(0, 'rows')).data as Record<string, unknown>
  const second = (await ask(50, 'rows')).data as Record<string, unknown>
  const full = (await ask(0, 'full')).data as Record<string, unknown>
  assert.equal(calls, 1)
  assert.deepEqual([first.costUsd, first.next], [0.05, 50])
  assert.deepEqual([second.costUsd, second.next], [0, null])
  assert.deepEqual(
    [(full.rows as unknown[]).length, full.next, full.rowsLeftOut],
    [80, null, 0],
  )
})

// Zero-volume keywords keep a provider's zero apart from no data, and leave
// out keywords the provider rates above zero.
test('zero-volume keywords tell a zero from unknown', () => {
  const query = (keyword: string, impressions: number) => ({
    keyword,
    impressions,
    clicks: 0,
    position: 8,
    page: 'https://example.com/a/',
  })
  const candidates = {
    range: { startDate: '2026-10-01', endDate: '2026-10-28' },
    queries: [
      query('widgets for left handed people', 40),
      query('blue widget sizes', 30),
      query('widget repair', 20),
      query('widget glossary pdf', 10),
    ],
    skipped: { brand: 0, notAKeyword: 0, overLimit: 0 },
    brandTerms: [],
    capped: false,
  }
  const found = zeroVolumeRows(
    candidates,
    [
      { keyword: 'Blue Widget Sizes', search_volume: 0 },
      { keyword: 'widget repair', search_volume: 880 },
      { keyword: 'widget glossary pdf', search_volume: null },
    ],
    'dataforseo',
  )
  assert.deepEqual(
    found.rows.map((row) => [row.keyword, row.status, row.search_volume]),
    [
      ['widgets for left handed people', 'unknown', null],
      ['blue widget sizes', 'zero', 0],
      ['widget glossary pdf', 'unknown', null],
    ],
  )
  assert.deepEqual([found.zero, found.unknown, found.rated], [1, 2, 1])
})
