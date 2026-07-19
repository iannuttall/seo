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

test('soft 404 checks use two bounded status-only probes', async () => {
  const calls: string[] = []
  const options: Array<Record<string, unknown>> = []
  const result = await collectCrawlSiteChecks({
    startUrl: 'https://example.com/',
    timeoutMs: 1_000,
    respectRobots: true,
    fetchStatusPage: (async (url: string, input: Record<string, unknown>) => {
      calls.push(url)
      options.push(input)
      return response(url, 200, 'https://example.com/')
    }) as typeof import('../monitoring/crawl-page.js').crawlStatusOnly,
  })

  assert.equal(calls.length, 2)
  assert.equal(
    options.every((input) => input.writeCache === false),
    true,
  )
  assert.equal(
    options.every((input) => input.respectRobots === true),
    true,
  )
  assert.equal(result.checks.soft404.status, 'warning')
  assert.equal(result.issues[0]?.ruleId, 'soft_404')
})

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
