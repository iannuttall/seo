import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../../types.js'
import {
  decodePageFetchCacheEvidence,
  encodePageFetchCacheEvidence,
} from './plain.js'

test('page fetch cache preserves redirect and robots evidence', () => {
  const result: PageFetchResult = {
    url: 'https://example.com/old',
    finalUrl: 'https://example.com/new',
    status: 200,
    headers: { 'content-type': 'text/html' },
    html: '<h1>Example</h1>',
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: true,
      durationMs: 25,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 4,
        intervalCap: 4,
        intervalMs: 1000,
      },
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        cache: 'miss',
        allowed: false,
      },
      redirectChain: [
        {
          url: 'https://example.com/old',
          status: 301,
          location: 'https://example.com/new',
        },
      ],
    },
    warnings: ['JavaScript rendering was unavailable.'],
    robotsTxt: {
      url: 'https://example.com/robots.txt',
      allowed: false,
      matchedLine: 'Disallow: /old',
    },
  }

  assert.deepEqual(
    decodePageFetchCacheEvidence(encodePageFetchCacheEvidence(result)),
    {
      finalUrl: result.finalUrl,
      blocked: true,
      robotsTxt: result.robotsTxt,
      diagnosticsRobotsTxt: result.diagnostics.robotsTxt,
      redirectChain: result.diagnostics.redirectChain,
      warnings: result.warnings,
    },
  )
})

test('page fetch cache rejects missing or malformed evidence', () => {
  assert.equal(decodePageFetchCacheEvidence(), undefined)
  assert.equal(decodePageFetchCacheEvidence('{not-json'), undefined)
  assert.equal(
    decodePageFetchCacheEvidence(JSON.stringify({ finalUrl: '/relative' })),
    undefined,
  )
})
