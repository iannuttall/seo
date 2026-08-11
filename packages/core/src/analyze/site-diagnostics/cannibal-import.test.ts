import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SeoError } from '../../errors.js'
import type { ResearchImportSource } from '../../providers/domain-contracts.js'
import type { GscRow } from '../../types.js'
import { type CannibalDependencies, cannibalReport } from './cannibal.js'

const CSV_BODY = [
  'Keyword,Position,URL,Search Volume',
  'project management tips,3,https://example.com/blog/project-management-tips,900',
  'project management tips,8,https://example.com/guides/project-management,900',
  'project management tips,4,https://otherdomain.com/tips,900',
  'team retro ideas,5,https://example.com/blog/retro-ideas,300',
  'project management tips,9,https://example.com/guides/project-management,900',
].join('\n')

async function fixture(
  files: Record<string, string>,
  run: (paths: Record<string, string>) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'seo-cannibal-import-'))
  try {
    const paths: Record<string, string> = {}
    for (const [name, body] of Object.entries(files)) {
      const path = join(directory, name)
      await writeFile(path, body)
      paths[name] = path
    }
    await run(paths)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function source(
  file: string,
  overrides: Partial<ResearchImportSource> = {},
): ResearchImportSource {
  return {
    dataset: 'ranked-keywords',
    file,
    provider: 'ahrefs',
    exportedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function trackedDependencies(): CannibalDependencies & { calls: () => number } {
  let calls = 0
  return {
    searchAnalytics: async () => {
      calls += 1
      return { rows: [], calls: 1, rowsFetched: 0 }
    },
    now: () => new Date('2026-08-10T12:00:00.000Z'),
    calls: () => calls,
  }
}

test('finds a keyword with two site URLs from an imported export', async () => {
  await fixture({ 'rankings.csv': CSV_BODY }, async (paths) => {
    const dependencies = trackedDependencies()
    const report = await cannibalReport(
      {
        site: 'sc-domain:example.com',
        researchFiles: [source(paths['rankings.csv'] ?? '')],
      },
      dependencies,
    )

    assert.equal(dependencies.calls(), 0)
    assert.equal(report.dataSource, 'research-import')
    assert.equal(report.siteDomain, 'example.com')
    assert.equal(report.source.provider, 'ahrefs')
    assert.equal(report.source.completeness, 'unknown')
    assert.equal(report.dataStatus, 'partial')
    assert.equal(report.methodology.finding, 'multiple-ranking-urls')

    assert.equal(report.selection.importedRows, 4)
    assert.equal(report.selection.offPropertyRows, 1)
    assert.equal(report.selection.retainedRows, 3)
    assert.equal(report.selection.singleUrlKeywords, 1)
    assert.equal(report.selection.eligibleKeywords, 1)

    const item = report.items[0]
    assert.ok(item)
    assert.equal(item.keyword, 'project management tips')
    assert.equal(item.urlCount, 2)
    assert.equal(item.providerMonthlySearchVolume, 900)
    assert.deepEqual(
      item.pages.map((page) => page.url),
      [
        'https://example.com/blog/project-management-tips',
        'https://example.com/guides/project-management',
      ],
    )
    assert.deepEqual(
      item.pages.map((page) => page.providerBestPosition),
      [3, 8],
    )
    for (const page of item.pages) {
      assert.equal(page.clicks, null)
      assert.equal(page.impressions, null)
      assert.equal(page.ctr, null)
    }

    const importEvidence = report.evidence.imports[0]
    assert.ok(importEvidence)
    assert.equal(importEvidence.provider, 'ahrefs')
    assert.equal(importEvidence.fileRows, 5)
    assert.equal(importEvidence.validRows, 4)
    assert.equal(importEvidence.duplicateRows, 1)
    assert.match(importEvidence.sha256, /^[0-9a-f]{64}$/)
    assert.match(report.summary.verdict, /1 of 1 multi-URL keyword candidate/)
  })
})

test('returns identical JSON across repeat runs and shuffled row order', async () => {
  const reversed = [
    'Keyword,Position,URL,Search Volume',
    ...CSV_BODY.split('\n').slice(1).reverse(),
  ].join('\n')
  await fixture(
    { 'rankings.csv': CSV_BODY, 'reversed.csv': reversed },
    async (paths) => {
      const dependencies = trackedDependencies()
      const input = {
        site: 'sc-domain:example.com',
        researchFiles: [source(paths['rankings.csv'] ?? '')],
      }
      const first = await cannibalReport(input, dependencies)
      const second = await cannibalReport(input, dependencies)
      assert.equal(JSON.stringify(first), JSON.stringify(second))

      const shuffled = await cannibalReport(
        {
          site: 'sc-domain:example.com',
          researchFiles: [source(paths['reversed.csv'] ?? '')],
        },
        dependencies,
      )
      assert.deepEqual(shuffled.items, first.items)
      assert.deepEqual(shuffled.selection, first.selection)
      assert.equal(dependencies.calls(), 0)
    },
  )
})

test('fails clearly when researchFiles are combined with a Search Console fetch', async () => {
  await fixture({ 'rankings.csv': CSV_BODY }, async (paths) => {
    const dependencies = trackedDependencies()
    const researchFiles = [source(paths['rankings.csv'] ?? '')]
    for (const extras of [
      { days: 28 },
      { startDate: '2026-01-01', endDate: '2026-03-31' },
      { minImpressions: 50 },
      { refresh: true },
    ]) {
      await assert.rejects(
        cannibalReport(
          { site: 'sc-domain:example.com', researchFiles, ...extras },
          dependencies,
        ),
        (error: unknown) => {
          assert.ok(error instanceof SeoError)
          assert.equal(error.code, 'INVALID_INPUT')
          assert.match(error.message, /Pick one evidence path/)
          return true
        },
      )
    }
    assert.equal(dependencies.calls(), 0)
  })
})

test('validates research file sources before reading anything', async () => {
  await fixture({ 'rankings.csv': CSV_BODY }, async (paths) => {
    const dependencies = trackedDependencies()
    const path = paths['rankings.csv'] ?? ''
    await assert.rejects(
      cannibalReport(
        {
          site: 'sc-domain:example.com',
          researchFiles: [source(path), source(path, { provider: 'semrush' })],
        },
        dependencies,
      ),
      /same provider/,
    )
    await assert.rejects(
      cannibalReport(
        {
          site: 'sc-domain:example.com',
          researchFiles: [source(path), source(path)],
        },
        dependencies,
      ),
      /each research file once/,
    )
  })
})

test('scopes imported rows to a URL-prefix property path', async () => {
  await fixture({ 'rankings.csv': CSV_BODY }, async (paths) => {
    const report = await cannibalReport(
      {
        site: 'https://example.com/blog/',
        researchFiles: [source(paths['rankings.csv'] ?? '')],
      },
      trackedDependencies(),
    )
    assert.equal(report.selection.retainedRows, 2)
    assert.equal(report.selection.offPropertyRows, 2)
    assert.equal(report.selection.eligibleKeywords, 0)
    assert.equal(report.dataStatus, 'filtered')
  })
})

test('suppresses brand keywords with multiple URLs instead of reporting them', async () => {
  const body = [
    'Keyword,Position,URL,Search Volume',
    'acme project tool,2,https://example.com/tool,400',
    'acme project tool,6,https://example.com/tools/overview,400',
  ].join('\n')
  await fixture({ 'brand.csv': body }, async (paths) => {
    const report = await cannibalReport(
      {
        site: 'sc-domain:example.com',
        researchFiles: [source(paths['brand.csv'] ?? '')],
        brandTerms: ['acme'],
      },
      trackedDependencies(),
    )
    assert.equal(report.items.length, 0)
    assert.equal(report.selection.brandKeywords, 1)
    assert.deepEqual(report.suppressionSummary, { brand_query: 1 })
    assert.equal(report.suppressed[0]?.urlCount, 2)
    assert.equal(report.dataStatus, 'filtered')
  })
})

test('keeps the Search Console path labelled and unchanged', async () => {
  const row = (query: string, page: string, impressions: number): GscRow => ({
    keys: page ? [query, page] : [query],
    clicks: 10,
    impressions,
    ctr: 10 / impressions,
    position: 5,
  })
  const report = await cannibalReport(
    { site: 'sc-domain:example.com' },
    {
      searchAnalytics: async (_site, request) => {
        const rows = request.dimensions?.includes('page')
          ? [
              row('technical seo audit', 'https://example.com/a', 60),
              row('technical seo audit', 'https://example.com/b', 60),
            ]
          : [row('technical seo audit', '', 100)]
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      now: () => new Date('2026-08-10T12:00:00.000Z'),
    },
  )
  assert.equal(report.dataSource, 'search-console-api')
  assert.equal(report.source.provider, 'google-search-console')
  assert.equal(report.summary.eligibleClusters, 1)
})
