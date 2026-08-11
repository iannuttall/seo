import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  loadSearchConsoleExport,
  type SearchConsoleExportPageRow,
} from './local-export.js'
import { reconcileExportPagesWithCrawl } from './local-export-reconcile.js'

const roots: string[] = []

async function fixtureDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seo-gsc-export-'))
  roots.push(root)
  return root
}

after(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  )
})

const PAGES_HEADER = 'Top pages,Clicks,Impressions,CTR,Position'
const QUERIES_HEADER = 'Top queries,Clicks,Impressions,CTR,Position'

function pageRow(
  url: string,
  clicks: number,
  impressions: number,
): SearchConsoleExportPageRow {
  return { url, clicks, impressions, ctr: null, position: null }
}

test('loadSearchConsoleExport parses a standard export directory', async () => {
  const root = await fixtureDir()
  await writeFile(
    join(root, 'Pages.csv'),
    `${PAGES_HEADER}\n` +
      'https://example.com/blog/first-article,120,"4,321",2.78%,8.4\n' +
      'https://example.com/,45,900,5%,3.1\n',
  )
  await writeFile(
    join(root, 'Queries.csv'),
    `${QUERIES_HEADER}\n` +
      'best widgets,30,"1,200",2.5%,12.7\n' +
      'widget store,80,600,0.5,1.2\n',
  )
  const evidence = await loadSearchConsoleExport({
    path: root,
    now: new Date('2026-08-11T00:00:00Z'),
  })

  assert.equal(evidence.source, 'search-console-export')
  assert.equal(evidence.importedAt, '2026-08-11T00:00:00.000Z')
  assert.deepEqual(
    evidence.files.map((file) => file.table),
    ['pages', 'queries'],
  )
  const pagesFile = evidence.files[0]
  assert.ok(pagesFile)
  assert.match(pagesFile.sha256, /^[0-9a-f]{64}$/)
  assert.equal(pagesFile.encoding, 'utf-8')
  assert.equal(pagesFile.delimiter, ',')
  assert.deepEqual(pagesFile.includedFields, [
    'CTR',
    'Clicks',
    'Impressions',
    'Position',
    'Top pages',
  ])
  assert.equal(pagesFile.fileRows, 2)
  assert.equal(pagesFile.suppliedRows, 2)
  assert.equal(pagesFile.validRows, 2)
  assert.equal(pagesFile.invalidRows, 0)
  assert.equal(pagesFile.duplicateRows, 0)
  assert.equal(pagesFile.capped, false)
  assert.equal(pagesFile.rowLimit, 5000)

  assert.deepEqual(evidence.pages, {
    rows: [
      {
        url: 'https://example.com/blog/first-article',
        clicks: 120,
        impressions: 4321,
        ctr: 0.0278,
        position: 8.4,
      },
      {
        url: 'https://example.com/',
        clicks: 45,
        impressions: 900,
        ctr: 0.05,
        position: 3.1,
      },
    ],
    totalRows: 2,
    capped: false,
  })
  assert.deepEqual(evidence.queries, {
    rows: [
      {
        query: 'widget store',
        clicks: 80,
        impressions: 600,
        ctr: 0.5,
        position: 1.2,
      },
      {
        query: 'best widgets',
        clicks: 30,
        impressions: 1200,
        ctr: 0.025,
        position: 12.7,
      },
    ],
    totalRows: 2,
    capped: false,
  })
  assert.deepEqual(evidence.warnings, [])
  assert.deepEqual(evidence.caveats, [
    'Query and page tables are separate aggregates from a Search Console export; no query-to-page mapping exists and none was created.',
    'Search Console exports are partial: anonymised queries are withheld and export row caps apply, so missing rows are not zeros.',
    'This is imported evidence from the export date, not a live Search Console query.',
  ])
})

