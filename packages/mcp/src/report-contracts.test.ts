import assert from 'node:assert/strict'
import test from 'node:test'
import { getReportDefinition } from './report-registry.js'
import { runReport } from './reports.js'

function reportSchema(id: string) {
  const report = getReportDefinition(id)
  assert.ok(report, `Missing report definition: ${id}`)
  return report.inputSchema
}

test('calendar-month report inputs require a valid YYYY-MM value', () => {
  for (const id of ['monthly-report', 'monthly-action-plan']) {
    const schema = reportSchema(id)
    assert.equal(
      schema.safeParse({ site: 'sc-domain:example.com', month: '2026-05' })
        .success,
      true,
      id,
    )
    for (const month of ['2026-5', '2026-00', '2026-13', 'May 2026']) {
      assert.equal(
        schema.safeParse({ site: 'sc-domain:example.com', month }).success,
        false,
        `${id}: ${month}`,
      )
    }
  }
})

test('calendar-date report inputs reject malformed and impossible dates', () => {
  const cases = [
    { id: 'ai-referrals', field: 'startDate', required: { property: '123' } },
    {
      id: 'community-intent',
      field: 'startDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'measure-change',
      field: 'changedAt',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'narrative-report',
      field: 'endDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'segment-impact',
      field: 'startDate',
      required: { site: 'sc-domain:example.com' },
    },
    {
      id: 'seo-to-ai-query',
      field: 'endDate',
      required: { site: 'sc-domain:example.com' },
    },
  ] as const

  for (const { id, field, required } of cases) {
    const schema = reportSchema(id)
    assert.equal(
      schema.safeParse({ ...required, [field]: '2026-06-28' }).success,
      true,
      id,
    )
    for (const date of ['2026-6-28', '2026-02-30', '2026-13-01', 'yesterday']) {
      const allowsRelativeGoogleAnalyticsDate =
        id === 'ai-referrals' && date === 'yesterday'
      assert.equal(
        schema.safeParse({ ...required, [field]: date }).success,
        allowsRelativeGoogleAnalyticsDate,
        `${id}: ${date}`,
      )
    }
  }
})

test('AI referral output limits are bounded separately from provider rows', () => {
  const schema = reportSchema('ai-referrals')
  assert.equal(
    schema.safeParse({ property: '123', maxRows: 100_000, resultLimit: 25 })
      .success,
    true,
  )
  for (const resultLimit of [0, 1.5, 1_001]) {
    assert.equal(
      schema.safeParse({ property: '123', resultLimit }).success,
      false,
      String(resultLimit),
    )
  }
})

