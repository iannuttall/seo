import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { getDb } from '../storage/database.js'
import {
  CRAWL_RUN_RETENTION,
  type CrawlPageSnapshot,
  compareCrawlPages,
  getRunPages,
  insertCrawlRun,
} from './monitoring.js'

const page = (input: Partial<CrawlPageSnapshot>): CrawlPageSnapshot => ({
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  title: 'Title',
  metaDescription: 'Description',
  canonical: 'https://example.com/',
  h1: 'Heading',
  indexable: true,
  wordCount: 500,
  contentHash: 'a',
  outgoingInternalCount: 2,
  ...input,
})

test('compareCrawlPages detects added, removed, and changed URLs', () => {
  const result = compareCrawlPages({
    previous: [
      page({ url: 'https://example.com/a', title: 'Old' }),
      page({ url: 'https://example.com/removed' }),
    ],
    current: [
      page({ url: 'https://example.com/a', title: 'New' }),
      page({ url: 'https://example.com/new' }),
    ],
  })

  assert.deepEqual(
    result.map((item) => [item.kind, item.url, item.changes]),
    [
      ['changed', 'https://example.com/a', ['title']],
      ['added', 'https://example.com/new', ['url_added']],
      ['removed', 'https://example.com/removed', ['url_removed']],
    ],
  )
})

test('crawl store deduplicates redirect aliases by final URL', () => {
  const site = `sc-domain:redirect-${randomUUID()}.example`
  const startUrl = `https://${site.slice('sc-domain:'.length)}/`
  const finalUrl = `${startUrl}destination`
  const runId = `run-${randomUUID()}`

  insertCrawlRun(
    {
      id: runId,
      site,
      startUrl,
      createdAt: new Date().toISOString(),
      limit: 3,
      urlCount: 2,
    },
    [page({ url: finalUrl, finalUrl }), page({ url: finalUrl, finalUrl })],
  )

  const saved = getRunPages(runId)
  assert.equal(saved.size, 1)
  assert.ok(saved.has(finalUrl))
  const storedRun = getDb()
    .prepare('SELECT url_count FROM crawl_runs WHERE id = ?')
    .get(runId) as { url_count: number }
  assert.equal(storedRun.url_count, 1)
})

test('crawl monitoring retains only the recent runs it can use', () => {
  const site = `sc-domain:retention-${randomUUID()}.example`
  const startUrl = `https://${site.slice('sc-domain:'.length)}/`
  const ids: string[] = []
  try {
    for (let index = 0; index < CRAWL_RUN_RETENTION + 2; index += 1) {
      const id = `run-${randomUUID()}`
      ids.push(id)
      insertCrawlRun(
        {
          id,
          site,
          startUrl,
          createdAt: new Date(1_700_000_000_000 + index).toISOString(),
          limit: 1,
          urlCount: 0,
        },
        [],
      )
    }

    const rows = getDb()
      .prepare(
        'SELECT id FROM crawl_runs WHERE site_url = ? AND start_url = ? ORDER BY created_at',
      )
      .all(site, startUrl) as Array<{ id: string }>
    assert.equal(rows.length, CRAWL_RUN_RETENTION)
    assert.deepEqual(
      rows.map((row) => row.id),
      ids.slice(2),
    )
  } finally {
    getDb().prepare('DELETE FROM crawl_runs WHERE site_url = ?').run(site)
  }
})