test('loadSearchConsoleExport counts invalid page URLs and keeps ctr lenient', async () => {
  const root = await fixtureDir()
  const path = join(root, 'Pages.csv')
  await writeFile(
    path,
    `${PAGES_HEADER}\n` +
      'not-a-url,10,100,1%,2\n' +
      'https://example.com/a,5,50,broken,also-broken\n' +
      'https://example.com/b,oops,50,1%,2\n',
  )
  const evidence = await loadSearchConsoleExport({ path })
  const file = evidence.files[0]
  assert.ok(file)
  assert.equal(file.table, 'pages')
  assert.equal(file.fileRows, 3)
  assert.equal(file.validRows, 1)
  assert.equal(file.invalidRows, 2)
  assert.deepEqual(evidence.pages.rows, [
    {
      url: 'https://example.com/a',
      clicks: 5,
      impressions: 50,
      ctr: null,
      position: null,
    },
  ])
  assert.deepEqual(evidence.warnings, [
    `2 rows in ${path} were invalid and skipped.`,
  ])
})

test('loadSearchConsoleExport defaults missing metric columns', async () => {
  const root = await fixtureDir()
  const path = join(root, 'Queries.csv')
  await writeFile(path, 'Query\nbest widgets\n')
  const evidence = await loadSearchConsoleExport({ path })
  assert.deepEqual(evidence.queries.rows, [
    {
      query: 'best widgets',
      clicks: 0,
      impressions: 0,
      ctr: null,
      position: null,
    },
  ])
})

test('loadSearchConsoleExport keeps the duplicate with more impressions', async () => {
  const root = await fixtureDir()
  const path = join(root, 'Queries.csv')
  await writeFile(
    path,
    `${QUERIES_HEADER}\n` +
      'best widgets,10,100,1%,4\n' +
      'best widgets,3,900,1%,9\n' +
      'best widgets,3,900,1%,20\n',
  )
  const evidence = await loadSearchConsoleExport({ path })
  const file = evidence.files[0]
  assert.ok(file)
  assert.equal(file.validRows, 1)
  assert.equal(file.duplicateRows, 2)
  assert.equal(evidence.queries.totalRows, 1)
  const row = evidence.queries.rows[0]
  assert.ok(row)
  assert.equal(row.impressions, 900)
  assert.equal(row.position, 9)
})

test('loadSearchConsoleExport caps supplied rows at the row limit', async () => {
  const root = await fixtureDir()
  const path = join(root, 'Queries.csv')
  const lines = [QUERIES_HEADER]
  for (let index = 0; index < 5; index += 1) {
    lines.push(`query ${index},1,${10 - index},1%,5`)
  }
  await writeFile(path, `${lines.join('\n')}\n`)
  const evidence = await loadSearchConsoleExport({ path, rowLimit: 3 })
  const file = evidence.files[0]
  assert.ok(file)
  assert.equal(file.fileRows, 5)
  assert.equal(file.suppliedRows, 3)
  assert.equal(file.capped, true)
  assert.equal(file.rowLimit, 3)
  assert.equal(evidence.queries.totalRows, 3)
  assert.equal(evidence.queries.capped, true)
  assert.deepEqual(
    evidence.queries.rows.map((row) => row.query),
    ['query 0', 'query 1', 'query 2'],
  )
  assert.deepEqual(evidence.warnings, [
    `Only the first 3 of 5 rows in ${path} were read.`,
  ])
})

test('loadSearchConsoleExport records unrecognized headers without guessing', async () => {
  const root = await fixtureDir()
  await writeFile(
    join(root, 'Countries.csv'),
    'Country,Clicks,Impressions,CTR,Position\nusa,1,2,1%,3\n',
  )
  await writeFile(
    join(root, 'Queries.csv'),
    `${QUERIES_HEADER}\nbest widgets,1,2,1%,3\n`,
  )
  const evidence = await loadSearchConsoleExport({ path: root })
  const skipped = evidence.files[0]
  assert.ok(skipped)
  assert.equal(skipped.table, 'unrecognized')
  assert.equal(
    skipped.reason,
    'The first header "Country" is not a recognized Search Console query or page column.',
  )
  assert.equal(skipped.fileRows, 1)
  assert.equal(skipped.suppliedRows, 0)
  assert.equal(skipped.validRows, 0)
  assert.equal(evidence.warnings.length, 1)
  assert.match(evidence.warnings[0] ?? '', /Countries\.csv/)
  assert.equal(evidence.queries.totalRows, 1)
})

