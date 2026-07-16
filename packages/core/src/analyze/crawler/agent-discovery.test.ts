import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import type { publicHttpFetch } from '../../fetch/http-client.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { collectAgentDiscovery } from './agent-discovery.js'
import { agentReadiness } from './agent-readiness.js'
import { createCrawlReport } from './report.js'

const markdown = `---
title: "Example"
description: "An example page"
canonical: "https://example.com/"
language: "en"
---

# Example

Intro copy explains the useful page clearly enough for an agent to retain it.

| Field | Value |
| --- | --- |
| One | Two |

\`\`\`sh
echo example
\`\`\`
`

const skill = `---
name: seo
description: Use the SEO reports.
---

# SEO
`

function response(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers })
}

const fakeFetch = (async (url: string, input?: RequestInit) => {
  const accept = new Headers(input?.headers).get('accept') ?? ''
  if (url === 'http://example.com/') {
    return response('', 308, { location: 'https://example.com/' })
  }
  if (url === 'https://www.example.com/') {
    return response('', 308, { location: 'https://example.com/' })
  }
  if (url === 'https://example.com/index.md') {
    return response(markdown, 200, {
      'content-type': 'text/markdown; charset=utf-8',
      link: '<https://example.com/>; rel="canonical"; type="text/html"',
      vary: 'Accept',
      'x-markdown-tokens': '67',
      'content-signal': 'search=yes, ai-input=yes, ai-train=no',
    })
  }
  if (url === 'https://example.com/' && accept.includes('text/markdown;q=0')) {
    return response('<h1>Example</h1>', 200, {
      'content-type': 'text/html; charset=utf-8',
      vary: 'Accept',
    })
  }
  if (url === 'https://example.com/' && accept.startsWith('text/markdown')) {
    return response(markdown, 200, {
      'content-type': 'text/markdown; charset=utf-8',
      link: '<https://example.com/>; rel="canonical"; type="text/html"',
      vary: 'Accept',
      'x-markdown-tokens': '67',
      'content-signal': 'search=yes, ai-input=yes, ai-train=no',
    })
  }
  if (url === 'https://example.com/.well-known/agent-skills/index.json') {
    const digest = createHash('sha256').update(skill).digest('hex')
    return response(
      JSON.stringify({
        $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
        skills: [
          {
            name: 'seo',
            url: '/.well-known/agent-skills/seo/SKILL.md',
            digest: `sha256:${digest}`,
          },
        ],
      }),
      200,
      {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
      },
    )
  }
  if (url === 'https://example.com/.well-known/agent-skills/seo/SKILL.md') {
    return response(skill, 200, {
      'access-control-allow-origin': '*',
      'content-type': 'text/markdown',
    })
  }
  if (url === 'https://example.com/llms.txt') {
    return response(
      '# Example\n\n> Entry points.\n\n## Start\n\n- [Home](https://example.com/): The home page.\n',
      200,
      { 'content-type': 'text/plain' },
    )
  }
  if (url === 'https://example.com/agent-routes.json') {
    return response(
      JSON.stringify({
        pages: [{ htmlPath: '/', markdownPath: '/index.md' }],
      }),
      200,
      { 'content-type': 'application/json' },
    )
  }
  if (url === 'https://example.com/') {
    return response('<h1>Example</h1>', 200, {
      'content-type': 'text/html; charset=utf-8',
    })
  }
  return response('', 404, { 'content-type': 'text/plain' })
}) as typeof publicHttpFetch

function fetchWithMarkdown(body: string): typeof publicHttpFetch {
  return (async (url: string, input?: Parameters<typeof fakeFetch>[1]) => {
    const requestedUrl = String(url)
    const accept =
      (input?.headers as Record<string, string> | undefined)?.accept ?? ''
    if (
      requestedUrl === 'https://example.com/index.md' ||
      (requestedUrl === 'https://example.com/' &&
        accept.startsWith('text/markdown') &&
        !accept.includes('text/markdown;q=0'))
    ) {
      return response(body, 200, {
        'content-type': 'text/markdown; charset=utf-8',
        link: '<https://example.com/>; rel="canonical"; type="text/html"',
        vary: 'Accept',
        'x-markdown-tokens': String(Math.ceil(Buffer.byteLength(body) / 4)),
        'content-signal': 'search=yes, ai-input=yes, ai-train=no',
      })
    }
    return fakeFetch(requestedUrl, input)
  }) as typeof publicHttpFetch
}

