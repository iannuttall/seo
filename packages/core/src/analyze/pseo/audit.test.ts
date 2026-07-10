import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../../types.js'
import { completeSitemapResult } from '../monitoring/sitemap-test-fixture.js'
import {
  buildPseoAuditReportFromRows,
  pseoAuditReport,
  pseoIndexStatus,
} from './audit.js'
import type {
  PseoCrawlSample,
  PseoInspectionSample,
  PseoPageRow,
  PseoQueryPageRow,
} from './types.js'

const urls = [1, 2, 3].map((id) => `https://example.com/locations/city-${id}`)

function dataset(input: {
  pageRows?: PseoPageRow[]
  queryPageRows?: PseoQueryPageRow[]
  sitemapUrls?: string[]
  crawlSamples?: PseoCrawlSample[]
  inspectionSamples?: PseoInspectionSample[]
  templateLimit?: number
  crawlSamplesPerTemplate?: number
  inspectionSamplesPerTemplate?: number
}) {
  return buildPseoAuditReportFromRows({
    site: 'sc-domain:example.com',
    generatedAt: '2026-07-09T12:00:00.000Z',
    range: { startDate: '2026-06-08', endDate: '2026-07-05' },
    days: 28,
    queryPageRows:
      input.queryPageRows ??
      urls.map((page, index) => ({
        query: `city ${index + 1}`,
        page,
        clicks: 2,
        impressions: 20,
        position: 4,
      })),
    pageRows:
      input.pageRows ??
      urls.map((page) => ({
        page,
        clicks: 2,
        impressions: 20,
        position: 4,
      })),
    sitemapUrls: input.sitemapUrls ?? urls,
    crawlSamples: input.crawlSamples,
    inspectionSamples: input.inspectionSamples,
    templateLimit: input.templateLimit ?? 25,
    minimumTemplateUrls: 3,
    minimumTemplateShare: 0,
    minimumTemplateImpressions: 0,
    crawlSamplesPerTemplate: input.crawlSamplesPerTemplate ?? 0,
    inspectionSamplesPerTemplate: input.inspectionSamplesPerTemplate ?? 0,
    maxRowsPerRequest: 50_000,
    pageRowsFetched: input.pageRows?.length ?? 3,
    queryPageRowsFetched: input.queryPageRows?.length ?? 3,
    sitemapsRequested: 1,
    maxUrlsPerSitemap: 50_000,
  })
}

function crawl(url: string, overrides: Partial<PseoCrawlSample> = {}) {
  return {
    url,
    finalUrl: url,
    status: 200,
    title: `Useful ${url}`,
    h1: `Useful ${url}`,
    metaDescription: `Specific facts for ${url}`,
    wordCount: 20,
    technicalStatus: 'ok' as const,
    warnings: [],
    ...overrides,
  }
}

function inspection(
  url: string,
  verdict: string,
  coverageState: string,
): PseoInspectionSample {
  return {
    url,
    verdict,
    coverageState,
    indexStatus: pseoIndexStatus(verdict),
  }
}

test('pSEO maps URL Inspection verdicts exactly', () => {
  assert.equal(pseoIndexStatus('PASS'), 'indexed')
  assert.equal(pseoIndexStatus('NEUTRAL'), 'excluded')
  assert.equal(pseoIndexStatus('FAIL'), 'invalid')
  assert.equal(pseoIndexStatus('PARTIAL'), 'unknown')

  const report = dataset({
    inspectionSamples: [
      inspection(urls[0] ?? '', 'NEUTRAL', 'Crawled - currently not indexed'),
    ],
    inspectionSamplesPerTemplate: 1,
  })
  const template = report.templates[0]
  assert.equal(template?.inspection.indexed, 0)
  assert.equal(template?.inspection.notIndexed, 1)
  assert.equal(template?.verdict, 'index-risk')
  assert.equal(template?.confidence, 'low')
})

test('pSEO never treats short word counts as a quality verdict', () => {
  const report = dataset({
    crawlSamples: urls.map((url) => crawl(url, { wordCount: 10 })),
    crawlSamplesPerTemplate: 3,
  })

  assert.equal(report.templates[0]?.crawl.wordCount?.median, 10)
  assert.equal(report.templates[0]?.verdict, 'inconclusive')
  assert.match(report.caveats.join(' '), /no preferred or minimum word-count/)
})

