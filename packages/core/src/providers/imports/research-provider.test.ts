import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ResearchImportSource } from '../domain-contracts.js'
import { combineResearchRows } from './research-provider.js'

async function fixture<T extends string | Uint8Array>(
  name: string,
  body: T,
  run: (path: string, body: T) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'seo-research-import-'))
  const path = join(directory, name)
  try {
    await writeFile(path, body)
    await run(path, body)
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
    provider: 'dataforseo',
    exportedAt: '2026-07-20T12:00:00Z',
    ...overrides,
  }
}

test('semicolon CSV imports map provider aliases and retain file provenance', async () => {
  const body = [
    'Keyword;Position;Search Volume;Keyword Difficulty;CPC;Competition;URL;Traffic;Intent',
    'alpha shoes;4;0;21;1.25;0.4;https://shop.example/alpha;14;Commercial',
    'alpha shoes;2;0;21;1.25;0.4;https://shop.example/alpha;15;Commercial',
    'broken row;3;10;12;0.2;0.1;not-a-url;1;Informational',
    'beta shoes;8;120;34;0.8;0.2;https://shop.example/beta;9;Transactional',
  ].join('\n')
  await fixture('rankings.csv', body, async (path) => {
    const result = await combineResearchRows([source(path)])
    const alpha = result.rows.find((row) => row.keyword === 'alpha shoes')

    assert.equal(result.imports[0]?.provider, 'dataforseo')
    assert.equal(result.imports[0]?.invalidRows, 1)
    assert.equal(result.rows.length, 2)
    assert.equal(result.imports[0]?.encoding, 'utf-8')
    assert.equal(result.imports[0]?.delimiter, ';')
    assert.equal(alpha?.rankAbsolute, 2)
    assert.deepEqual(alpha?.monthlySearchVolume, {
      state: 'observed',
      value: 0,
    })
    assert.equal(result.imports[0]?.duplicateRows, 1)
    assert.equal(result.imports[0]?.bytesRead, Buffer.byteLength(body))
    assert.equal(result.imports[0]?.fileBytes, Buffer.byteLength(body))
    assert.equal(result.imports[0]?.fileRows, 4)
    assert.equal(
      result.imports[0]?.sha256,
      createHash('sha256').update(body).digest('hex'),
    )
    assert.ok(result.imports[0]?.includedFields.includes('Search Volume'))
    assert.match(
      result.warnings.find((warning) => warning.code === 'invalid-import-rows')
        ?.message ?? '',
      /1 imported row/u,
    )
  })
})

test('custom column mappings override aliases and stay in provenance', async () => {
  const body = [
    'Search Term,Destination,Reported Rank,Position,Monthly Demand,Estimated Visits,Traffic %,Kind',
    'custom shoes,https://shop.example/custom,7,99,900,42,4.2%,Local pack',
  ].join('\n')
  await fixture('custom-rankings.csv', body, async (path) => {
    const result = await combineResearchRows([
      source(path, {
        columns: {
          keyword: 'Search Term',
          url: 'Destination',
          position: 'Reported Rank',
          searchVolume: 'Monthly Demand',
          estimatedTraffic: 'Estimated Visits',
          resultType: 'Kind',
        },
      }),
    ])
    const row = result.rows[0]

    assert.equal(row?.keyword, 'custom shoes')
    assert.equal(row?.rankGroup, 7)
    assert.equal(row?.rankAbsolute, 7)
    assert.deepEqual(row?.monthlySearchVolume, {
      state: 'observed',
      value: 900,
    })
    assert.deepEqual(row?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 42,
    })
    assert.equal(row?.resultType, 'local_pack')
    assert.deepEqual(result.imports[0]?.columnMapping, {
      keyword: 'Search Term',
      url: 'Destination',
      position: 'Reported Rank',
      searchVolume: 'Monthly Demand',
      estimatedTraffic: 'Estimated Visits',
      resultType: 'Kind',
    })
  })
})

