import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDataForSeoBacklinks } from './dataforseo-backlinks.ts'

const now = () => new Date('2026-10-21T10:00:00.000Z')

function task(result: Record<string, unknown>, cost = 0.02): Response {
  return Response.json({
    status_code: 20_000,
    tasks: [{ status_code: 20_000, cost, result: [result] }],
  })
}

const link = (domain: string, rank: number, extra = {}) => ({
  type: 'backlink',
  domain_from: domain,
  url_from: `https://${domain}/post#comments`,
  url_to: 'https://example.com/',
  page_from_title: `A post on ${domain}`,
  anchor: 'Example',
  item_type: 'anchor',
  dofollow: true,
  domain_from_rank: rank,
  backlink_spam_score: 3,
  semantic_location: 'main',
  first_seen: '2026-09-19 07:57:30 +00:00',
  last_seen: '2026-10-12 07:58:33 +00:00',
  is_new: false,
  is_broken: false,
  ...extra,
})

test('builds a backlink result and marks it partial when anchors fail', async () => {
  const bodies = new Map<string, unknown>()
  const result = await checkDataForSeoBacklinks(
    {
      target: 'https://www.example.com/',
      login: 'login',
      password: 'password',
    },
    {
      now,
      fetch: async (input, init) => {
        const url = input.toString()
        bodies.set(
          url.split('/v3/backlinks/')[1] ?? url,
          JSON.parse(String(init?.body)),
        )
        if (url.endsWith('/summary/live')) {
          return task({
            target: 'example.com',
            backlinks: 1200,
            referring_domains: 80,
            referring_domains_nofollow: 20,
            rank: 41,
            backlinks_spam_score: 7,
            first_seen: '2019-07-18 07:44:43 +00:00',
            referring_links_attributes: { nofollow: 300, ugc: 4, sponsored: 0 },
          })
        }
        if (url.endsWith('/backlinks/live')) {
          return task({
            total_count: 80,
            items: [
              link('low.example', 12),
              link('high.example', 88, {
                dofollow: false,
                anchor: 'Example\u0000 home',
              }),
              link('low.example', 12),
              { ...link('bad.example', 50), url_from: 'javascript:alert(1)' },
            ],
          })
        }
        if (url.endsWith('/anchors/live'))
          return new Response('', { status: 500 })
        return task({
          items: [
            {
              date: '2026-09-30 00:00:00 +00:00',
              referring_domains: 80,
              backlinks: 1200,
              new_referring_domains: 6,
              lost_referring_domains: 2,
            },
            {
              date: '2026-08-31 00:00:00 +00:00',
              referring_domains: 76,
              backlinks: 1100,
              new_referring_domains: 4,
              lost_referring_domains: 1,
            },
          ],
        })
      },
    },
  )

  assert.equal(result.target, 'example.com')
  assert.equal(result.targetType, 'domain')
  assert.equal(result.dataStatus, 'partial')
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ['provider-estimate', 'anchors-unavailable'],
  )
  assert.equal(result.summary.referringDomains, 80)
  assert.equal(result.summary.firstSeen, '2019-07-18')
  assert.deepEqual(result.summary.attributes, [
    { name: 'nofollow', count: 300 },
    { name: 'ugc', count: 4 },
  ])
  assert.deepEqual(
    result.backlinks.map((row) => [
      row.sourceDomain,
      row.domainRank,
      row.dofollow,
      row.anchor,
    ]),
    [
      ['high.example', 88, false, 'Example home'],
      ['low.example', 12, true, 'Example'],
    ],
  )
  assert.equal(result.backlinks[0]?.sourceUrl, 'https://high.example/post')
  assert.deepEqual(
    result.history.map((month) => [month.month, month.referringDomains]),
    [
      ['2026-08', 76],
      ['2026-09', 80],
    ],
  )
  assert.equal(result.provenance.providerCostUsd, 0.06)
  assert.deepEqual(bodies.get('history/live'), [
    {
      target: 'example.com',
      rank_scale: 'one_hundred',
      date_from: '2025-10-01',
    },
  ])
})

test('checks a page without asking for history', async () => {
  const urls: string[] = []
  const result = await checkDataForSeoBacklinks(
    {
      target: 'https://example.com/guide',
      login: 'login',
      password: 'password',
    },
    {
      now,
      fetch: async (input) => {
        urls.push(input.toString())
        return task({
          target: 'https://example.com/guide',
          items: [],
          total_count: 0,
        })
      },
    },
  )
  assert.equal(result.targetType, 'page')
  assert.equal(result.dataStatus, 'complete')
  assert.equal(
    urls.some((url) => url.endsWith('/history/live')),
    false,
  )
  assert.deepEqual(result.backlinks, [])
})