const page: CrawlPageSnapshot = {
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  contentType: 'text/html; charset=utf-8',
  responseHeaders: {
    'content-signal': 'search=yes, ai-input=yes, ai-train=no',
    link: '<https://example.com/index.md>; rel="alternate"; type="text/markdown"',
  },
  title: 'Example',
  h1: 'Example',
  h1Count: 1,
  indexable: true,
  wordCount: 20,
  contentHash: 'html',
  contentSample:
    'Intro copy explains the useful page clearly enough for an agent to retain it.',
  outgoingInternalCount: 0,
  markdownAlternates: ['https://example.com/index.md'],
  hasHsts: true,
  schemaTypes: ['WebSite', 'Person', 'WebPage'],
}

test('collectAgentDiscovery validates one deterministic content contract', async () => {
  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: fakeFetch,
  })

  assert.equal(discovery.dataStatus, 'complete')
  assert.equal(discovery.profile, 'content')
  assert.equal(
    discovery.profileApplicability.application.status,
    'notApplicable',
  )
  assert.equal(discovery.markdownAlternates.advertisedPages, 1)
  assert.equal(discovery.markdownAlternates.exactByteMatches, 1)
  assert.equal(discovery.markdownAlternates.stableResponses, 1)
  assert.equal(discovery.markdownAlternates.pages[0]?.quality?.h1Count, 1)
  assert.equal(discovery.markdownAlternates.pages[0]?.quality?.rawSvgTags, 0)
  assert.equal(discovery.contentNegotiation.qZeroHonoured, true)
  assert.equal(discovery.contentSignals.consistent, true)
  assert.equal(discovery.agentSkills.validIndex, true)
  assert.equal(discovery.agentSkills.skills[0]?.digestMatches, true)
  assert.equal(discovery.llmsTxt.repeatedHashStable, true)
  assert.equal(discovery.llmsTxt.links[0]?.status, 200)
  assert.equal(discovery.routeManifest.valid, true)
  assert.deepEqual(discovery.routeManifest.orphanMarkdownRoutes, [])
  assert.equal(discovery.protocolVariants.http.permanentRedirectToHttps, true)
})

test('collectAgentDiscovery accepts negotiated Markdown without explicit mirrors', async () => {
  const negotiatedMarkdown = `${markdown}
This additional paragraph gives the negotiated-only fixture enough substantive
copy to exercise the clean quality path without relying on an explicit route.
`
  const negotiatedOnlyPage: CrawlPageSnapshot = {
    ...page,
    responseHeaders: {
      'content-signal': 'search=yes, ai-input=yes, ai-train=no',
    },
    markdownAlternates: [],
  }
  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [negotiatedOnlyPage],
    timeoutMs: 1_000,
    fetch: fetchWithMarkdown(negotiatedMarkdown),
  })

  assert.equal(discovery.dataStatus, 'complete')
  assert.equal(discovery.markdownAlternates.advertisedPages, 0)
  assert.equal(discovery.markdownAlternates.evaluatedPages, 1)
  assert.equal(discovery.markdownAlternates.exactByteMatches, 0)
  assert.equal(discovery.markdownAlternates.stableResponses, 1)
  assert.equal(discovery.markdownAlternates.pages[0]?.explicit, undefined)
  assert.match(
    discovery.markdownAlternates.pages[0]?.negotiated?.contentType ?? '',
    /^text\/markdown/u,
  )
  assert.equal(discovery.markdownAlternates.pages[0]?.quality?.h1Count, 1)
  assert.equal(discovery.contentSignals.consistent, true)

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [negotiatedOnlyPage],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery
  const readiness = agentReadiness(crawl)

  for (const id of [
    'markdown-coverage',
    'markdown-token-estimates',
    'markdown-negotiation',
    'markdown-determinism',
    'markdown-quality',
  ]) {
    assert.equal(
      readiness.checks.find((item) => item.id === id)?.status,
      'pass',
      id,
    )
  }
})

