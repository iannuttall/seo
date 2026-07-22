import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  competitorKeywordGapReport,
  rankedKeywordsReport,
  rankingPagesReport,
  serpCompetitorsReport,
} from '../../analyze/domain-research.js'
import type { ResearchImportSource } from '../domain-contracts.js'
import { ResearchImportProvider } from './research-provider.js'

const market = {
  searchEngine: 'google' as const,
  countryCode: 'US',
  languageCode: 'en',
}

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
    provider: 'semrush',
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
    const provider = new ResearchImportProvider([source(path)])
    const result = await provider.rankedKeywords({
      target: 'shop.example',
      market,
      limit: 50,
    })

    assert.equal(result.provider, 'semrush')
    assert.equal(result.observedAt, '2026-07-20T12:00:00.000Z')
    assert.equal(result.cost.actualMicros, 0)
    assert.equal(result.coverage.completeness, 'partial')
    assert.equal(result.coverage.invalidRows, 1)
    assert.equal(result.data.rows.length, 2)
    assert.equal(result.imports?.[0]?.encoding, 'utf-8')
    assert.equal(result.imports?.[0]?.delimiter, ';')
    assert.equal(result.data.rows[0]?.rankAbsolute, 2)
    assert.deepEqual(result.data.rows[0]?.monthlySearchVolume, {
      state: 'observed',
      value: 0,
    })
    assert.equal(result.imports?.[0]?.duplicateRows, 1)
    assert.equal(result.imports?.[0]?.bytesRead, Buffer.byteLength(body))
    assert.equal(result.imports?.[0]?.fileBytes, Buffer.byteLength(body))
    assert.equal(result.imports?.[0]?.fileRows, 4)
    assert.equal(
      result.imports?.[0]?.sha256,
      createHash('sha256').update(body).digest('hex'),
    )
    assert.ok(result.imports?.[0]?.includedFields.includes('Search Volume'))
    assert.match(
      result.warnings.find((warning) => warning.code === 'invalid-import-rows')
        ?.message ?? '',
      /1 imported row/u,
    )
  })
})

test('Semrush percentage fields keep their own meaning', async () => {
  const body = [
    'Keyword,Position,URL,Traffic %,KD %,Intents',
    'alpha shoes,4,https://shop.example/alpha,12.5%,21%,Commercial',
  ].join('\n')
  await fixture('semrush-percentages.csv', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    const result = await provider.rankedKeywords({
      target: 'shop.example',
      market,
      limit: 10,
    })

    assert.deepEqual(result.data.rows[0]?.keywordDifficulty, {
      state: 'observed',
      value: 21,
    })
    assert.equal(result.data.rows[0]?.intent.state, 'observed')
    assert.equal(result.data.rows[0]?.estimatedMonthlyTraffic.state, 'missing')
  })
})

