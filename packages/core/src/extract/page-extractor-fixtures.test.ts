import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
import { extractPage } from './page-extractor.js'
import { extractionFixtures } from './page-extractor.test-fixtures.js'

function fetched(url: string, html: string): PageFetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 1,
      retries: 0,
      rateLimit: {
        host: new URL(url).host,
        concurrency: 1,
        intervalCap: 1,
        intervalMs: 1_000,
      },
    },
    warnings: [],
  }
}

for (const fixture of extractionFixtures) {
  test(`Defuddle fixture: ${fixture.name}`, async () => {
    const page = await extractPage(fetched(fixture.url, fixture.html))

    assert.equal(page.contentExtraction.used, 'defuddle')
    assert.equal(page.contentExtraction.fallback, false)
    assert.equal(page.contentExtraction.baseUrl, fixture.url)
    assert.ok(page.wordCount >= fixture.minimumWords)
    for (const text of fixture.includes)
      assert.match(page.contentText, new RegExp(text, 'u'))
    for (const text of fixture.excludes)
      assert.doesNotMatch(page.contentText, new RegExp(text, 'u'))
  })
}
