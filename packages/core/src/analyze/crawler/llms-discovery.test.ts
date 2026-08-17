import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { publicHttpFetch } from '../../fetch/http-client.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { collectAgentDiscovery } from './agent-discovery.js'
import { agentReadiness } from './agent-readiness.js'
import { auditLlmsTxt } from './llms.js'
import { createCrawlReport } from './report.js'

function response(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers })
}

const fakeFetch = (async (url: string) => {
  if (url === 'https://example.com/llms.txt') {
    return response(
      '# Example\n\n> Entry points.\n\n## Start\n\n- [Home](https://example.com/): The home page.\n',
      200,
      { 'content-type': 'text/plain' },
    )
  }
  if (url === 'https://example.com/') {
    return response('<h1>Example</h1>', 200, {
      'content-type': 'text/html; charset=utf-8',
    })
  }
  return response('', 404, { 'content-type': 'text/plain' })
}) as typeof publicHttpFetch

const page: CrawlPageSnapshot = {
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  contentType: 'text/html; charset=utf-8',
  title: 'Example',
  h1: 'Example',
  h1Count: 1,
  indexable: true,
  wordCount: 20,
  contentHash: 'html',
  contentSample: 'Example page.',
  outgoingInternalCount: 0,
}

test('llms.txt validation reports malformed, stale, redirected, off-site, and non-indexable evidence in a large file', async () => {
  const llmsBody = `${'# Example\n\n## Start\n\n- [Home](https://example.com/)\n- [Missing](https://example.com/missing)\n- [Hidden](https://example.com/hidden)\n- [Old](https://example.com/old)\n- [External](https://other.example/resource)\n- [Malformed](https://[broken])\n\n'}${'x'.repeat(100_001)}`
  const variantFetch = (async (
    url: string,
    input?: Parameters<typeof fakeFetch>[1],
  ) => {
    const requestedUrl = String(url)
    if (requestedUrl === 'https://example.com/llms.txt') {
      return response(llmsBody, 200, { 'content-type': 'text/plain' })
    }
    if (requestedUrl === 'https://example.com/hidden') {
      return response(
        '<meta content="noindex, follow" name="robots"><h1>Hidden</h1>',
        200,
        { 'content-type': 'text/html' },
      )
    }
    if (requestedUrl === 'https://example.com/old') {
      const redirected = response('<h1>New</h1>', 200, {
        'content-type': 'text/html',
      })
      Object.defineProperty(redirected, 'redirected', { value: true })
      Object.defineProperty(redirected, 'url', {
        value: 'https://example.com/new',
      })
      return redirected
    }
    if (requestedUrl === 'https://other.example/resource') {
      return response('<h1>External</h1>', 200, {
        'content-type': 'text/html',
      })
    }
    return fakeFetch(requestedUrl, input)
  }) as typeof publicHttpFetch

  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: variantFetch,
  })

  assert.ok((discovery.llmsTxt.bytes ?? 0) > 100_000)
  assert.equal(discovery.llmsTxt.oversized, false)
  assert.equal(discovery.llmsTxt.bodyLimitExceeded, false)
  assert.equal(discovery.llmsTxt.formatValid, false)
  assert.deepEqual(discovery.llmsTxt.invalidLinks, ['https://[broken]'])
  assert.deepEqual(discovery.llmsTxt.offSiteLinks, [
    'https://other.example/resource',
  ])
  assert.deepEqual(discovery.llmsTxt.redirectedLinks, [
    'https://example.com/old',
  ])
  assert.deepEqual(discovery.llmsTxt.nonIndexableLinks, [
    'https://example.com/hidden',
  ])
  assert.deepEqual(discovery.llmsTxt.missingCrawlRoutes, [
    'https://example.com/hidden',
    'https://example.com/missing',
    'https://example.com/old',
  ])

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [page],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  const audit = auditLlmsTxt(crawl)
  assert.equal(audit.exists, true)
  assert.equal(
    audit.issues.some((issue) => issue.id === 'llms-v2-format'),
    true,
  )
  assert.equal(
    audit.issues.some((issue) => issue.id === 'llms-broken-links'),
    true,
  )
  assert.equal(
    audit.issues.some((issue) => issue.id === 'llms-file-size'),
    false,
  )
  const readiness = agentReadiness(crawl)
  assert.equal(
    readiness.checks.find((item) => item.id === 'llms-txt')?.status,
    'warning',
  )
})

