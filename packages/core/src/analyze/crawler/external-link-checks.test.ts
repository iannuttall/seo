import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { verifyExternalLinks } from './external-link-checks.js'

const EMPTY_OUTCOMES = {
  available: 0,
  'confirmed-broken': 0,
  transient: 0,
  'provider-blocked': 0,
  'rate-limited': 0,
  'method-rejected': 0,
  unavailable: 0,
}

function page(
  index: number,
  links: string[],
  outgoingExternalCount = links.length,
): CrawlPageSnapshot {
  const url = `https://example.com/page-${index}`
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: `Page ${index}`,
    h1: `Page ${index}`,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    indexable: true,
    wordCount: 100,
    contentHash: `page-${index}`,
    outgoingInternalCount: 0,
    outgoingExternalCount,
    sampleExternalLinks: links,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: false,
      hasDate: false,
      questionHeadings: 0,
      structuredBlocks: 0,
      answerable: false,
    },
  }
}

test('external link verification confirms a broken URL with repeated responses', async () => {
  const source = page(1, ['https://outside.example/gone'])
  const methods: string[] = []

  const result = await verifyExternalLinks({
    pages: [source],
    timeoutMs: 1_000,
    fetch: async (_url, init) => {
      methods.push(init?.method ?? 'GET')
      return new Response(null, { status: 404 })
    },
  })

  assert.deepEqual(methods, ['HEAD', 'GET'])
  assert.deepEqual(source.externalLinkChecks, [
    {
      url: 'https://outside.example/gone',
      status: 404,
      state: 'confirmed-broken',
      attempts: [
        { method: 'HEAD', status: 404 },
        { method: 'GET', status: 404 },
      ],
    },
  ])
  assert.equal(result.dataStatus, 'complete')
  assert.deepEqual(result.outcomes, {
    ...EMPTY_OUTCOMES,
    'confirmed-broken': 1,
  })
})

test('external link verification preserves blocking and rate limits without retrying', async () => {
  const blocked = page(1, ['https://outside.example/blocked'])
  const limited = page(2, ['https://outside.example/limited'])
  const calls: string[] = []

  const result = await verifyExternalLinks({
    pages: [blocked, limited],
    timeoutMs: 1_000,
    fetch: async (url) => {
      calls.push(url)
      return new Response(null, {
        status: url.endsWith('/blocked') ? 403 : 429,
      })
    },
  })

  assert.equal(calls.length, 2)
  assert.equal(blocked.externalLinkChecks?.[0]?.state, 'provider-blocked')
  assert.equal(limited.externalLinkChecks?.[0]?.state, 'rate-limited')
  assert.equal(result.dataStatus, 'partial')
  assert.deepEqual(result.outcomes, {
    ...EMPTY_OUTCOMES,
    'provider-blocked': 1,
    'rate-limited': 1,
  })
  assert.deepEqual(result.warnings, [
    '1 external URL blocked automated verification. Open it manually before changing the source page.',
    '1 external URL rate-limited verification. Recheck it later.',
  ])
})

test('external link verification does not call repeated server errors broken', async () => {
  const source = page(1, ['https://outside.example/temporary-error'])

  const result = await verifyExternalLinks({
    pages: [source],
    timeoutMs: 1_000,
    fetch: async () => new Response(null, { status: 503 }),
  })

  assert.equal(source.externalLinkChecks?.[0]?.state, 'transient')
  assert.deepEqual(source.externalLinkChecks?.[0]?.attempts, [
    { method: 'HEAD', status: 503 },
    { method: 'GET', status: 503 },
  ])
  assert.equal(result.dataStatus, 'partial')
  assert.deepEqual(result.outcomes, { ...EMPTY_OUTCOMES, transient: 1 })
})
