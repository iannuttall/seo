import assert from 'node:assert/strict'
import { test } from 'node:test'
import { founderCounts, refreshFounderCounts } from './founder.ts'

type Row = { network: string; count: number; checked_at: string }

// Enough of D1 for founder_counts: one SELECT and INSERT OR REPLACE.
function fakeDb(rows: Row[]) {
  const table = new Map(rows.map((row) => [row.network, row]))
  const db = {
    prepare: (sql: string) => ({
      all: async () => ({ results: [...table.values()] }),
      bind: (network: string, count: number, at: string) => ({
        sql,
        run: () => table.set(network, { network, count, checked_at: at }),
      }),
    }),
    batch: async (statements: Array<{ run(): void }>) => {
      for (const statement of statements) statement.run()
      return []
    },
  }
  return { db: db as unknown as D1Database, table }
}

// The parts of each live response the refresh reads, as they come back.
function fetcher(x: unknown, youtube: unknown, status = 200) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes('fxtwitter') ? x : youtube
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
}

const xBody = (followers: number) => ({
  code: 200,
  message: 'OK',
  user: { screen_name: 'example', followers, following: 1 },
})

const youtubeBody = (subscribers: string) => ({
  header: {
    pageHeaderRenderer: {
      content: {
        pageHeaderViewModel: {
          metadata: {
            contentMetadataViewModel: {
              metadataRows: [
                { metadataParts: [{ text: { content: '@example' } }] },
                {
                  metadataParts: [
                    {
                      text: { content: subscribers },
                      accessibilityLabel: 'spoken form',
                    },
                    { text: { content: '23 videos' } },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  },
})

const now = new Date('2026-11-04T06:17:00.000Z')

test('a good daily read replaces the stored counts', async () => {
  const { db } = fakeDb([
    { network: 'x', count: 80_000, checked_at: '2026-11-03T06:17:00.000Z' },
  ])
  await refreshFounderCounts(
    { TELEMETRY_DB: db },
    now,
    fetcher(xBody(81_818), youtubeBody('16.9K subscribers')),
  )
  const counts = await founderCounts(db)
  assert.equal(counts.x, 81_818)
  assert.equal(counts.youtube, 16_900)
  assert.equal(counts.updatedAt, now.toISOString())
})

test('a zero, a halved count or a failed read keeps the last good count', async () => {
  const before: Row[] = [
    { network: 'x', count: 80_000, checked_at: '2026-11-03T06:17:00.000Z' },
    {
      network: 'youtube',
      count: 16_900,
      checked_at: '2026-11-03T06:17:00.000Z',
    },
  ]
  for (const stub of [
    fetcher(xBody(0), youtubeBody('0 subscribers')),
    fetcher(xBody(39_999), youtubeBody('8.4K subscribers')),
    fetcher({ code: 404, message: 'User not found' }, { header: {} }),
    fetcher(xBody(81_818), youtubeBody('16.9K subscribers'), 429),
  ]) {
    const { db, table } = fakeDb(before)
    await refreshFounderCounts({ TELEMETRY_DB: db }, now, stub)
    assert.deepEqual([...table.values()], before)
  }
})
