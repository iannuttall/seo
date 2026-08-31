import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { publicHttpFetch } from '../../fetch/http-client.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { collectAgentDiscovery } from './agent-discovery.js'
import { agentReadiness } from './agent-readiness.js'
import { createCrawlReport } from './report.js'

const root = 'https://example.com/'
const missingPath = 'https://example.com/__seo_agent_readiness_missing__'
const trustPaths = ['/about', '/contact', '/privacy']

type SiteMode = 'ready' | 'weak' | 'plain-404' | 'mixed-404'

function response(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers })
}

const page: CrawlPageSnapshot = {
  url: root,
  finalUrl: root,
  status: 200,
  contentType: 'text/html; charset=utf-8',
  title: 'Example',
  h1: 'Example',
  h1Count: 1,
  indexable: true,
  wordCount: 20,
  contentHash: 'html',
  outgoingInternalCount: 0,
  markdownAlternates: [],
  hasHsts: true,
  schemaTypes: ['WebSite', 'SoftwareApplication'],
}

const usefulCopy = Array.from(
  { length: 12 },
  () =>
    'This initial HTML response gives a constrained client useful public text about the purpose, audience, evidence, and next step before any script runs.',
).join(' ')

const markdown = `# Example

This public Markdown page explains the product and gives an agent a useful entry point.
`

function siteFetch(mode: SiteMode): typeof publicHttpFetch {
  return (async (
    url: string,
    input?: Parameters<typeof publicHttpFetch>[1],
  ) => {
    const requestedUrl = String(url)
    const accept =
      (input?.headers as Record<string, string> | undefined)?.accept ?? ''
    if (requestedUrl === 'http://example.com/') {
      return response('', 308, { location: root })
    }
    if (requestedUrl === 'https://www.example.com/') {
      return response('', 308, { location: root })
    }
    if (requestedUrl === `${root}llms.txt`) {
      const body =
        mode === 'weak'
          ? '# Example\n\n> Public links.\n\n## Start\n\n- [Home](https://example.com/)\n'
          : '# Example\n\n> Use this site when you need a bounded public-site audit.\n\n## Start\n\n- [Developer docs](https://example.com/docs): The developer entry point.\n'
      return response(body, 200, { 'content-type': 'text/plain' })
    }
    if (requestedUrl === `${root}docs`) {
      return response('<h1>Developer docs</h1>', 200, {
        'content-type': 'text/html; charset=utf-8',
      })
    }
    if (requestedUrl === missingPath) {
      if (mode === 'weak') {
        return response('<div id="app"></div>', 200, {
          'content-type': 'text/html; charset=utf-8',
        })
      }
      if (mode === 'plain-404') {
        return response('Page not found', 404, {
          'content-type': 'text/plain; charset=utf-8',
        })
      }
      if (mode === 'mixed-404' && accept.startsWith('text/markdown')) {
        return response('# Normal app page', 200, {
          'content-type': 'text/markdown; charset=utf-8',
        })
      }
      if (accept.startsWith('text/markdown')) {
        return response(
          '# Page not found\n\nUse the [site map](https://example.com/sitemap.xml) or [agent guide](https://example.com/llms.txt).\n',
          404,
          { 'content-type': 'text/markdown; charset=utf-8' },
        )
      }
      return response('<h1>Page not found</h1>', 404, {
        'content-type': 'text/html; charset=utf-8',
      })
    }
    if (trustPaths.some((path) => requestedUrl === new URL(path, root).href)) {
      if (mode === 'weak') {
        return response('missing', 404, { 'content-type': 'text/plain' })
      }
      const topic = new URL(requestedUrl).pathname.slice(1)
      const copy = Array.from(
        { length: 90 },
        (_, index) => `${topic} detail ${index + 1}`,
      ).join(' ')
      return response(`<main><h1>${topic}</h1><p>${copy}</p></main>`, 200, {
        'content-type': 'text/html; charset=utf-8',
      })
    }
    if (requestedUrl === root) {
      if (
        accept.startsWith('text/markdown') &&
        !accept.includes('text/markdown;q=0')
      ) {
        return response(markdown, 200, {
          'content-type': 'text/markdown; charset=utf-8',
          vary: 'Accept',
        })
      }
      const body =
        mode === 'weak'
          ? `<div id="app"></div><script>${usefulCopy}</script>`
          : `<main><h1>Example</h1><p>${usefulCopy}</p><h2>Developer entry point</h2><a href="/docs">Developer docs</a></main>`
      return response(body, 200, {
        'content-type': 'text/html; charset=utf-8',
        vary: 'Accept',
      })
    }
    return response('', 404, { 'content-type': 'text/plain' })
  }) as typeof publicHttpFetch
}

async function checksFor(mode: SiteMode) {
  const discovery = await collectAgentDiscovery({
    startUrl: root,
    pages: [page],
    timeoutMs: 1_000,
    fetch: siteFetch(mode),
  })
  const crawl = createCrawlReport({
    config: { url: root },
    pages: [page],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  return {
    discovery,
    checks: new Map(
      agentReadiness(crawl).checks.map((item) => [item.id, item]),
    ),
  }
}

test('public site checks pass with direct bounded evidence', async () => {
  const { discovery, checks } = await checksFor('ready')

  assert.equal(discovery.siteSurfaces?.rawStartPage.h1Count, 1)
  assert.equal(discovery.siteSurfaces?.notFound.html.status, 404)
  assert.equal(discovery.siteSurfaces?.notFound.markdown.status, 404)
  assert.deepEqual(
    discovery.siteSurfaces?.trustAnchors.map((anchor) => anchor.status),
    [200, 200, 200],
  )
  assert.equal(discovery.llmsTxt.whenToUseGuidance, true)
  for (const id of [
    'raw-html-content',
    'agent-friendly-404s',
    'developer-resource-links',
    'agent-when-to-use',
    'trust-anchor-pages',
  ]) {
    assert.equal(
      checks.get(id)?.status,
      'pass',
      `${id}: ${JSON.stringify(checks.get(id)?.evidence)}`,
    )
  }
})

test('public site checks report false success and missing trust evidence', async () => {
  const { checks } = await checksFor('weak')

  assert.equal(checks.get('raw-html-content')?.status, 'warning')
  assert.equal(checks.get('agent-friendly-404s')?.status, 'fail')
  assert.equal(checks.get('developer-resource-links')?.status, 'warning')
  assert.equal(checks.get('agent-when-to-use')?.status, 'warning')
  const trustCheck = checks.get('trust-anchor-pages')
  assert.equal(trustCheck?.status, 'warning')
  assert.ok(trustCheck)
  assert.deepEqual((trustCheck.evidence as { missing: string[] }).missing, [
    'about',
    'contact',
    'privacy',
  ])
})

test('an honest plain 404 without Markdown recovery needs review', async () => {
  const { checks } = await checksFor('plain-404')
  assert.equal(checks.get('agent-friendly-404s')?.status, 'warning')
})

test('a Markdown app shell cannot hide an honest HTML 404', async () => {
  const { checks } = await checksFor('mixed-404')
  assert.equal(checks.get('agent-friendly-404s')?.status, 'fail')
})
