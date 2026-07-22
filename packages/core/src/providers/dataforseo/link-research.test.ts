import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DataForSeoLinkProvider,
  type DataForSeoLinkProviderOptions,
} from './link-research.js'
import {
  dataForSeoBacklinksResponseSchema,
  dataForSeoLinkSummaryResponseSchema,
  dataForSeoReferringDomainsResponseSchema,
} from './link-schema.js'
import type { DataForSeoPaidSnapshot } from './paid-request.js'

function snapshot<T>(response: T, returnedRows: number) {
  return {
    response,
    observedAt: '2026-07-22T08:00:00.000Z',
    returnedRows,
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 24_036,
      actualMicros: 24_036,
      taskIds: ['link-task'],
    },
    spendNotice: null,
    warnings: [],
  } as DataForSeoPaidSnapshot<
    T & {
      status_code: number
      tasks_error: number
      tasks: Array<{ status_code: number }>
    }
  >
}

function provider(
  overrides: Partial<NonNullable<DataForSeoLinkProviderOptions['client']>> = {},
): DataForSeoLinkProvider {
  return new DataForSeoLinkProvider({
    client: {
      linkSummary: async () =>
        snapshot(
          dataForSeoLinkSummaryResponseSchema.parse({
            status_code: 20000,
            status_message: 'Ok.',
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'summary-task',
                status_code: 20000,
                status_message: 'Ok.',
                result: [
                  {
                    target: 'example.com',
                    backlinks: 0,
                    referring_domains: 0,
                    referring_pages: 0,
                    broken_backlinks: 0,
                    broken_pages: 0,
                    rank: 12,
                    backlinks_spam_score: 3,
                  },
                ],
              },
            ],
          }),
          1,
        ),
      backlinks: async () =>
        snapshot(
          dataForSeoBacklinksResponseSchema.parse({
            status_code: 20000,
            status_message: 'Ok.',
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'backlinks-task',
                status_code: 20000,
                status_message: 'Ok.',
                result: [{ total_count: 0, items_count: 0, items: [] }],
              },
            ],
          }),
          0,
        ),
      referringDomains: async () =>
        snapshot(
          dataForSeoReferringDomainsResponseSchema.parse({
            status_code: 20000,
            status_message: 'Ok.',
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'domains-task',
                status_code: 20000,
                status_message: 'Ok.',
                result: [{ total_count: 0, items_count: 0, items: [] }],
              },
            ],
          }),
          0,
        ),
      ...overrides,
    },
  })
}

test('link summary preserves observed zero and provider-native metrics', async () => {
  const result = await provider().linkSummary({ target: 'www.example.com' })

  assert.equal(result.market, null)
  assert.deepEqual(result.data.backlinks, { state: 'observed', value: 0 })
  assert.deepEqual(result.data.referringDomains, {
    state: 'observed',
    value: 0,
  })
  assert.deepEqual(
    result.data.metrics.map((metric) => [metric.id, metric.value]),
    [
      ['rank', 12],
      ['backlinks-spam-score', 3],
    ],
  )
  assert.equal(result.data.target, 'example.com')
})

test('representative backlinks reject invalid rows and collapse duplicates deterministically', async () => {
  const rawItems = [
    {
      url_from: 'https://source.example/post',
      url_to: 'https://example.com/page',
      anchor: 'Useful page',
      rank: 10,
      domain_from_rank: 20,
      group_count: 4,
      links_count: 2,
      dofollow: true,
      rel_attributes: ['ugc', 'ugc'],
      first_seen: '2026-01-02 12:00:00 +00:00',
    },
    {
      url_from: 'https://source.example/post',
      url_to: 'https://example.com/page',
      anchor: 'Useful page',
      rank: 5,
      domain_from_rank: 20,
    },
    {
      url_from: 'ftp://invalid.example/file',
      url_to: 'https://example.com/page',
    },
    {
      url_from: 'https://another.example/reference',
      url_to: 'https://example.com/other',
      anchor: null,
      rank: 30,
      is_indirect_link: true,
    },
  ]
  const run = async (items: typeof rawItems) =>
    provider({
      backlinks: async () =>
        snapshot(
          dataForSeoBacklinksResponseSchema.parse({
            status_code: 20000,
            status_message: 'Ok.',
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'backlinks-task',
                status_code: 20000,
                status_message: 'Ok.',
                result: [{ total_count: 500, items_count: 4, items }],
              },
            ],
          }),
          items.length,
        ),
    }).backlinks({ target: 'example.com', limit: 100 })

  const forward = await run(rawItems)
  const reverse = await run([...rawItems].reverse())
  assert.deepEqual(forward.data.rows, reverse.data.rows)
  assert.equal(forward.data.rows.length, 2)
  assert.equal(forward.coverage.invalidRows, 1)
  assert.equal(forward.coverage.completeness, 'partial')
  assert.equal(forward.data.rows[0]?.sourceDomain, 'another.example')
  assert.equal(forward.data.rows[1]?.linksFromDomain, 4)
  assert.deepEqual(forward.data.rows[1]?.attributes, ['ugc'])
  assert.match(forward.warnings[0]?.message ?? '', /lacked required fields/)
  assert.match(forward.warnings[1]?.message ?? '', /duplicate/)
})