test('custom column mappings override aliases and stay in provenance', async () => {
  const body = [
    'Search Term,Destination,Reported Rank,Position,Monthly Demand,Estimated Visits,Traffic %,Kind',
    'custom shoes,https://shop.example/custom,7,99,900,42,4.2%,Local pack',
  ].join('\n')
  await fixture('custom-rankings.csv', body, async (path) => {
    const provider = new ResearchImportProvider([
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
    const result = await provider.rankedKeywords({
      target: 'shop.example',
      market,
      limit: 10,
    })
    const row = result.data.rows[0]

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
    assert.deepEqual(result.imports?.[0]?.columnMapping, {
      keyword: 'Search Term',
      url: 'Destination',
      position: 'Reported Rank',
      searchVolume: 'Monthly Demand',
      estimatedTraffic: 'Estimated Visits',
      resultType: 'Kind',
    })
  })
})

test('custom column mappings reject missing and reused source fields', async () => {
  const body = [
    'Search Term,Destination,Reported Rank',
    'custom shoes,https://shop.example/custom,7',
  ].join('\n')
  await fixture('invalid-column-map.csv', body, async (path) => {
    const missing = new ResearchImportProvider([
      source(path, { columns: { keyword: 'Unknown Term' } }),
    ])
    await assert.rejects(
      missing.rankedKeywords({
        target: 'shop.example',
        market,
        limit: 10,
      }),
      /keyword.*missing source column "Unknown Term"/u,
    )

    const reused = new ResearchImportProvider([
      source(path, {
        columns: {
          keyword: 'Search Term',
          url: 'search-term',
        },
      }),
    ])
    await assert.rejects(
      reused.rankedKeywords({
        target: 'shop.example',
        market,
        limit: 10,
      }),
      /cannot map "keyword" and "url" to the same source column/u,
    )
  })
})

test('Semrush Organic Positions exports map current headers into stable fields', async () => {
  const body = [
    'Keyword,Position,Previous position,Search Volume,Keyword Difficulty,CPC,URL,Traffic,Traffic (%),Traffic Cost,Competition,Number of Results,Trends,Timestamp,SERP Features by Keyword,Keyword Intents,Position Type',
    'research tools,1,2,90,82,0.00,https://docs.example/tools,7,12.5,0.00,0.01,104,"43, 14, 100",2026-06-26,"Reviews, People also ask","Commercial, Informational",People also ask',
    'provider research,3,4,320,26,1.25,https://docs.example/providers,11,20,4.50,0.33,157,"44, 18, 81",2026-07-14,"Sitelinks, AI overview",informational,AI overview',
  ].join('\n')
  await fixture('semrush-organic-positions.csv', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    const result = await provider.rankedKeywords({
      target: 'docs.example',
      market,
      limit: 10,
    })

    assert.equal(result.data.rows.length, 2)
    assert.equal(result.imports?.[0]?.encoding, 'utf-8')
    assert.equal(result.imports?.[0]?.delimiter, ',')
    assert.equal(result.data.rows[0]?.resultType, 'people_also_ask')
    assert.deepEqual(result.data.rows[0]?.intent, {
      state: 'observed',
      value: 'informational, commercial',
    })
    assert.deepEqual(result.data.rows[0]?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 7,
    })
    assert.deepEqual(
      result.data.rows[0]?.searchVolumeUpdatedAt.state,
      'missing',
    )
    assert.equal(result.data.rows[1]?.resultType, 'ai_overview_reference')
    assert.ok(result.imports?.[0]?.includedFields.includes('Keyword Intents'))
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
    const provider = new ResearchImportProvider([
      source(path, { provider: 'ahrefs' }),
    ])
    const result = await provider.rankedKeywords({
      target: 'docs.example',
      market,
      limit: 10,
    })

    assert.equal(result.data.rows.length, 2)
    assert.equal(result.imports?.[0]?.encoding, 'utf-16le')
    assert.equal(result.imports?.[0]?.delimiter, '\t')
    assert.equal(result.data.rows[0]?.resultType, 'image_pack')
    assert.deepEqual(result.data.rows[0]?.intent, {
      state: 'observed',
      value: 'informational, commercial',
    })
    assert.deepEqual(result.data.rows[0]?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 47_389,
    })
    assert.equal(result.data.rows[0]?.searchVolumeUpdatedAt.state, 'missing')
    assert.equal(result.data.rows[1]?.resultType, 'organic')
    assert.equal(result.imports?.[0]?.bytesRead, body.byteLength)
    assert.equal(result.imports?.[0]?.fileBytes, body.byteLength)
    assert.equal(result.imports?.[0]?.fileRows, 3)
    assert.equal(result.imports?.[0]?.filteredRows, 1)
    assert.equal(result.imports?.[0]?.invalidRows, 0)
    assert.equal(
      result.imports?.[0]?.sha256,
      createHash('sha256').update(body).digest('hex'),
    )
    assert.ok(result.imports?.[0]?.includedFields.includes('Current URL'))
    assert.equal(
      result.warnings.some(
        (warning) => warning.code === 'historical-import-rows',
      ),
      true,
    )
    assert.equal(
      result.imports?.[0]?.includedFields.some((field) => field.includes('\0')),
      false,
    )
  })
})