test('markdown quality ignores repeated commands and weak intro samples', async () => {
  const exampleMarkdown = `---
title: "Example"
description: "An example page"
canonical: "https://example.com/"
language: "en"
---

# Example

This useful explanation is retained even when the HTML sample points at unrelated layout copy.
The rest of the document contains enough useful detail to stand on its own as a complete page for an agent.

\`\`\`sh
seo projects list
seo projects list
\`\`\`

| Field | Value |
| --- | --- |
| Report | site-crawl |
| Report | site-crawl |

](https://example.com/docs/related-report)[

](https://example.com/docs/related-report)[
`
  const variantPage: CrawlPageSnapshot = {
    ...page,
    wordCount: 12,
    contentSample:
      'Unrelated visual navigation text that is not part of the useful document intro.',
  }
  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [variantPage],
    timeoutMs: 1_000,
    fetch: fetchWithMarkdown(exampleMarkdown),
  })
  const quality = discovery.markdownAlternates.pages[0]?.quality

  assert.equal(quality?.repeatedLines, 0)
  assert.equal(quality?.introductoryCopyRetained, false)

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [variantPage],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery

  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'markdown-quality')
      ?.status,
    'pass',
  )
})

test('markdown quality warns when prose is duplicated in the document', async () => {
  const duplicated =
    'This exact explanatory paragraph was accidentally rendered twice in the useful page content.'
  const exampleMarkdown = `---
title: "Example"
description: "An example page"
canonical: "https://example.com/"
language: "en"
---

# Example

${duplicated}

${duplicated}
`
  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: fetchWithMarkdown(exampleMarkdown),
  })

  assert.equal(discovery.markdownAlternates.pages[0]?.quality?.repeatedLines, 1)

  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [page],
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery

  assert.equal(
    agentReadiness(crawl).checks.find((item) => item.id === 'markdown-quality')
      ?.status,
    'warning',
  )
})

test('agentReadiness reports evidence without scoring irrelevant profiles', async () => {
  const discovery = await collectAgentDiscovery({
    startUrl: 'https://example.com/',
    pages: [page],
    timeoutMs: 1_000,
    fetch: fakeFetch,
  })
  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [page],
    ai: {
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        exists: true,
        availability: 'available',
        sitemapUrls: [],
        botAccess: [
          {
            userAgent: 'GPTBot',
            allowed: true,
            declared: false,
            coveredByWildcard: true,
          },
        ],
      },
    },
  }) as ReturnType<typeof createCrawlReport> & {
    agentDiscovery: typeof discovery
  }
  crawl.agentDiscovery = discovery

  const readiness = agentReadiness(crawl)
  assert.equal(readiness.profile, 'content')
  assert.equal(readiness.assessment, 'evidence-only')
  assert.equal(readiness.summary.failed, 0)
  assert.equal(readiness.summary.notApplicable, 3)
  assert.equal(
    readiness.summary.checks,
    readiness.summary.passed +
      readiness.summary.warnings +
      readiness.summary.failed +
      readiness.summary.unknown +
      readiness.summary.information +
      readiness.summary.notApplicable,
  )
  assert.equal(
    readiness.checks.find((check) => check.id === 'identity-graph')?.status,
    'pass',
  )
  assert.equal(
    readiness.checks.find((check) => check.id === 'markdown-token-estimates')
      ?.status,
    'pass',
  )
  assert.equal(
    readiness.checks.find((check) => check.id === 'content-signals')?.status,
    'pass',
  )
  assert.equal(
    readiness.checks.find((check) => check.id === 'agent-skills')?.status,
    'pass',
  )
  assert.match(readiness.caveats.at(-1) ?? '', /not applicable/)
})

test('agentReadiness keeps unavailable check totals internally consistent', () => {
  const crawl = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [page],
  })

  const readiness = agentReadiness(crawl)

  assert.equal(readiness.dataStatus, 'unavailable')
  assert.equal(readiness.checks.length, 4)
  assert.equal(readiness.summary.checks, readiness.checks.length)
  assert.equal(
    readiness.summary.checks,
    readiness.summary.passed +
      readiness.summary.warnings +
      readiness.summary.failed +
      readiness.summary.unknown +
      readiness.summary.information +
      readiness.summary.notApplicable,
  )
})

test('llms.txt validation reports malformed, stale, redirected, off-site, non-indexable, and oversized evidence', async () => {
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

  assert.equal(discovery.llmsTxt.oversized, true)
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
  const readiness = agentReadiness(crawl)
  assert.equal(
    readiness.checks.find((item) => item.id === 'llms-txt')?.status,
    'warning',
  )
})
