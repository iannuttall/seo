import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { getDb } from '../../storage/database.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { createCrawlReport } from './report.js'
import {
  CRAWL_REPORT_STORAGE_VERSION,
  type CrawlReportStoreAdapter,
  deleteCrawlReport,
  latestCrawlReport,
  listCrawlReports,
  loadCrawlReport,
  saveCrawlReport,
} from './report-store.js'

test('crawl report store saves, lists, loads, and returns latest', () => {
  const site = `sc-domain:report-${randomUUID()}.example`
  const first = createCrawlReport({
    site,
    generatedAt: '2026-06-19T00:00:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/` },
  })
  const second = createCrawlReport({
    site,
    generatedAt: '2026-06-19T00:01:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/blog/` },
    dataSources: {
      searchConsole: {
        status: 'partial',
        totalPages: 10,
        queriedPages: 10,
        joinedMetricPages: 2,
        joinedQueryPages: 2,
        pageLimit: 5000,
        pageLimitReached: false,
        retainedRowLimit: 25_000,
        retainedRowLimitReached: true,
      },
      analytics: {
        status: 'none',
        totalPages: 10,
        queriedPages: 10,
        joinedPages: 0,
        returnedRows: 0,
        availableRows: 0,
        retainedRowLimit: 5000,
        retainedRowLimitReached: false,
      },
    },
  })
  const rerun = createCrawlReport({
    site,
    generatedAt: '2026-06-19T00:02:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/blog/` },
    status: 'partial',
  })

  saveCrawlReport(first)
  const saved = saveCrawlReport(second)
  const updated = saveCrawlReport(rerun)

  assert.equal(saved.id, second.id)
  assert.equal(saved.storageVersion, CRAWL_REPORT_STORAGE_VERSION)
  assert.equal(updated.id, rerun.id)
  assert.notEqual(rerun.id, second.id)
  assert.equal(rerun.definitionId, second.definitionId)
  assert.equal(loadCrawlReport(first.id)?.id, first.id)
  assert.equal(loadCrawlReport(second.id)?.status, 'completed')
  assert.equal(
    loadCrawlReport(second.id)?.dataSources?.searchConsole.status,
    'partial',
  )
  assert.equal(loadCrawlReport(rerun.id)?.status, 'partial')
  assert.equal(latestCrawlReport(site)?.id, rerun.id)
  assert.deepEqual(
    listCrawlReports({ site, limit: 3 }).map((item) => item.id),
    [rerun.id, second.id, first.id],
  )
  assert.deepEqual(
    listCrawlReports({ site, limit: 1 }).map((item) => item.storageVersion),
    [CRAWL_REPORT_STORAGE_VERSION],
  )
  const stored = getDb()
    .prepare('SELECT report_json FROM crawl_reports WHERE id = ?')
    .get(second.id) as { report_json: string }
  const envelope = JSON.parse(stored.report_json) as Record<string, unknown>
  assert.equal(envelope.kind, 'seo.crawl_report')
  assert.equal(envelope.version, CRAWL_REPORT_STORAGE_VERSION)
  assert.equal((envelope.report as { id?: string }).id, second.id)
  assert.equal(deleteCrawlReport(first.id), true)
  assert.equal(loadCrawlReport(first.id), undefined)
  assert.equal(deleteCrawlReport(first.id), false)
  assert.deepEqual(
    listCrawlReports({ site, limit: 3 }).map((item) => item.id),
    [rerun.id, second.id],
  )
})

test('crawl report store never replaces an existing run id', () => {
  const site = `sc-domain:immutable-${randomUUID()}.example`
  const id = `crawl_${randomUUID().replaceAll('-', '')}`
  const original = createCrawlReport({
    id,
    site,
    generatedAt: '2026-06-19T00:02:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/` },
  })
  const conflicting = createCrawlReport({
    id,
    site,
    generatedAt: '2026-06-19T00:03:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/` },
    status: 'failed',
  })

  saveCrawlReport(original)
  const saved = saveCrawlReport(conflicting)

  assert.equal(saved.status, 'completed')
  assert.equal(saved.createdAt, original.generatedAt)
  assert.equal(loadCrawlReport(id)?.status, 'completed')
  assert.equal(loadCrawlReport(id)?.generatedAt, original.generatedAt)
})

