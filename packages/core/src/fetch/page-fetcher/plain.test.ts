import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import type { PageFetchResult } from '../../types.js'
import {
  decodePageFetchCacheEvidence,
  encodePageFetchCacheEvidence,
  fetchPlain,
} from './plain.js'
import { normalizeRateControls } from './rate-controls.js'
import { RobotsAccessError } from './robots.js'

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
        availability: 'available',
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
      availability: 'available',
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

test('respecting robots checks policy before serving a cached page', async () => {
  let pageRequests = 0
  const server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nDisallow: /blocked\n')
      return
    }
    pageRequests += 1
    res.setHeader('content-type', 'text/html')
    res.end('<title>Cached but blocked</title>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/blocked`
  const rate = normalizeRateControls({
    concurrency: 1,
    intervalCap: 100,
    intervalMs: 1,
  })

  try {
    await fetchPlain(url, true, 2_000, rate, undefined, false)
    await assert.rejects(
      () => fetchPlain(url, false, 2_000, rate, undefined, true),
      (error) =>
        error instanceof RobotsAccessError &&
        error.reason === 'robots-disallowed',
    )
    assert.equal(pageRequests, 1)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