test('Ahrefs UTF-16LE tab exports retain bytes and boolean intent fields', async () => {
  const decoded = [
    [
      'Keyword',
      'Country',
      'Language',
      'Navigational',
      'Informational',
      'Commercial',
      'Transactional',
      'SERP features',
      'Volume',
      'KD',
      'CPC',
      'Current organic traffic',
      'Previous position',
      'Previous URL',
      'Current position',
      'Current position kind',
      'Current URL',
      'Current date',
    ]
      .map((value) => `"${value}"`)
      .join('\t'),
    [
      'provider contract',
      'US',
      'English',
      'false',
      'true',
      'true',
      'false',
      'AI Overview, Image pack',
      '2120000',
      '92',
      '2.15',
      '47389',
      '25',
      'https://docs.example/provider-contract',
      '6',
      'Image pack',
      'https://docs.example/provider-contract',
      '2026-07-18 20:02:53',
    ]
      .map((value) => `"${value}"`)
      .join('\t'),
    [
      'research adapters',
      'US',
      'English',
      'false',
      'true',
      'false',
      'false',
      'Sitelinks, People also ask',
      '190000',
      '73',
      '4.13',
      '7410',
      '19',
      'https://docs.example/research-adapters',
      '9',
      '',
      'https://docs.example/research-adapters',
      '2026-07-21 20:39:45',
    ]
      .map((value) => `"${value}"`)
      .join('\t'),
    [
      'lost research term',
      'US',
      'English',
      'false',
      'true',
      'false',
      'false',
      'People also ask',
      '500',
      '20',
      '0.80',
      '',
      '10',
      'https://docs.example/lost',
      '',
      '',
      '',
      '2026-07-21 20:39:45',
    ]
      .map((value) => `"${value}"`)
      .join('\t'),
  ].join('\r\n')
  const body = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(decoded, 'utf16le'),
  ])
  await fixture('ahrefs-organic-keywords.csv', body, async (path) => {
    const result = await combineResearchRows([
      source(path, { provider: 'ahrefs' }),
    ])
    const contract = result.rows.find(
      (row) => row.keyword === 'provider contract',
    )
    const adapters = result.rows.find(
      (row) => row.keyword === 'research adapters',
    )

    assert.equal(result.rows.length, 2)
    assert.equal(result.imports[0]?.encoding, 'utf-16le')
    assert.equal(result.imports[0]?.delimiter, '\t')
    assert.equal(contract?.resultType, 'image_pack')
    assert.deepEqual(contract?.intent, {
      state: 'observed',
      value: 'informational, commercial',
    })
    assert.deepEqual(contract?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 47_389,
    })
    assert.equal(contract?.searchVolumeUpdatedAt.state, 'missing')
    assert.equal(adapters?.resultType, 'organic')
    assert.equal(result.imports[0]?.bytesRead, body.byteLength)
    assert.equal(result.imports[0]?.fileBytes, body.byteLength)
    assert.equal(result.imports[0]?.fileRows, 3)
    assert.equal(result.imports[0]?.filteredRows, 1)
    assert.equal(result.imports[0]?.invalidRows, 0)
    assert.equal(
      result.imports[0]?.sha256,
      createHash('sha256').update(body).digest('hex'),
    )
    assert.ok(result.imports[0]?.includedFields.includes('Current URL'))
    assert.equal(
      result.warnings.some(
        (warning) => warning.code === 'historical-import-rows',
      ),
      true,
    )
    assert.equal(
      result.imports[0]?.includedFields.some((field) => field.includes('\0')),
      false,
    )
  })
})

test('JSONL imports scan a bounded file for a complete hash while capping normalized rows', async () => {
  const body = Array.from({ length: 1_000 }, (_, index) =>
    JSON.stringify({
      keyword: `term ${index}`,
      position: index + 1,
      url: `https://example.com/pages/${index}`,
    }),
  ).join('\n')
  await fixture('rankings.jsonl', body, async (path) => {
    const result = await combineResearchRows([
      source(path, { provider: 'ahrefs', rowLimit: 3 }),
    ])

    assert.equal(result.imports[0]?.provider, 'ahrefs')
    assert.equal(result.imports[0]?.suppliedRows, 3)
    assert.equal(result.imports[0]?.fileRows, 1_000)
    assert.equal(result.imports[0]?.capped, true)
    assert.equal(result.imports[0]?.bytesRead, Buffer.byteLength(body))
    assert.equal(result.rows.length, 3)
  })
})
