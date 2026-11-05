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

test('soft 404 checks warn when only a made-up root path returns 200', async () => {
  const result = await collectCrawlSiteChecks({
    startUrl: 'https://example.com/',
    timeoutMs: 1_000,
    respectRobots: true,
    fetchStatusPage: (async (url: string) =>
      response(
        url,
        new URL(url).pathname.split('/').length === 2 ? 200 : 404,
      )) as typeof import('../monitoring/crawl-page.js').crawlStatusOnly,
  })

  assert.equal(result.checks.soft404.status, 'warning')
  assert.equal(result.checks.soft404.complete, true)
  assert.equal(result.checks.soft404.probes.length, 3)
  assert.equal(result.issues.length, 1)
  assert.match(
    result.issues[0]?.detail ?? '',
    /^1 of 3 made-up paths .*-not-found \(200\)\.$/,
  )
})
