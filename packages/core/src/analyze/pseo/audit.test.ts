import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../../types.js'
import { completeSitemapResult } from '../monitoring/sitemap-test-fixture.js'
import { buildPseoAuditReportFromRows, pseoAuditReport } from './audit.js'
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
