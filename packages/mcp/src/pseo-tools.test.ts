import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPseoAuditReportFromRows } from '@seo/core'
import { compactPseoReport, registerPseoTools } from './pseo-tools.js'

type Schema = { safeParse(value: unknown): { success: boolean } }

test('pSEO MCP exposes bounded inputs and compact agent output', () => {
  let config: { inputSchema: Record<string, Schema> } | undefined
  registerPseoTools({
    registerTool(
      name: string,
      toolConfig: { inputSchema: Record<string, Schema> },
    ) {
      if (name === 'seo_pseo_audit') config = toolConfig
    },
  } as never)
  assert.ok(config)
  assert.deepEqual(Object.keys(config.inputSchema).sort(), [
    'brandTerms',
    'crawlSamples',
    'days',
    'detail',
    'fetchConcurrency',
    'fetchIntervalCap',
    'fetchIntervalMs',
    'includeBrand',
    'inspectSamples',
    'js',
    'maxSitemapUrls',
    'minimumTemplateImpressions',
    'minimumTemplateShare',
    'minimumTemplateUrls',
    'refresh',
    'site',
    'sitemaps',
    'templateLimit',
  ])
  assert.equal(config.inputSchema.crawlSamples?.safeParse(11).success, false)
  assert.equal(
    config.inputSchema.minimumTemplateShare?.safeParse(1.1).success,
    false,
  )

  const urls = [1, 2, 3].map((id) => `https://example.com/catalog/item-${id}`)
  const report = buildPseoAuditReportFromRows({
    site: 'sc-domain:example.com',
    generatedAt: '2026-07-09T00:00:00.000Z',
    range: { startDate: '2026-06-08', endDate: '2026-07-05' },
    days: 28,
    queryPageRows: urls.map((page) => ({
      query: 'catalog item',
      page,
      clicks: 1,
      impressions: 10,
      position: 4,
    })),
    pageRows: urls.map((page) => ({
      page,
      clicks: 1,
      impressions: 10,
      position: 4,
    })),
    sitemapUrls: urls,
    templateLimit: 25,
    minimumTemplateUrls: 3,
    minimumTemplateShare: 0,
    minimumTemplateImpressions: 0,
    crawlSamplesPerTemplate: 0,
    inspectionSamplesPerTemplate: 0,
    maxRowsPerRequest: 50_000,
    pageRowsFetched: 3,
    queryPageRowsFetched: 3,
    sitemapsRequested: 1,
    maxUrlsPerSitemap: 50_000,
  })
  const compact = compactPseoReport(report)
  const template = compact.templates[0]
  assert.equal(compact.schemaVersion, 1)
  assert.ok(template)
  assert.equal('samples' in template.crawl, false)
  assert.equal('samples' in template.inspection, false)
})

test('pSEO opportunity MCP validates paid inputs and forwards one typed report', async () => {
  let schema: Schema | undefined
  let handler:
    | ((input: Record<string, unknown>) => Promise<unknown>)
    | undefined
  let received: Record<string, unknown> | undefined
  registerPseoTools(
    {
      registerTool(
        name: string,
        config: { inputSchema: Schema },
        run: (input: Record<string, unknown>) => Promise<unknown>,
      ) {
        if (name !== 'seo_pseo_opportunities') return
        schema = config.inputSchema
        handler = run
      },
    } as never,
    {
      pseoOpportunitiesReport: async (input) => {
        received = input as unknown as Record<string, unknown>
        return {
          schemaVersion: 1,
          summary: { verdict: 'Fixture pSEO research report.' },
          source: {},
        } as never
      },
    },
  )

  assert.ok(schema)
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      includeExternal: true,
    }).success,
    false,
  )
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'US',
      languageCode: 'en',
      serpLimit: 4,
    }).success,
    false,
  )
  const parsed = schema.safeParse({
    site: 'sc-domain:example.com',
    includeExternal: true,
    countryCode: 'US',
    languageCode: 'en',
    device: 'mobile',
    discoverySources: ['ideas'],
    discoveryLimit: 30,
    serpLimit: 2,
  })
  assert.equal(parsed.success, true)
  assert.ok(handler)
  await handler({
    site: 'sc-domain:example.com',
    includeExternal: true,
    countryCode: 'US',
    languageCode: 'en',
    searchEngine: 'google',
    device: 'mobile',
    discoverySources: ['ideas'],
    discoveryLimit: 30,
    serpLimit: 2,
  })
  assert.deepEqual(received?.market, {
    countryCode: 'US',
    languageCode: 'en',
    searchEngine: 'google',
    location: undefined,
    device: 'mobile',
  })
  assert.equal(received?.serpLimit, 2)
})