test('llms.txt audit keeps a capped link check as partial evidence', async () => {
  const links = Array.from(
    { length: 150 },
    (_, index) =>
      `- [Page ${index}](https://example.com/docs/page-${index}.md): Guide ${index}.`,
  ).join('\n')
  const llmsBody = `# Example\n\n> Entry points.\n\n## Docs\n\n${links}\n`
  const variantFetch = (async (
    url: string,
    input?: Parameters<typeof fakeFetch>[1],
  ) => {
    const requestedUrl = String(url)
    if (requestedUrl === 'https://example.com/llms.txt') {
      return response(llmsBody, 200, { 'content-type': 'text/plain' })
    }
    if (/^https:\/\/example\.com\/docs\/page-\d+\.md$/u.test(requestedUrl)) {
      return response('# Guide', 200, { 'content-type': 'text/markdown' })
    }
    return fakeFetch(requestedUrl, input)
  }) as typeof publicHttpFetch

  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: variantFetch,
  })
  assert.equal(discovery.llmsTxt.formatValid, true)
  assert.equal(discovery.llmsTxt.totalParsedLinks, 150)
  assert.equal(discovery.llmsTxt.linksChecked, 100)
  assert.equal(discovery.llmsTxt.linkCheckStatus, 'partial')

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      page,
      {
        ...page,
        url: 'https://example.com/a',
        finalUrl: 'https://example.com/a',
      },
      {
        ...page,
        url: 'https://example.com/b',
        finalUrl: 'https://example.com/b',
      },
    ],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery

  const audit = auditLlmsTxt(crawl)
  assert.equal(audit.dataStatus, 'partial')
  assert.equal(audit.linkCheck.status, 'partial')
  assert.equal(audit.linkCheck.checkedLinks, 100)
  assert.equal(audit.linkCheck.totalLinks, 150)
  assert.equal(audit.issues.length, 0)
  assert.match(audit.caveats.join(' '), /remaining 50 links/u)
  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'llms-txt')?.status,
    'info',
  )
})

test('llms.txt files above 100,000 bytes can pass format and link checks', async () => {
  const llmsBody = `# Example\n\n${'Useful context. '.repeat(8_000)}\n\n## Start\n\n- [Home](https://example.com/): Home.\n`
  const variantFetch = (async (
    url: string,
    input?: Parameters<typeof fakeFetch>[1],
  ) =>
    String(url) === 'https://example.com/llms.txt'
      ? response(llmsBody, 200, { 'content-type': 'text/plain' })
      : fakeFetch(String(url), input)) as typeof publicHttpFetch

  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: variantFetch,
  })
  assert.ok((discovery.llmsTxt.bytes ?? 0) > 100_000)
  assert.equal(discovery.llmsTxt.bodyDataStatus, 'complete')
  assert.equal(discovery.llmsTxt.bodyLimitExceeded, false)
  assert.equal(discovery.llmsTxt.oversized, false)
  assert.equal(discovery.llmsTxt.formatValid, true)

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      page,
      {
        ...page,
        url: 'https://example.com/a',
        finalUrl: 'https://example.com/a',
      },
      {
        ...page,
        url: 'https://example.com/b',
        finalUrl: 'https://example.com/b',
      },
    ],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  const audit = auditLlmsTxt(crawl)
  assert.equal(audit.dataStatus, 'complete')
  assert.equal(audit.issues.length, 0)
  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'llms-txt')?.status,
    'pass',
  )
})