test('crawl report store recomputes derived fields on load', () => {
  const site = `sc-domain:legacy-${randomUUID()}.example`
  const page: CrawlPageSnapshot = {
    url: `https://${site.slice('sc-domain:'.length)}/`,
    finalUrl: `https://${site.slice('sc-domain:'.length)}/`,
    status: 200,
    contentType: 'text/html',
    indexable: true,
    wordCount: 120,
    contentHash: 'legacy',
    outgoingInternalCount: 1,
  }
  const report = createCrawlReport({
    site,
    generatedAt: '2026-06-19T00:03:00.000Z',
    config: { url: page.url },
    pages: [page],
    issues: [
      {
        ruleId: 'missing_title',
        title: 'Title missing',
        category: 'metadata',
        severity: 'high',
        url: page.url,
      },
    ],
  })

  saveCrawlReport(report)

  const legacyJson = JSON.parse(JSON.stringify(report)) as Record<
    string,
    unknown
  >
  const legacyPages = legacyJson.pages as Array<Record<string, unknown>>
  delete legacyPages[0]?.seoScore
  delete legacyPages[0]?.geoScore
  const legacySummary = legacyJson.summary as Record<string, unknown>
  delete legacySummary.healthScore
  delete legacySummary.geoReadinessScore
  delete legacyJson.definitionId
  delete legacyJson.requests
  delete legacyJson.requestEvidenceStatus
  legacyJson.issueGroups = []

  getDb()
    .prepare('UPDATE crawl_reports SET report_json = ? WHERE id = ?')
    .run(JSON.stringify(legacyJson), report.id)

  const loaded = loadCrawlReport(report.id)

  assert.equal(loaded?.summary.healthScore, 70)
  assert.equal(loaded?.summary.geoReadinessScore, 65)
  assert.equal(loaded?.pages[0]?.seoScore, 70)
  assert.equal(loaded?.pages[0]?.geoScore, 65)
  assert.equal(loaded?.requestEvidenceStatus, 'unavailable')
  assert.equal(loaded?.summary.attemptedRequests, 0)
  assert.equal(loaded?.issueGroups[0]?.ruleId, 'missing_title')
  assert.equal(loaded?.definitionId, report.definitionId)
})

test('crawl report loading stays idempotent after derived normalization', () => {
  const site = `sc-domain:idempotent-${randomUUID()}.example`
  const report = createCrawlReport({
    site,
    generatedAt: '2026-06-19T00:04:00.000Z',
    config: { url: `https://${site.slice('sc-domain:'.length)}/` },
    pages: [
      {
        url: `https://${site.slice('sc-domain:'.length)}/`,
        finalUrl: `https://${site.slice('sc-domain:'.length)}/`,
        status: 200,
        indexable: true,
        wordCount: 500,
        contentHash: 'idempotent',
        outgoingInternalCount: 0,
      },
    ],
  })

  saveCrawlReport(report)

  const firstLoad = loadCrawlReport(report.id)
  const secondLoad = loadCrawlReport(report.id)

  assert.equal(firstLoad?.id, report.id)
  assert.equal(secondLoad?.id, report.id)
  assert.equal(firstLoad?.configHash, report.configHash)
  assert.equal(secondLoad?.configHash, report.configHash)
  assert.deepEqual(firstLoad?.summary, secondLoad?.summary)
  assert.deepEqual(firstLoad?.pages, secondLoad?.pages)
})

test('crawl report store functions accept an adapter boundary', () => {
  const report = createCrawlReport({
    generatedAt: '2026-06-19T00:05:00.000Z',
    config: { url: 'https://adapter-store.example/' },
  })
  const calls: string[] = []
  const adapter: CrawlReportStoreAdapter = {
    save: (value) => {
      calls.push(`save:${value.id}`)
      return {
        id: value.id,
        configHash: value.configHash,
        site: value.site,
        url: value.config.url,
        status: value.status,
        totalPages: value.summary.totalPages,
        issueCount: value.issues.length,
        createdAt: value.generatedAt,
        storageVersion: CRAWL_REPORT_STORAGE_VERSION,
      }
    },
    list: (input = {}) => {
      calls.push(`list:${input.site ?? 'all'}:${input.limit ?? 'default'}`)
      return []
    },
    load: (id) => {
      calls.push(`load:${id}`)
      return report
    },
    delete: (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    latest: (site) => {
      calls.push(`latest:${site ?? 'all'}`)
      return report
    },
  }

  assert.equal(saveCrawlReport(report, adapter).id, report.id)
  assert.deepEqual(
    listCrawlReports({ site: 'sc-domain:example.com' }, adapter),
    [],
  )
  assert.equal(loadCrawlReport(report.id, adapter)?.id, report.id)
  assert.equal(deleteCrawlReport(report.id, adapter), true)
  assert.equal(latestCrawlReport(undefined, adapter)?.id, report.id)
  assert.deepEqual(calls, [
    `save:${report.id}`,
    'list:sc-domain:example.com:default',
    `load:${report.id}`,
    `delete:${report.id}`,
    'latest:all',
  ])
})