test('DataForSEO flattened fields keep grouped and absolute ranks distinct', async () => {
  const body = [
    [
      'keyword_data.keyword',
      'ranked_serp_element.serp_item.rank_group',
      'ranked_serp_element.serp_item.rank_absolute',
      'ranked_serp_element.serp_item.url',
      'ranked_serp_element.serp_item.type',
      'keyword_data.keyword_info.search_volume',
      'keyword_data.keyword_properties.keyword_difficulty',
      'keyword_data.search_intent_info.main_intent',
      'keyword_data.serp_info.se_results_count',
      'ranked_serp_element.serp_item.etv',
    ].join(','),
    [
      'provider contract',
      '4',
      '7',
      'https://docs.example/provider-contract',
      'organic',
      '90',
      '12',
      'informational',
      '5000',
      '8.5',
    ].join(','),
  ].join('\n')
  await fixture('dataforseo-ranked.csv', body, async (path) => {
    const provider = new ResearchImportProvider([
      source(path, { provider: 'dataforseo' }),
    ])
    const result = await provider.rankedKeywords({
      target: 'docs.example',
      market,
      limit: 10,
    })
    const row = result.data.rows[0]

    assert.equal(row?.rankGroup, 4)
    assert.equal(row?.rankAbsolute, 7)
    assert.deepEqual(row?.resultCount, { state: 'observed', value: 5_000 })
    assert.deepEqual(row?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 8.5,
    })
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
    const provider = new ResearchImportProvider([
      source(path, { provider: 'ahrefs', rowLimit: 3 }),
    ])
    const result = await provider.rankedKeywords({
      target: 'example.com',
      market,
      limit: 10,
    })

    assert.equal(result.provider, 'ahrefs')
    assert.equal(result.imports?.[0]?.suppliedRows, 3)
    assert.equal(result.imports?.[0]?.fileRows, 1_000)
    assert.equal(result.imports?.[0]?.capped, true)
    assert.equal(result.imports?.[0]?.bytesRead, Buffer.byteLength(body))
    assert.equal(result.coverage.completeness, 'capped')
    assert.equal(result.data.rows.length, 3)
  })
})

test('malformed JSONL rows stay visible without invalidating useful rows', async () => {
  const body = [
    JSON.stringify({
      keyword: 'valid term',
      position: 3,
      url: 'https://example.com/valid',
    }),
    '{not json}',
    JSON.stringify({ keyword: 'missing url', position: 4 }),
  ].join('\n')
  await fixture('rankings.ndjson', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    const result = await provider.rankedKeywords({
      target: 'example.com',
      market,
      limit: 10,
    })

    assert.equal(result.data.rows.length, 1)
    assert.equal(result.imports?.[0]?.suppliedRows, 3)
    assert.equal(result.imports?.[0]?.invalidRows, 2)
    assert.equal(result.coverage.completeness, 'partial')
  })
})

test('populated imports with no usable rows fail clearly', async () => {
  const body = [
    'Keyword,Position,URL',
    'missing URL,3,',
    'bad URL,4,not-a-url',
  ].join('\n')
  await fixture('invalid-rankings.csv', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    await assert.rejects(
      provider.rankedKeywords({
        target: 'example.com',
        market,
        limit: 10,
      }),
      /contained no valid ranked-keyword rows/u,
    )
  })
})

test('UTF-32 CSV imports fail with an actionable encoding error', async () => {
  const body = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x4b, 0x00, 0x00, 0x00])
  await fixture('utf32-rankings.csv', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    await assert.rejects(
      provider.rankedKeywords({
        target: 'example.com',
        market,
        limit: 10,
      }),
      /UTF-32 imports are not supported/u,
    )
  })
})