test('loadSearchConsoleExport rejects missing paths and empty directories', async () => {
  const root = await fixtureDir()
  await assert.rejects(
    loadSearchConsoleExport({ path: join(root, 'missing') }),
    /was not found/,
  )
  await assert.rejects(loadSearchConsoleExport({ path: root }), /no CSV files/)
})

test('loadSearchConsoleExport output is deterministic across runs', async () => {
  const root = await fixtureDir()
  await writeFile(
    join(root, 'Pages.csv'),
    `${PAGES_HEADER}\n` +
      'https://example.com/b,5,100,1%,2\n' +
      'https://example.com/a,5,100,1%,2\n' +
      'https://example.com/c,9,100,1%,2\n',
  )
  const now = new Date('2026-08-11T00:00:00Z')
  const first = await loadSearchConsoleExport({ path: root, now })
  const second = await loadSearchConsoleExport({ path: root, now })
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.deepEqual(
    first.pages.rows.map((row) => row.url),
    ['https://example.com/c', 'https://example.com/a', 'https://example.com/b'],
  )
})

test('reconcileExportPagesWithCrawl joins by path across origins', () => {
  const result = reconcileExportPagesWithCrawl({
    pages: [
      pageRow('https://example.com/blog/first-article', 10, 100),
      pageRow('https://example.com/blog/second-article/', 4, 400),
      pageRow('https://example.com/gone?page=2', 4, 400),
      pageRow('https://example.com/lost', 4, 50),
    ],
    crawledUrls: [
      'http://127.0.0.1:9999/blog/first-article',
      'http://127.0.0.1:9999/blog/second-article',
      'not a url',
    ],
    crawlOrigin: 'http://127.0.0.1:9999',
  })
  assert.equal(result.joinBasis, 'path')
  assert.equal(result.crawlOrigin, 'http://127.0.0.1:9999')
  assert.deepEqual(result.exportOrigins, ['https://example.com'])
  assert.equal(result.originMismatch, true)
  assert.equal(result.matchedPages, 2)
  assert.equal(result.unreachedCount, 2)
  assert.equal(result.capped, false)
  assert.deepEqual(
    result.unreachedPages.map((row) => row.url),
    ['https://example.com/gone?page=2', 'https://example.com/lost'],
  )
})

test('reconcileExportPagesWithCrawl sorts and caps unreached pages', () => {
  const result = reconcileExportPagesWithCrawl({
    pages: [
      pageRow('https://example.com/c', 2, 100),
      pageRow('https://example.com/a', 2, 100),
      pageRow('https://example.com/b', 9, 100),
      pageRow('https://example.com/d', 1, 500),
    ],
    crawledUrls: [],
    crawlOrigin: 'https://example.com',
    limit: 3,
  })
  assert.equal(result.originMismatch, false)
  assert.equal(result.matchedPages, 0)
  assert.equal(result.unreachedCount, 4)
  assert.equal(result.capped, true)
  assert.deepEqual(
    result.unreachedPages.map((row) => row.url),
    ['https://example.com/d', 'https://example.com/b', 'https://example.com/a'],
  )
})

test('reconcileExportPagesWithCrawl keeps the root path distinct', () => {
  const result = reconcileExportPagesWithCrawl({
    pages: [pageRow('https://example.com/', 1, 10)],
    crawledUrls: ['http://localhost:8080/'],
    crawlOrigin: 'http://localhost:8080',
  })
  assert.equal(result.matchedPages, 1)
  assert.equal(result.unreachedCount, 0)
})
