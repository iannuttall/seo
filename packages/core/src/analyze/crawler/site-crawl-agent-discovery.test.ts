import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlAgentDiscovery } from './agent-discovery.js'
import { crawlReportSchema } from './schemas.js'
import { crawlSite } from './site-crawl.js'
import { crawlPageSnapshot } from './site-crawl.test-fixtures.js'

const discovery: CrawlAgentDiscovery = {
  profile: 'content',
  profileApplicability: {
    content: { status: 'evaluated', reason: 'Selected.' },
    api: { status: 'notApplicable', reason: 'No public API.' },
    application: { status: 'notApplicable', reason: 'No agent application.' },
    commerce: { status: 'notApplicable', reason: 'No commerce workflow.' },
  },
  dataStatus: 'complete',
  markdownAlternates: {
    eligibleHtmlPages: 1,
    advertisedPages: 1,
    evaluatedPages: 1,
    exactByteMatches: 1,
    stableResponses: 1,
    pages: [],
  },
  contentNegotiation: { qZeroHonoured: true },
  routeManifest: {
    url: 'https://example.com/agent-routes.json',
    status: 200,
    valid: true,
    declaredHtmlRoutes: ['/'],
    declaredMarkdownRoutes: ['/index.md'],
    missingHtmlRoutes: [],
    missingMarkdownRoutes: [],
    orphanMarkdownRoutes: [],
  },
  agentSkills: {
    indexUrl: 'https://example.com/.well-known/agent-skills/index.json',
    status: 200,
    contentType: 'application/json',
    validIndex: true,
    skills: [],
  },
  llmsTxt: {
    url: 'https://example.com/llms.txt',
    exists: true,
    status: 200,
    contentType: 'text/plain',
    repeatedHashStable: true,
    headingCount: 1,
    totalParsedLinks: 0,
    linkLimitReached: false,
    links: [],
    invalidLinks: [],
    duplicateLinks: [],
    offSiteLinks: [],
    redirectedLinks: [],
    nonIndexableLinks: [],
    missingCrawlRoutes: [],
    oversized: false,
  },
  contentSignals: {
    htmlValues: ['search=yes, ai-input=yes, ai-train=no'],
    markdownValues: ['search=yes, ai-input=yes, ai-train=no'],
    missingHtmlPages: 0,
    missingMarkdownPages: 0,
    consistent: true,
  },
  protocolVariants: {
    http: {
      url: 'http://example.com/',
      status: 308,
      location: 'https://example.com/',
      permanentRedirectToHttps: true,
    },
    www: {
      url: 'https://www.example.com/',
      status: 308,
      location: 'https://example.com/',
      redirectsToPreferredHost: true,
    },
    hstsOnStartPage: true,
  },
  warnings: [],
}

test('crawlSite only collects focused agent evidence when requested', async () => {
  let collections = 0
  const dependencies = {
    fetch: async () => new Response('', { status: 404 }),
    fetchPage: async (url: string) => ({
      page: crawlPageSnapshot(url),
      urls: [],
    }),
    collectAgentDiscovery: async () => {
      collections += 1
      return discovery
    },
  }

  const regular = await crawlSite(
    {
      url: 'https://example.com/',
      useSitemap: false,
      checkExternal: false,
      checkAgentDiscovery: false,
    },
    dependencies,
  )
  assert.equal(collections, 0)
  assert.equal(regular.agentDiscovery, undefined)

  const focused = await crawlSite(
    {
      url: 'https://example.com/',
      useSitemap: false,
      checkExternal: false,
      checkAgentDiscovery: true,
    },
    dependencies,
  )
  assert.equal(collections, 1)
  assert.deepEqual(focused.agentDiscovery, discovery)
  assert.equal(crawlReportSchema.safeParse(focused).success, true)
})