test('ranking pages and SERP competitors aggregate the same typed import', async () => {
  const body = JSON.stringify([
    {
      keyword: 'red shoes',
      position: 2,
      url: 'https://one.example/shoes/red',
      traffic: 10,
    },
    {
      keyword: 'blue shoes',
      position: 5,
      url: 'https://one.example/shoes/blue',
      traffic: 4,
    },
    {
      keyword: 'red shoes',
      position: 6,
      url: 'https://two.example/red-shoes',
      traffic: 3,
    },
    {
      keyword: 'blue shoes',
      position: 9,
      url: 'https://two.example/blue-shoes',
      traffic: 2,
    },
  ])
  await fixture('rankings.json', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    const pages = await provider.rankingPages({
      domain: 'one.example',
      market,
      limit: 10,
    })
    assert.equal(pages.data.rows.length, 2)
    assert.equal(
      pages.data.rows[0]?.organic.rankedKeywords.state === 'observed'
        ? pages.data.rows[0].organic.rankedKeywords.value
        : null,
      1,
    )

    const competitors = await provider.serpCompetitors({
      keywords: ['red shoes', 'blue shoes'],
      market,
      limit: 10,
    })
    assert.deepEqual(
      competitors.data.rows.map((row) => [row.domain, row.matchedKeywords]),
      [
        ['one.example', 2],
        ['two.example', 2],
      ],
    )
    assert.deepEqual(competitors.data.rows[0]?.averagePosition, {
      state: 'observed',
      value: 3.5,
    })
    assert.equal(competitors.data.rows[0]?.visibility.state, 'missing')
  })
})

test('ranking-page footprints keep unique keywords separate from result rows', async () => {
  const body = JSON.stringify([
    {
      keyword: 'shared query',
      position: 1,
      url: 'https://one.example/shared',
      resultType: 'organic',
      traffic: 10,
    },
    {
      keyword: 'shared query',
      position: 1,
      url: 'https://one.example/shared',
      resultType: 'ai_overview_reference',
      traffic: 2,
    },
  ])
  await fixture('ranking-result-types.json', body, async (path) => {
    const provider = new ResearchImportProvider([source(path)])
    const result = await provider.rankingPages({
      domain: 'one.example',
      market,
      limit: 10,
    })
    const footprint = result.data.rows[0]?.organic

    assert.deepEqual(footprint?.rankedKeywords, {
      state: 'observed',
      value: 1,
    })
    assert.deepEqual(footprint?.rankings, {
      state: 'observed',
      value: { first: 2, top3: 2, top10: 2, top20: 2, top50: 2, top100: 2 },
    })
    assert.deepEqual(footprint?.estimatedMonthlyTraffic, {
      state: 'observed',
      value: 12,
    })
  })
})

test('ranking-pages report combines import groups with retained Search Console pages', async () => {
  const body = JSON.stringify([
    {
      keyword: 'red shoes',
      position: 2,
      url: 'https://shop.example/catalog/red',
      traffic: 10,
    },
    {
      keyword: 'blue shoes',
      position: 5,
      url: 'https://shop.example/catalog/blue',
      traffic: 4,
    },
  ])
  await fixture('ranking-pages.json', body, async (path) => {
    const report = await rankingPagesReport(
      {
        domain: 'shop.example',
        site: 'sc-domain:shop.example',
        market,
        researchFiles: [source(path, { provider: 'ahrefs' })],
      },
      {
        now: () => new Date('2026-07-22T12:00:00Z'),
        searchAnalytics: async () => ({
          rows: [
            {
              keys: ['https://shop.example/catalog/red'],
              clicks: 8,
              impressions: 80,
              ctr: 0.1,
              position: 3,
            },
          ],
          calls: 1,
          rowsFetched: 1,
        }),
      },
    )

    assert.equal(report.summary.providerRows, 2)
    assert.equal(report.summary.searchConsoleMatchedPages, 1)
    assert.equal(report.firstParty.status, 'complete')
    assert.equal(report.firstParty.matches[0]?.clicks, 8)
    assert.equal(report.evidence.imports?.[0]?.provider, 'ahrefs')
    assert.equal(report.dataStatus, 'partial')
    assert.equal(
      report.caveats.some((caveat) =>
        caveat.includes('separate organic and search-feature rows'),
      ),
      true,
    )
  })
})

