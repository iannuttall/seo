import robotsParserModule from 'robots-parser'
import {
  type publicHttpFetch,
  readBoundedResponseText,
} from '../../fetch/http-client.js'
import { abortController } from './crawl-control.js'
import type { CrawlReport } from './report.js'

const MAX_AUXILIARY_RESPONSE_BYTES = 2 * 1024 * 1024

type LlmsTxtSignal = {
  url: string
  exists: boolean
  status?: number
}

const AI_BOT_USER_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'Amazonbot',
  'Bytespider',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'DuckAssistBot',
  'MistralAI-User',
  'Diffbot',
  'cohere-ai',
]

const AGENT_RESOURCE_PATHS = [
  '/.well-known/agent.json',
  '/agent.json',
  '/.well-known/mcp.json',
  '/.well-known/ai-plugin.json',
  '/.well-known/openapi.json',
  '/openapi.json',
]

async function checkLlmsTxt(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<LlmsTxtSignal> {
  const llmsUrl = new URL('/llms.txt', input.url).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })

  try {
    const response = await input.fetch(llmsUrl, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const exists =
      response.status >= 200 &&
      response.status < 300 &&
      !/\btext\/html\b/i.test(contentType)
    await response.body?.cancel().catch(() => undefined)
    return {
      url: response.url || llmsUrl,
      exists,
      status: response.status,
    }
  } catch {
    return { url: llmsUrl, exists: false }
  } finally {
    controller.cleanup()
  }
}

function parseRobots(robotsUrl: string, text: string) {
  return (
    robotsParserModule as unknown as (
      url: string,
      robotstxt: string,
    ) => {
      isAllowed(url: string, ua?: string): boolean | undefined
    }
  )(robotsUrl, text)
}

function declaredUserAgents(text: string): Set<string> {
  const declared = new Set<string>()
  for (const match of text.matchAll(/^\s*user-agent\s*:\s*(.+?)\s*$/gim)) {
    const value = match[1]?.trim().toLowerCase()
    if (value) declared.add(value)
  }
  return declared
}

function contentSignalsFromRobots(text: string): string[] {
  const values = new Set<string>()
  for (const match of text.matchAll(/^\s*content-signal\s*:\s*(.+?)\s*$/gim)) {
    const value = match[1]?.trim()
    if (value) values.add(value)
  }
  return [...values].sort()
}

function sitemapUrlsFromRobots(text: string): string[] {
  const urls = new Set<string>()
  for (const match of text.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)) {
    const value = match[1]?.trim()
    if (!value) continue
    try {
      urls.add(new URL(value).toString())
    } catch {
      // Ignore malformed sitemap declarations.
    }
  }
  return [...urls]
}

async function checkRobotsAiAccess(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<NonNullable<CrawlReport['ai']>['robotsTxt']> {
  const robotsUrl = new URL('/robots.txt', input.url).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })
  try {
    const response = await input.fetch(robotsUrl, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const text = await readBoundedResponseText(
      response,
      MAX_AUXILIARY_RESPONSE_BYTES,
      'robots.txt response',
    )
    const available = response.status >= 200 && response.status < 300
    const absent =
      response.status >= 400 && response.status < 500 && response.status !== 429
    const availability = available
      ? ('available' as const)
      : [401, 403].includes(response.status)
        ? ('access-blocked' as const)
        : response.status === 429
          ? ('rate-limited' as const)
          : absent
            ? ('absent' as const)
            : ('unreachable' as const)
    const exists = available
    const declared = exists ? declaredUserAgents(text) : new Set<string>()
    const parsed = parseRobots(robotsUrl, exists ? text : '')
    return {
      url: response.url || robotsUrl,
      exists,
      availability,
      status: response.status,
      ...(['rate-limited', 'unreachable'].includes(availability)
        ? { error: `robots.txt returned HTTP ${response.status}.` }
        : {}),
      sitemapUrls: exists ? sitemapUrlsFromRobots(text) : [],
      contentSignals: exists ? contentSignalsFromRobots(text) : [],
      botAccess: AI_BOT_USER_AGENTS.map((userAgent) => {
        const lower = userAgent.toLowerCase()
        return {
          userAgent,
          allowed:
            availability === 'rate-limited' || availability === 'unreachable'
              ? null
              : (parsed.isAllowed(input.url, userAgent) ?? true),
          declared: declared.has(lower),
          coveredByWildcard: declared.has('*'),
        }
      }),
    }
  } catch (error) {
    return {
      url: robotsUrl,
      exists: false,
      availability: 'unreachable',
      error: error instanceof Error ? error.message : String(error),
      sitemapUrls: [],
      botAccess: AI_BOT_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allowed: null,
        declared: false,
        coveredByWildcard: false,
      })),
    }
  } finally {
    controller.cleanup()
  }
}

async function checkAgentResource(input: {
  baseUrl: string
  path: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<
  NonNullable<NonNullable<CrawlReport['ai']>['agentResources']>[number]
> {
  const url = new URL(input.path, input.baseUrl).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })
  try {
    const response = await input.fetch(url, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const text = await readBoundedResponseText(
      response,
      MAX_AUXILIARY_RESPONSE_BYTES,
      'Agent resource response',
    )
    const exists = response.status >= 200 && response.status < 300
    let validJson: boolean | undefined
    if (exists && /\bjson\b/i.test(contentType)) {
      try {
        JSON.parse(text)
        validJson = true
      } catch {
        validJson = false
      }
    }
    return {
      url: response.url || url,
      exists,
      status: response.status,
      contentType,
      ...(validJson === undefined ? {} : { validJson }),
    }
  } catch {
    return { url, exists: false }
  } finally {
    controller.cleanup()
  }
}

async function checkAgentResources(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<NonNullable<CrawlReport['ai']>['agentResources']> {
  const resources: NonNullable<CrawlReport['ai']>['agentResources'] = []
  for (const path of AGENT_RESOURCE_PATHS) {
    if (input.signal?.aborted) break
    resources.push(
      await checkAgentResource({
        baseUrl: input.url,
        path,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
      }),
    )
  }
  return resources
}

export function collectCrawlAiSignals(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}) {
  return Promise.all([
    checkLlmsTxt(input),
    checkRobotsAiAccess(input),
    checkAgentResources(input),
  ] as const)
}
