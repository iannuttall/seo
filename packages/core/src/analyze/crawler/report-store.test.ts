import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createCrawlReport } from './report.js'
import {
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
    config: { url: `https://${site.slice('sc-domain:'.length)}/` },
  })

  saveCrawlReport(first)
  const saved = saveCrawlReport(second)

  assert.equal(saved.id, second.id)
  assert.equal(loadCrawlReport(first.id)?.id, first.id)
  assert.equal(latestCrawlReport(site)?.id, second.id)
  assert.deepEqual(
    listCrawlReports({ site, limit: 2 }).map((item) => item.id),
    [second.id, first.id],
  )
  assert.equal(deleteCrawlReport(first.id), true)
  assert.equal(loadCrawlReport(first.id), undefined)
  assert.equal(deleteCrawlReport(first.id), false)
  assert.deepEqual(
    listCrawlReports({ site, limit: 2 }).map((item) => item.id),
    [second.id],
  )
})
