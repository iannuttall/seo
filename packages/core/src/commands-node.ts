import { load } from 'cheerio'
import type {
  Caller,
  CommandDeps,
  IndexStatus,
  PageFacts,
} from './commands/index.js'
import { indexStatusFrom } from './commands/index.js'
import { SEO_CRAWLER_USER_AGENT } from './fetch/crawler-identity.js'
import { inspectUrl } from './gsc/client/inspection.js'
import { querySearchAnalytics } from './gsc/client/search-analytics.js'

// The core commands' functions for the CLI and the local MCP: Search Console
// with the local Google sign-in and cache, and live page checks from this
// machine.

const MAX_PAGES = 20
const TIMEOUT_MS = 6000
const MAX_BYTES = 2_000_000

const text = (value: string | undefined | null) =>
  value?.trim().replace(/\s+/g, ' ') || null

async function facts(url: string): Promise<PageFacts> {
  const out: PageFacts = {
    url,
    status: null,
    redirects_to: null,
    title: null,
    description: null,
    h1: null,
    canonical: null,
    robots: null,
  }
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': SEO_CRAWLER_USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    out.status = response.status
    const location = response.headers.get('location')
    if (location) out.redirects_to = new URL(location, url).toString()
    out.robots = response.headers.get('x-robots-tag')
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.includes('html')
    ) {
      await response.body?.cancel()
      return out
    }
    const html = (await response.text()).slice(0, MAX_BYTES)
    const $ = load(html)
    out.title = text($('title').first().text())
    out.description = text($('meta[name="description" i]').attr('content'))
    out.h1 = text($('h1').first().text())
    const canonical = $('link[rel="canonical" i]').attr('href')
    if (canonical) out.canonical = new URL(canonical, url).toString()
    const robots = text($('meta[name="robots" i]').attr('content'))
    if (robots) out.robots = [out.robots, robots].filter(Boolean).join(', ')
  } catch (error) {
    out.error = error instanceof Error ? error.message : 'fetch failed'
  }
  return out
}

export function checkPagesLocally(urls: string[]): Promise<PageFacts[]> {
  return Promise.all(urls.slice(0, MAX_PAGES).map(facts))
}

export function nodeCommandDeps(options: {
  call: Caller
  account?: string
  refresh?: boolean
}): CommandDeps {
  return {
    searchAnalytics: (site, body) =>
      querySearchAnalytics(site, body, {
        refresh: options.refresh,
        accountEmail: options.account,
      }),
    checkPages: checkPagesLocally,
    inspect: async (site, url): Promise<IndexStatus | null> => {
      try {
        return indexStatusFrom(
          await inspectUrl({
            siteUrl: site,
            inspectionUrl: url,
            accountEmail: options.account,
          }),
        )
      } catch {
        return null
      }
    },
    call: options.call,
  }
}
