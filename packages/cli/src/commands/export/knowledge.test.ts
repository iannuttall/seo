import assert from 'node:assert/strict'
import test from 'node:test'
import { createCrawlReport } from '@seo/core'
import { knowledgePayload } from './knowledge.js'

test('knowledge exports preserve the saved crawl timestamp deterministically', () => {
  const report = createCrawlReport({
    config: {
      url: 'https://example.com/',
      mode: 'page',
    },
    pages: [],
    requests: [],
    warnings: [],
    caveats: [],
    generatedAt: '2026-07-09T09:00:01.000Z',
  })

  const first = knowledgePayload(report)
  const second = knowledgePayload(report)

  assert.deepEqual(first, second)
  assert.equal(first.generatedAt, report.generatedAt)
})