test('serp-competitors report classifies imported multi-domain evidence', async () => {
  const body = JSON.stringify([
    {
      keyword: 'red shoes',
      position: 2,
      url: 'https://shop.example/red',
    },
    {
      keyword: 'blue shoes',
      position: 3,
      url: 'https://shop.example/blue',
    },
    {
      keyword: 'red shoes',
      position: 5,
      url: 'https://rival.example/red',
    },
    {
      keyword: 'blue shoes',
      position: 7,
      url: 'https://rival.example/blue',
    },
  ])
  await fixture('serp-competitors.json', body, async (path) => {
    const report = await serpCompetitorsReport(
      {
        keywords: ['blue shoes', 'red shoes'],
        targetDomain: 'shop.example',
        declaredCompetitors: [
          { domain: 'rival.example', siteType: 'business' },
        ],
        market,
        researchFiles: [source(path)],
      },
      { now: () => new Date('2026-07-22T12:00:00Z') },
    )

    assert.equal(report.summary.retainedCompetitors, 1)
    assert.equal(report.summary.declaredCompetitorsFound, 1)
    assert.equal(report.competitors[0]?.relationship, 'self')
    assert.equal(report.competitors[1]?.relationship, 'declared-competitor')
    assert.equal(report.competitors[1]?.visibility, null)
    assert.equal(report.evidence.imports?.length, 1)
    assert.equal(report.dataStatus, 'partial')
  })
})

