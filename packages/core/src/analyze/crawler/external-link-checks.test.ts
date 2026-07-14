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

async function check(pages: CrawlPageSnapshot[]): Promise<{
  calls: string[]
  result: Awaited<ReturnType<typeof verifyExternalLinks>>
}> {
  const calls: string[] = []
  const result = await verifyExternalLinks({
    pages,
    timeoutMs: 1_000,
    fetch: async (url) => {
      calls.push(url)
      return new Response(null, { status: 200 })
    },
  })
  return { calls, result }
}

test('external link verification samples deterministically across source pages', async () => {
  const ordered = Array.from({ length: 250 }, (_, index) =>
    page(index, [`https://outside.example/${index}`]),
  )
  const first = await check(ordered)
  const second = await check([...ordered].reverse())

  assert.deepEqual(first.calls, second.calls)
  assert.equal(first.calls.length, 200)
  assert.equal(
    first.calls.some((url) => /\/(2[0-4]\d)$/.test(url)),
    true,
  )
  assert.deepEqual(first.result, {
    dataStatus: 'partial',
    discoveredLinkOccurrences: 250,
    retainedUrls: 250,
    selectedUrls: 200,
    fetchedUrls: 200,
    failedUrls: 0,
    deferredUrls: 50,
    limit: 200,
    outcomes: { ...EMPTY_OUTCOMES, available: 200 },
    warnings: [
      'Selected 200 of 250 retained external URLs using the 200-URL verification limit.',
    ],
  })
})

test('external link verification deduplicates before applying its limit', async () => {
  const pages = Array.from({ length: 210 }, (_, index) =>
    page(index, [
      'https://outside.example/shared',
      `https://outside.example/unique-${index}`,
    ]),
  )
  const { calls, result } = await check(pages)

  assert.equal(new Set(calls).size, 200)
  assert.equal(result.retainedUrls, 211)
  assert.equal(result.selectedUrls, 200)
  assert.equal(result.deferredUrls, 11)
})

test('external link verification retains each selected link on its source pages', async () => {
  const first = page(1, ['https://outside.example/shared'], 2)
  const second = page(2, ['https://outside.example/shared'])
  const third = page(3, ['https://outside.example/fails'])
  const result = await verifyExternalLinks({
    pages: [first, second, third],
    timeoutMs: 1_000,
    fetch: async (url) => {
      if (url.endsWith('/fails')) throw new Error('network unavailable')
      return new Response(null, { status: 200 })
    },
  })

  assert.deepEqual(first.externalLinkChecks, [
    {
      url: 'https://outside.example/shared',
      status: 200,
      state: 'available',
      attempts: [{ method: 'HEAD', status: 200 }],
    },
  ])
  assert.deepEqual(second.externalLinkChecks, first.externalLinkChecks)
  assert.deepEqual(third.externalLinkChecks, [
    {
      url: 'https://outside.example/fails',
      error: 'network unavailable',
      state: 'unavailable',
      attempts: [
        { method: 'HEAD', error: 'network unavailable' },
        { method: 'GET', error: 'network unavailable' },
      ],
    },
  ])
  assert.deepEqual(result, {
    dataStatus: 'partial',
    discoveredLinkOccurrences: 4,
    retainedUrls: 2,
    selectedUrls: 2,
    fetchedUrls: 1,
    failedUrls: 1,
    deferredUrls: 0,
    limit: 200,
    outcomes: { ...EMPTY_OUTCOMES, available: 1, unavailable: 1 },
    warnings: [
      'Retained 3 sampled external link occurrences from 4 observed occurrences.',
      '1 external URL could not be reached after bounded verification.',
    ],
  })
})

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

test('external link verification keeps a crawler-shaped failure transient', async () => {
  const source = page(1, ['https://outside.example/google-support'])
  let attempts = 0

  const result = await verifyExternalLinks({
    pages: [source],
    timeoutMs: 1_000,
    fetch: async () => {
      attempts += 1
      return new Response(null, { status: attempts === 1 ? 404 : 200 })
    },
  })

  assert.deepEqual(source.externalLinkChecks, [
    {
      url: 'https://outside.example/google-support',
      status: 200,
      state: 'transient',
      attempts: [
        { method: 'HEAD', status: 404 },
        { method: 'GET', status: 200 },
      ],
    },
  ])
  assert.equal(result.dataStatus, 'partial')
  assert.deepEqual(result.outcomes, { ...EMPTY_OUTCOMES, transient: 1 })
  assert.deepEqual(result.warnings, [
    '1 external URL returned inconsistent or temporary responses. Recheck it before changing the source page.',
  ])
})

test('external link verification falls back to GET when HEAD is rejected', async () => {
  const source = page(1, ['https://outside.example/get-only'])
  const statuses = [405, 200]

  const result = await verifyExternalLinks({
    pages: [source],
    timeoutMs: 1_000,
    fetch: async () => new Response(null, { status: statuses.shift() ?? 500 }),
  })

  assert.equal(source.externalLinkChecks?.[0]?.state, 'method-rejected')
  assert.deepEqual(source.externalLinkChecks?.[0]?.attempts, [
    { method: 'HEAD', status: 405 },
    { method: 'GET', status: 200 },
  ])
  assert.equal(result.dataStatus, 'complete')
  assert.deepEqual(result.outcomes, {
    ...EMPTY_OUTCOMES,
    'method-rejected': 1,
  })
})

test('external link verification keeps unresolved method rejection partial', async () => {
  const source = page(1, ['https://outside.example/rejects-methods'])

  const result = await verifyExternalLinks({
    pages: [source],
    timeoutMs: 1_000,
    fetch: async () => new Response(null, { status: 405 }),
  })

  assert.equal(source.externalLinkChecks?.[0]?.state, 'method-rejected')
  assert.equal(result.dataStatus, 'partial')
  assert.deepEqual(result.warnings, [
    '1 external URL rejected both verification methods. Open it manually before changing the source page.',
  ])
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