test('pSEO keeps page metrics separate from retained query examples', () => {
  const page = urls[0] ?? ''
  const report = dataset({
    pageRows: [
      { page, clicks: 10, impressions: 100, position: 3 },
      ...urls.slice(1).map((url) => ({
        page: url,
        clicks: 0,
        impressions: 0,
        position: 10,
      })),
    ],
    queryPageRows: [
      { query: 'one', page, clicks: 10, impressions: 100, position: 3 },
      { query: 'two', page, clicks: 8, impressions: 80, position: 4 },
    ],
  })

  assert.equal(report.summary.impressions, 100)
  assert.equal(report.templates[0]?.metrics.impressions, 100)
  assert.equal(report.templates[0]?.metrics.retainedQueryImpressions, 180)
})

test('pSEO ranks templates by observed page demand before limiting', () => {
  const large = Array.from(
    { length: 10 },
    (_, index) => `https://example.com/large/item-${index}`,
  )
  const valuable = Array.from(
    { length: 3 },
    (_, index) => `https://example.com/valuable/item-${index}`,
  )
  const report = dataset({
    sitemapUrls: [...large, ...valuable],
    pageRows: [
      ...large.map((page) => ({
        page,
        clicks: 0,
        impressions: 1,
        position: 30,
      })),
      ...valuable.map((page) => ({
        page,
        clicks: 10,
        impressions: 100,
        position: 4,
      })),
    ],
    queryPageRows: valuable.map((page) => ({
      query: 'valuable item',
      page,
      clicks: 10,
      impressions: 100,
      position: 4,
    })),
    templateLimit: 1,
  })

  assert.equal(report.templates[0]?.signature, '/valuable/:slug')
  assert.equal(report.selection.eligibleTemplates, 2)
})

test('pSEO sampling supports bounded requests beyond five URLs', () => {
  const many = Array.from(
    { length: 8 },
    (_, index) => `https://example.com/catalog/item-${index}`,
  )
  const report = dataset({
    sitemapUrls: many,
    pageRows: many.map((page, index) => ({
      page,
      clicks: index,
      impressions: index + 10,
      position: 5,
    })),
    queryPageRows: many.map((page, index) => ({
      query: `item ${index}`,
      page,
      clicks: index,
      impressions: index + 10,
      position: 5,
    })),
    crawlSamplesPerTemplate: 6,
  })

  assert.equal(report.templates[0]?.sampleUrls.length, 6)
  assert.equal(report.templates[0]?.crawl.requested, 6)
  assert.equal(new Set(report.templates[0]?.sampleUrls).size, 6)
})

test('pSEO reports invalid rows and derived brand filtering', () => {
  const report = dataset({
    queryPageRows: [
      {
        query: 'example',
        page: urls[0] ?? '',
        clicks: 1,
        impressions: 10,
        position: 1,
      },
      {
        query: 'city guide',
        page: 'not a url',
        clicks: 2,
        impressions: 1,
        position: 0,
      },
    ],
  })

  assert.equal(report.selection.invalidQueryPageRows, 1)
  assert.equal(report.selection.brandRows, 1)
  assert.equal(report.dataStatus, 'partial')
  assert.match(report.caveats.join(' '), /excluded using example/)
})

test('pSEO runtime validates bounds and requests both GSC dimensions', async () => {
  const requests: Array<{ dimensions?: string[]; maxRows?: number }> = []
  const rows: GscRow[] = urls.map((url) => ({
    keys: [url],
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 4,
  }))
  const dependencies = {
    now: () => new Date('2026-07-09T00:30:00.000Z'),
    fetchPage: async () => {
      throw new Error('not called')
    },
    inspectUrl: async () => {
      throw new Error('not called')
    },
    fetchSitemapUrls: async ({ sitemapUrl }: { sitemapUrl: string }) =>
      completeSitemapResult(sitemapUrl),
    searchAnalytics: async (
      _site: string,
      request: { dimensions?: string[]; maxRows?: number },
    ) => {
      requests.push(request)
      const queryPage = request.dimensions?.length === 2
      return {
        rows: queryPage
          ? urls.map((url, index) => ({
              keys: [`city ${index}`, url],
              clicks: 1,
              impressions: 10,
              ctr: 0.1,
              position: 4,
            }))
          : rows,
        calls: 1,
        rowsFetched: 3,
      }
    },
  }

  await assert.rejects(
    pseoAuditReport(
      { site: 'sc-domain:example.com', crawlSamples: 11 },
      dependencies,
    ),
    /between 0 and 10/,
  )
  assert.equal(requests.length, 0)

  const report = await pseoAuditReport(
    { site: 'sc-domain:example.com' },
    dependencies,
  )
  assert.deepEqual(
    requests.map((request) => request.dimensions),
    [['page'], ['query', 'page']],
  )
  assert.ok(requests.every((request) => request.maxRows === 50_000))
  assert.deepEqual(report.range, {
    startDate: '2026-06-07',
    endDate: '2026-07-04',
  })
})