test('multiple files combine sequentially for competitor work and retain each export', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-research-import-'))
  const first = join(directory, 'first.json')
  const second = join(directory, 'second.json')
  try {
    await writeFile(
      first,
      JSON.stringify([
        {
          keyword: 'shared query',
          position: 3,
          url: 'https://one.example/shared',
          volume: 100,
        },
      ]),
    )
    await writeFile(
      second,
      JSON.stringify([
        {
          keyword: 'shared query',
          position: 6,
          url: 'https://two.example/shared',
          volume: 100,
        },
        {
          keyword: 'shared query',
          position: 4,
          url: 'https://one.example/shared',
          volume: 100,
        },
      ]),
    )
    const provider = new ResearchImportProvider([
      source(first),
      source(second, { exportedAt: '2026-07-21T12:00:00Z' }),
    ])
    const result = await provider.serpCompetitors({
      keywords: ['shared query', 'second query'],
      market,
      limit: 10,
    })
    const reversed = await new ResearchImportProvider([
      source(second, { exportedAt: '2026-07-21T12:00:00Z' }),
      source(first),
    ]).serpCompetitors({
      keywords: ['second query', 'shared query'],
      market,
      limit: 10,
    })

    assert.equal(result.imports?.length, 2)
    assert.ok(result.imports?.every((item) => item.provider === 'semrush'))
    assert.deepEqual(
      result.data.rows.map((row) => row.domain),
      ['one.example', 'two.example'],
    )
    assert.equal(result.data.rows[0]?.averagePosition.state, 'observed')
    assert.equal(
      result.warnings.some(
        (warning) => warning.code === 'cross-file-duplicate-rows',
      ),
      true,
    )
    assert.equal(
      result.warnings.some((warning) => warning.code === 'mixed-export-times'),
      true,
    )
    assert.deepEqual(reversed.data, result.data)
    assert.deepEqual(
      reversed.imports?.map((item) => item.path),
      result.imports?.map((item) => item.path),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('ranked keyword reports use imported evidence without provider credentials', async () => {
  const body = JSON.stringify([
    {
      Keyword: 'useful query',
      'Current position': 7,
      'Current URL': 'https://example.com/useful',
      Volume: 90,
    },
  ])
  await fixture('ahrefs.json', body, async (path) => {
    const report = await rankedKeywordsReport(
      {
        target: 'example.com',
        market,
        researchFiles: [source(path, { provider: 'ahrefs' })],
      },
      { now: () => new Date('2026-07-22T12:00:00Z') },
    )

    assert.equal(report.summary.providerRows, 1)
    assert.equal(report.evidence.provider, 'ahrefs')
    assert.equal(
      report.evidence.imports?.[0]?.exportedAt,
      '2026-07-20T12:00:00.000Z',
    )
    assert.equal(report.firstParty.status, 'not-requested')
    assert.equal(report.dataStatus, 'partial')
  })
})

test('competitor gaps can combine separate site and competitor exports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-research-import-'))
  const ownFile = join(directory, 'own.json')
  const competitorFile = join(directory, 'competitor.json')
  try {
    await writeFile(
      ownFile,
      JSON.stringify([
        {
          keyword: 'running shoes',
          position: 11,
          url: 'https://own.example/running-shoes',
          volume: 200,
        },
      ]),
    )
    await writeFile(
      competitorFile,
      JSON.stringify([
        {
          keyword: 'trail running shoes',
          position: 4,
          url: 'https://competitor.example/shoes/trail',
          volume: 120,
        },
      ]),
    )
    const report = await competitorKeywordGapReport(
      {
        site: 'sc-domain:own.example',
        competitors: [{ domain: 'competitor.example', siteType: 'business' }],
        market,
        minSearchVolume: 0,
        researchFiles: [source(ownFile), source(competitorFile)],
      },
      {
        now: () => new Date('2026-07-22T12:00:00Z'),
        searchAnalytics: async () => ({
          rows: [
            {
              keys: ['running shoes', 'https://own.example/running-shoes'],
              clicks: 10,
              impressions: 200,
              ctr: 0.05,
              position: 9,
            },
          ],
          calls: 1,
          rowsFetched: 1,
        }),
      },
    )

    assert.equal(report.source.ownDomain.status, 'partial')
    assert.equal(report.source.ownDomain.evidence?.imports?.length, 2)
    assert.equal(report.source.competitors[0]?.status, 'partial')
    assert.equal(report.source.competitors[0]?.evidence?.data.rows.length, 1)
    assert.equal(
      report.candidates.some(
        (candidate) => candidate.keyword === 'trail running shoes',
      ),
      true,
    )
    assert.match(report.caveats[0] ?? '', /local ranked-keyword files/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a conflicting provider fails before reading the local file', async () => {
  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      provider: 'dataforseo',
      researchFiles: [source('/does/not/exist.csv', { provider: 'semrush' })],
    }),
    /provider must match the research file provider/u,
  )
})

test('invalid and excessive row limits fail before reading local files', async () => {
  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      researchFiles: [source('/does/not/exist.csv', { rowLimit: 0 })],
    }),
    /row limit must be between 1 and 100000/u,
  )

  assert.throws(
    () =>
      new ResearchImportProvider(
        Array.from({ length: 5 }, (_, index) =>
          source(`/does/not/exist-${index}.csv`),
        ),
      ),
    /one to four exports/u,
  )

  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      researchFiles: Array.from({ length: 4 }, (_, index) =>
        source(`/does/not/exist-${index}.csv`, { rowLimit: 25_001 }),
      ),
    }),
    /at most 100000 rows/u,
  )

  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      researchFiles: [
        source('/does/not/exist.csv'),
        source('/does/not/../not/exist.csv'),
      ],
    }),
    /each research file once/u,
  )

  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      researchFiles: [
        source('/does/not/exist.csv', { exportedAt: 'not-a-date' }),
      ],
    }),
    /exportedAt must be a valid YYYY-MM-DD date/u,
  )

  await assert.rejects(
    rankedKeywordsReport({
      target: 'example.com',
      market,
      researchFiles: [
        source('/does/not/exist.csv', { exportedAt: '2026-07-20T12:00:00' }),
      ],
    }),
    /ISO timestamp with a timezone/u,
  )
})
