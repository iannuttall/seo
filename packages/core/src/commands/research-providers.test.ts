import assert from 'node:assert/strict'
import { test } from 'node:test'
import { research } from './research-providers.js'

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
  assert.equal(out.costUsd, 0.008)
})

// The link gap is the referring domains of two or more competitors minus
// the target's. A list cut at the 1,000 row limit cannot show what sits
// below its lowest Domain Rating, so the gap stops there.
test('link_gap keeps domains linking to two competitors and not the target, down to the cut', async () => {
  const lists: Record<string, { domain: string; domain_rating: number }[]> = {
    'example.com': [{ domain: 'both-and-target.example', domain_rating: 90 }],
    'example.org': [
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
    'example.edu': [
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
})
