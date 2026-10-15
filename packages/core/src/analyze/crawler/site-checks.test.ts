import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import { collectCrawlSiteChecks } from './site-checks.js'

function response(url: string, status: number, finalUrl = url): CrawlOneResult {
  return {
    request: {
      requestedUrl: url,
      outcome: 'response',
      finalUrl,
      status,
      extraction: 'not-applicable',
    },
    urls: [],
  }
}

test('soft 404 checks pass only when every probe returns a missing status', async () => {
  const result = await collectCrawlSiteChecks({
    startUrl: 'https://example.com/',
    timeoutMs: 1_000,
    respectRobots: true,
    fetchStatusPage: (async (url: string) =>
      response(
        url,
        url.endsWith('-1') ? 404 : 410,
      )) as typeof import('../monitoring/crawl-page.js').crawlStatusOnly,
  })

  assert.equal(result.checks.soft404.status, 'pass')
  assert.deepEqual(result.issues, [])
})