test('link evidence bounds provider work, imports, and returned rows', () => {
  const schema = reportSchema('link-evidence')
  assert.equal(
    schema.safeParse({
      file: './links.jsonl',
      format: 'jsonl',
      rowLimit: 100_000,
      limit: 500,
    }).success,
    true,
  )
  assert.equal(
    schema.safeParse({
      site: 'https://example.com/',
      rowLimit: 1_000,
      targetLimit: 50,
      detailPagesPerTarget: 3,
    }).success,
    true,
  )
  for (const input of [
    { file: './links.csv', rowLimit: 100_001 },
    { file: './links.csv', limit: 501 },
    { site: 'https://example.com/', targetLimit: 51 },
    { site: 'https://example.com/', detailPagesPerTarget: 4 },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('keyword metrics bounds market and keyword acquisition inputs', () => {
  const schema = reportSchema('keyword-metrics')
  assert.equal(
    schema.safeParse({
      keywords: ['seo audit tool', 'technical seo audit'],
      countryCode: 'GB',
      languageCode: 'en-GB',
      location: { name: 'London,England,United Kingdom' },
      device: 'mobile',
      provider: 'dataforseo',
    }).success,
    true,
  )
  for (const input of [
    { keywords: [], countryCode: 'GB', languageCode: 'en' },
    {
      keywords: Array.from({ length: 51 }, (_, index) => `keyword ${index}`),
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      keywords: ['one two three four five six seven eight nine ten eleven'],
      countryCode: 'GB',
      languageCode: 'en',
    },
    { keywords: ['keyword'], countryCode: 'GBR', languageCode: 'en' },
    { keywords: ['keyword'], countryCode: 'GB', languageCode: 'english' },
    {
      keywords: ['keyword'],
      countryCode: 'GB',
      languageCode: 'en',
      location: {},
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('keyword research bounds seeds, sources, market, and retained rows', () => {
  const schema = reportSchema('keyword-research')
  assert.equal(
    schema.safeParse({
      seeds: ['local seo', 'seo tools'],
      sources: ['ideas', 'suggestions'],
      countryCode: 'GB',
      languageCode: 'en',
      location: { name: 'London,England,United Kingdom' },
      limit: 100,
    }).success,
    true,
  )
  for (const input of [
    { seeds: [], countryCode: 'GB', languageCode: 'en' },
    {
      seeds: ['one', 'two', 'three', 'four', 'five', 'six'],
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      seeds: ['seed'],
      sources: [],
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      seeds: ['seed'],
      countryCode: 'GB',
      languageCode: 'en',
      limit: 101,
    },
    {
      seeds: ['one', 'two', 'three'],
      sources: ['related', 'suggestions'],
      countryCode: 'GB',
      languageCode: 'en',
      limit: 5,
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('saved keywords bounds local set views', () => {
  const schema = reportSchema('saved-keywords')
  assert.equal(
    schema.safeParse({
      projectId: 'example-project',
      set: 'priority',
      tag: 'service',
      limit: 1_000,
      offset: 100_000,
      staleDays: 365,
    }).success,
    true,
  )
  for (const input of [
    { projectId: '', set: 'priority' },
    { projectId: 'example-project', set: '' },
    { projectId: 'example-project', set: 'priority', limit: 1_001 },
    { projectId: 'example-project', set: 'priority', offset: 100_001 },
    { projectId: 'example-project', set: 'priority', staleDays: 366 },
    { projectId: 'example-project', set: 'priority', unknown: true },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('SERP results bounds query, market, device, and depth', () => {
  const schema = reportSchema('serp-results')
  assert.equal(
    schema.safeParse({
      keyword: 'local seo',
      countryCode: 'GB',
      languageCode: 'en',
      device: 'mobile',
      depth: 100,
    }).success,
    true,
  )
  for (const input of [
    { keyword: '', countryCode: 'GB', languageCode: 'en' },
    {
      keyword: 'one two three four five six seven eight nine ten eleven',
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      keyword: 'query',
      countryCode: 'GB',
      languageCode: 'en',
      depth: 101,
    },
    {
      keyword: 'query',
      countryCode: 'GB',
      languageCode: 'en',
      device: 'tablet',
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('keyword opportunities keeps external acquisition explicit and bounded', () => {
  const schema = reportSchema('keyword-opportunities')
  assert.equal(
    schema.safeParse({ site: 'sc-domain:example.com' }).success,
    true,
  )
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      location: {
        code: 1006886,
        name: 'London,England,United Kingdom',
      },
      limit: 25,
      keywordLimit: 50,
      queriesPerPage: 5,
      clusterLimit: 20,
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', includeExternal: true },
    { site: 'sc-domain:example.com', countryCode: 'GB', languageCode: 'en' },
    { site: 'sc-domain:example.com', provider: 'dataforseo' },
    { site: 'sc-domain:example.com', limit: 26 },
    { site: 'sc-domain:example.com', keywordLimit: 51 },
    { site: 'sc-domain:example.com', queriesPerPage: 6 },
    { site: 'sc-domain:example.com', clusterLimit: 21 },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('pSEO opportunities keeps provider work explicit and bounded', () => {
  const schema = reportSchema('pseo-opportunities')
  const defaults = schema.safeParse({ site: 'sc-domain:example.com' })
  assert.equal(defaults.success, true)
  if (defaults.success) {
    assert.deepEqual(defaults.data.discoverySources, ['suggestions'])
  }
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      discoverySources: ['ideas', 'related'],
      discoveryLimit: 30,
      candidateLimit: 25,
      serpLimit: 3,
      serpDepth: 20,
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', includeExternal: true },
    { site: 'sc-domain:example.com', countryCode: 'GB', languageCode: 'en' },
    { site: 'sc-domain:example.com', serpLimit: 1 },
    { site: 'sc-domain:example.com', templateLimit: 26 },
    { site: 'sc-domain:example.com', clusterLimit: 26 },
    { site: 'sc-domain:example.com', discoveryLimit: 101 },
    { site: 'sc-domain:example.com', candidateLimit: 26 },
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      serpLimit: 4,
    },
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      serpDepth: 21,
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('server log analysis bounds streamed work and returned rows', () => {
  const schema = reportSchema('server-log-analysis')
  assert.equal(
    schema.safeParse({
      file: './access.log',
      format: 'combined',
      rowLimit: 10_000_000,
      pathLimit: 100_000,
      limit: 500,
    }).success,
    true,
  )
  for (const input of [
    { file: './access.log', rowLimit: 10_000_001 },
    { file: './access.log', pathLimit: 100_001 },
    { file: './access.log', limit: 501 },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('technical-watch accepts active components and rejects a true no-op', async () => {
  const schema = reportSchema('technical-watch')
  for (const input of [
    { site: 'sc-domain:example.com' },
    {
      site: 'sc-domain:example.com',
      startUrl: 'https://example.com/',
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/page'],
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      sitemaps: ['https://example.com/sitemap.xml'],
      recoverLinks: false,
    },
  ]) {
    assert.equal(schema.safeParse(input).success, true, JSON.stringify(input))
  }

  const noOp = { site: 'sc-domain:example.com', recoverLinks: false }
  assert.equal(schema.safeParse(noOp).success, false)

  const result = await runReport('technical-watch', noOp)
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'Invalid parameters for technical-watch: recoverLinks: Pass startUrl, urls, sitemaps, or enable link recovery for technical-watch.',
      retryable: false,
    },
  })
})

test('technical-watch bounds nonblank strings, arrays, and counts', () => {
  const schema = reportSchema('technical-watch')
  const invalid = [
    { site: '' },
    { site: 'sc-domain:example.com', urls: [] },
    {
      site: 'sc-domain:example.com',
      urls: [
        'https://example.com/x',
        ...Array(100).fill('https://example.com/y'),
      ],
    },
    { site: 'sc-domain:example.com', sitemaps: [] },
    { site: 'sc-domain:example.com', properties: [''] },
    { site: 'sc-domain:example.com', limit: 0 },
    { site: 'sc-domain:example.com', limit: 1.5 },
    { site: 'sc-domain:example.com', dailyLimit: 2_001 },
    { site: 'sc-domain:example.com', inspectLimit: 101 },
    { site: 'sc-domain:example.com', maxUrls: 250_001 },
    { site: 'sc-domain:example.com', recoverDays: 549 },
    { site: 'sc-domain:example.com', recoverLimit: 101 },
    { site: 'sc-domain:example.com', recoverMinClicks: -1 },
    { site: 'sc-domain:example.com', recoverMinImpressions: 1.5 },
  ]

  for (const input of invalid) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('index coverage requires a site and bounds crawl, sitemap, and output inputs', () => {
  const schema = reportSchema('index-coverage')
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      crawlReportId: 'crawl_saved',
      sitemaps: ['https://example.com/sitemap.xml'],
      days: 90,
      rowLimit: 100_000,
      maxSitemapUrls: 100_000,
      itemsPerSection: 100,
      templateClusters: 50,
      templateSamples: 5,
    }).success,
    true,
  )

  for (const input of [
    {},
    { site: '' },
    { site: 'sc-domain:example.com', crawlReportId: '' },
    { site: 'sc-domain:example.com', sitemaps: [] },
    {
      site: 'sc-domain:example.com',
      sitemaps: Array(21).fill('https://example.com/sitemap.xml'),
    },
    { site: 'sc-domain:example.com', days: 549 },
    { site: 'sc-domain:example.com', rowLimit: 250_001 },
    { site: 'sc-domain:example.com', maxSitemapUrls: 0 },
    { site: 'sc-domain:example.com', itemsPerSection: 1_001 },
    { site: 'sc-domain:example.com', templateClusters: 201 },
    { site: 'sc-domain:example.com', templateSamples: 26 },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})