test('llms.txt body acquisition limits preserve successful file evidence', async () => {
  const llmsBody = `# Example\n\n${'x'.repeat(2_000_001)}`
  const advertisedPage: CrawlPageSnapshot = {
    ...page,
    describedBy: ['https://example.com/llms.txt'],
  }
  const variantFetch = (async (
    url: string,
    input?: Parameters<typeof fakeFetch>[1],
  ) =>
    String(url) === 'https://example.com/llms.txt'
      ? response(llmsBody, 200, { 'content-type': 'text/plain' })
      : fakeFetch(String(url), input)) as typeof publicHttpFetch

  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [advertisedPage],
    timeoutMs: 1_000,
    fetch: variantFetch,
  })
  assert.equal(discovery.llmsTxt.exists, true)
  assert.equal(discovery.llmsTxt.status, 200)
  assert.equal(discovery.llmsTxt.bodyDataStatus, 'unavailable')
  assert.equal(discovery.llmsTxt.bodyLimitBytes, 2_000_000)
  assert.equal(discovery.llmsTxt.bodyLimitExceeded, true)
  assert.equal(discovery.llmsTxt.bytesStatus, 'lower-bound')
  assert.ok((discovery.llmsTxt.bytes ?? 0) > 2_000_000)
  assert.equal(discovery.llmsTxt.formatValid, null)
  assert.equal(discovery.llmsTxt.linkCheckStatus, 'unavailable')

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      advertisedPage,
      {
        ...page,
        url: 'https://example.com/a',
        finalUrl: 'https://example.com/a',
      },
      {
        ...page,
        url: 'https://example.com/b',
        finalUrl: 'https://example.com/b',
      },
    ],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  const audit = auditLlmsTxt(crawl)
  assert.equal(audit.exists, true)
  assert.equal(audit.dataStatus, 'partial')
  assert.equal(audit.bodyEvidence.status, 'unavailable')
  assert.equal(audit.bodyEvidence.limitExceeded, true)
  assert.equal(audit.issues.length, 0)
  assert.match(audit.caveats.join(' '), /2,000,000-byte audit limit/u)
  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'llms-txt')?.status,
    'info',
  )
})

test('llms.txt keeps successful file evidence when the repeat fetch fails', async () => {
  const advertisedPage: CrawlPageSnapshot = {
    ...page,
    describedBy: ['https://example.com/llms.txt'],
  }
  let llmsRequests = 0
  const variantFetch = (async (
    url: string,
    input?: Parameters<typeof fakeFetch>[1],
  ) => {
    if (String(url) === 'https://example.com/llms.txt') {
      llmsRequests += 1
      if (llmsRequests === 2) throw new Error('Repeat request failed.')
      return response(
        '# Example\n\n## Start\n\n- [Home](https://example.com/): Home.\n',
        200,
        { 'content-type': 'text/plain' },
      )
    }
    return fakeFetch(String(url), input)
  }) as typeof publicHttpFetch

  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [advertisedPage],
    timeoutMs: 1_000,
    fetch: variantFetch,
  })
  assert.equal(discovery.llmsTxt.exists, true)
  assert.equal(discovery.llmsTxt.status, 200)
  assert.equal(discovery.llmsTxt.formatValid, true)
  assert.equal(discovery.llmsTxt.repeatedHashStable, null)

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      advertisedPage,
      {
        ...page,
        url: 'https://example.com/a',
        finalUrl: 'https://example.com/a',
      },
      {
        ...page,
        url: 'https://example.com/b',
        finalUrl: 'https://example.com/b',
      },
    ],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  const audit = auditLlmsTxt(crawl)
  assert.equal(audit.exists, true)
  assert.equal(audit.dataStatus, 'partial')
  assert.match(audit.caveats.join(' '), /repeated fetch was unavailable/u)
  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'llms-txt')?.status,
    'info',
  )
})