test('representative backlink coverage does not paginate against an ungrouped total', async () => {
  const items = Array.from({ length: 17 }, (_, index) => ({
    url_from: `https://source-${index}.example/post`,
    url_to: 'https://example.com/page',
    rank: 100 - index,
  }))
  const result = await provider({
    backlinks: async () =>
      snapshot(
        dataForSeoBacklinksResponseSchema.parse({
          status_code: 20000,
          status_message: 'Ok.',
          tasks_count: 1,
          tasks_error: 0,
          tasks: [
            {
              id: 'backlinks-task',
              status_code: 20000,
              status_message: 'Ok.',
              result: [{ total_count: 19, items_count: 17, items }],
            },
          ],
        }),
        items.length,
      ),
  }).backlinks({ target: 'example.com', limit: 25, mode: 'representative' })

  assert.equal(result.coverage.returnedRows, 17)
  assert.equal(result.coverage.providerTotalRows, 19)
  assert.equal(result.coverage.completeness, 'filtered')
  assert.equal(result.coverage.nextCursor, null)
})

test('referring domains keep unavailable fields separate from zero', async () => {
  const result = await provider({
    referringDomains: async () =>
      snapshot(
        dataForSeoReferringDomainsResponseSchema.parse({
          status_code: 20000,
          status_message: 'Ok.',
          tasks_count: 1,
          tasks_error: 0,
          tasks: [
            {
              id: 'domains-task',
              status_code: 20000,
              status_message: 'Ok.',
              result: [
                {
                  total_count: 1,
                  items_count: 1,
                  items: [
                    {
                      domain: 'source.example',
                      backlinks: 0,
                      referring_pages: null,
                      rank: 8,
                    },
                  ],
                },
              ],
            },
          ],
        }),
        1,
      ),
  }).referringDomains({ target: 'example.com', limit: 10 })

  assert.deepEqual(result.data.rows[0]?.backlinks, {
    state: 'observed',
    value: 0,
  })
  assert.equal(result.data.rows[0]?.referringPages.state, 'missing')
  assert.equal(result.data.rows[0]?.metrics[0]?.id, 'source-domain-rank')
})

test('link targets and page bounds fail before provider acquisition', async () => {
  let calls = 0
  const instance = provider({
    backlinks: async () => {
      calls += 1
      throw new Error('should not run')
    },
  })
  await assert.rejects(
    instance.backlinks({ target: 'not a domain', limit: 10 }),
    /valid domain/,
  )
  await assert.rejects(
    instance.backlinks({
      target: 'example.com/path',
      scope: 'page',
      limit: 10,
    }),
    /absolute URL/,
  )
  await assert.rejects(
    instance.backlinks({ target: 'example.com', limit: 1_001 }),
    /from 1 to 1000/,
  )
  assert.equal(calls, 0)
})

test('link response schemas reject negative counts and oversized row sets', () => {
  assert.equal(
    dataForSeoLinkSummaryResponseSchema.safeParse({
      status_code: 20000,
      status_message: 'Ok.',
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          status_code: 20000,
          status_message: 'Ok.',
          result: [{ backlinks: -1 }],
        },
      ],
    }).success,
    false,
  )
  assert.equal(
    dataForSeoBacklinksResponseSchema.safeParse({
      status_code: 20000,
      status_message: 'Ok.',
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          status_code: 20000,
          status_message: 'Ok.',
          result: [
            { items: Array.from({ length: 1_001 }, () => ({ url_from: 'x' })) },
          ],
        },
      ],
    }).success,
    false,
  )
})
