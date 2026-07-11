import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { verifyExternalLinks } from './external-link-checks.js'

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
    { url: 'https://outside.example/shared', status: 200 },
  ])
  assert.deepEqual(second.externalLinkChecks, first.externalLinkChecks)
  assert.deepEqual(third.externalLinkChecks, [
    {
      url: 'https://outside.example/fails',
      status: 0,
      error: 'network unavailable',
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
    warnings: [
      'Retained 3 sampled external link occurrences from 4 observed occurrences.',
      '1 external URL request failed before a response was received.',
    ],
  })
})
