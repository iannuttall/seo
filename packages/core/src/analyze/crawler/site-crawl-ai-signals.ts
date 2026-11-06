import robotsParserModule from 'robots-parser'
import { SEO_CRAWLER_USER_AGENT } from '../../fetch/crawler-identity.js'
import {
  type publicHttpFetch,
  ResponseSizeLimitError,
  readBoundedResponseText,
} from '../../fetch/http-client.js'
import { fetchFailureKind } from '../monitoring/crawl-page.js'
import { abortController, REQUEST_TIMEOUT_CAP_MS } from './crawl-control.js'
import type {
  CrawlAiAvailability,
  CrawlAiBotAccess,
  CrawlAiLinkCheck,
  CrawlAiSignals,
  CrawlFetchErrorKind,
} from './report.js'

const MAX_AUXILIARY_RESPONSE_BYTES = 2 * 1024 * 1024
const LLMS_LINK_LIMIT = 20

type Fetch = typeof publicHttpFetch
type SignalInput = {
  url: string
  timeoutMs: number
  fetch: Fetch
  signal?: AbortSignal
}

const AI_BOTS: Array<[string, CrawlAiBotAccess['purpose']]> = [
  ['OAI-SearchBot', 'search'],
  ['ChatGPT-User', 'search'],
  ['Claude-SearchBot', 'search'],
  ['Claude-User', 'search'],
  ['PerplexityBot', 'search'],
  ['Perplexity-User', 'search'],
  ['DuckAssistBot', 'search'],
  ['MistralAI-User', 'search'],
  ['Meta-ExternalFetcher', 'search'],
  ['Applebot', 'search'],
  ['Bingbot', 'search'],
  ['GPTBot', 'training'],
  ['ClaudeBot', 'training'],
  ['Google-Extended', 'training'],
  ['Applebot-Extended', 'training'],
  ['Meta-ExternalAgent', 'training'],
  ['CCBot', 'training'],
  ['Bytespider', 'training'],
  ['cohere-ai', 'training'],
  ['Amazonbot', 'other'],
  ['Diffbot', 'other'],
]

// Files that tell agents what a site offers. Each is optional.
const AGENT_RESOURCE_PATHS = [
  '/.well-known/agent-skills/index.json',
  '/.well-known/mcp/server-card.json',
  '/.well-known/mcp.json',
  '/.well-known/api-catalog',
  '/openapi.json',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/.well-known/http-message-signatures-directory',
]

function availabilityOf(status: number): CrawlAiAvailability {
  if (status >= 200 && status < 300) return 'available'
  if (status === 401 || status === 403) return 'access-blocked'
  if (status === 429) return 'rate-limited'
  if (status >= 400 && status < 500) return 'absent'
  return 'unreachable'
}

// The error message, with its cause when the message alone says only that
// the fetch failed.
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? error.cause.message : ''
  return cause && !error.message.includes(cause)
    ? `${error.message}: ${cause}`
    : error.message
}

// The error for a request that got no response. A timeout says so.
export function requestError(
  error: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): { error: string; errorKind: CrawlFetchErrorKind } {
  const errorKind = fetchErrorKind(error, signal)
  return {
    error:
      errorKind === 'timeout'
        ? `No response within ${Math.min(timeoutMs, REQUEST_TIMEOUT_CAP_MS) / 1_000} seconds.`
        : errorText(error),
    errorKind,
  }
}

// Why a request failed: a timeout, DNS or TLS failure, a body over the size
// cap, or a cancelled run.
export function fetchErrorKind(
  error: unknown,
  signal?: AbortSignal,
): CrawlFetchErrorKind {
  if (error instanceof ResponseSizeLimitError) return 'too-large'
  return fetchFailureKind(error, signal)
}

// One bounded GET. A thrown fetch becomes an unreachable result, never a
// missing file.
async function get(
  input: SignalInput,
  url: string,
  headers?: Record<string, string>,
  readBody = true,
): Promise<{
  url: string
  availability: CrawlAiAvailability
  status?: number
  contentType: string
  headers?: Headers
  text: string
  error?: string
  errorKind?: CrawlFetchErrorKind
}> {
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })
  try {
    const response = await input.fetch(url, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
      ...(headers ? { headers } : {}),
    })
    let text = ''
    if (readBody) {
      text = await readBoundedResponseText(
        response,
        MAX_AUXILIARY_RESPONSE_BYTES,
        `${new URL(url).pathname} response`,
      )
    } else {
      await response.body?.cancel().catch(() => undefined)
    }
    return {
      url: response.url || url,
      availability: availabilityOf(response.status),
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      headers: response.headers,
      text,
    }
  } catch (error) {
    return {
      url,
      availability: 'unreachable',
      contentType: '',
      text: '',
      ...requestError(error, input.timeoutMs, input.signal),
    }
  } finally {
    controller.cleanup()
  }
}

const isHtml = (contentType: string) => /\btext\/html\b/i.test(contentType)
const isMarkdown = (contentType: string) =>
  /\btext\/(?:x-)?markdown\b/i.test(contentType)

function brokenLink(
  result: Awaited<ReturnType<typeof get>>,
  expectText: boolean,
): CrawlAiLinkCheck | undefined {
  if (
    result.availability === 'available' &&
    !(expectText && isHtml(result.contentType))
  )
    return undefined
  return {
    url: result.url,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.contentType ? { contentType: result.contentType } : {}),
    ...(result.error ? { error: result.error } : {}),
  }
}

// Same-site link targets in llms.txt, in file order.
export function llmsLinks(text: string, base: string): string[] {
  const origin = new URL(base).origin
  const links: string[] = []
  for (const match of text.matchAll(/\]\(\s*<?([^)\s>]+)>?/g)) {
    try {
      const url = new URL(match[1] ?? '', base)
      url.hash = ''
      if (url.origin === origin && !links.includes(url.toString()))
        links.push(url.toString())
    } catch {
      // Ignore malformed links.
    }
  }
  return links
}

// One request for /llms.txt. The text is empty unless the file exists.
export async function readLlmsTxt(input: SignalInput): Promise<{
  llmsTxt: NonNullable<CrawlAiSignals['llmsTxt']>
  text: string
}> {
  const result = await get(input, new URL('/llms.txt', input.url).toString())
  // A site that serves its HTML shell for every path has no llms.txt.
  const servesHtml =
    result.availability === 'available' && isHtml(result.contentType)
  const availability = servesHtml ? 'absent' : result.availability
  const exists = availability === 'available'
  const base = {
    url: result.url,
    exists,
    availability,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.contentType ? { contentType: result.contentType } : {}),
    ...(servesHtml ? { servesHtml } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorKind ? { errorKind: result.errorKind } : {}),
  }
  return { llmsTxt: base, text: exists ? result.text : '' }
}

async function checkLlmsTxt(
  input: SignalInput,
): Promise<NonNullable<CrawlAiSignals['llmsTxt']>> {
  const { llmsTxt: base, text } = await readLlmsTxt(input)
  if (!base.exists) return base
  const found = llmsLinks(text, base.url)
  const broken: CrawlAiLinkCheck[] = []
  let checked = 0
  for (const url of found.slice(0, LLMS_LINK_LIMIT)) {
    if (input.signal?.aborted) break
    checked += 1
    const link = brokenLink(await get(input, url, undefined, false), false)
    if (link) broken.push(link)
  }
  return {
    ...base,
    links: { found: found.length, checked, limit: LLMS_LINK_LIMIT, broken },
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

// Whether robots.txt lets this crawler fetch a URL; null when robots.txt
// could not be read.
export type RobotsGate = (url: string) => boolean | null

export async function checkRobotsAiAccess(input: SignalInput): Promise<{
  robotsTxt: NonNullable<CrawlAiSignals['robotsTxt']>
  allows: RobotsGate
}> {
  const robotsUrl = new URL('/robots.txt', input.url).toString()
  const result = await get(input, robotsUrl)
  // An HTML page holds no robots rules, so crawlers treat it as no file.
  const servesHtml =
    result.availability === 'available' && isHtml(result.contentType)
  const availability = servesHtml ? 'absent' : result.availability
  const exists = availability === 'available'
  const unknown =
    result.availability === 'rate-limited' ||
    result.availability === 'unreachable'
  const declared = exists ? declaredUserAgents(result.text) : new Set<string>()
  const parsed = parseRobots(robotsUrl, exists ? result.text : '')
  // robots-parser answers only for its own origin. robots.txt often
  // redirects between a site's hosts, such as example.com to www.example.com,
  // and its rules then cover both, so URLs on either host match by path.
  const ruleHosts = new Set([new URL(robotsUrl).host, new URL(result.url).host])
  const isAllowed = (url: string, userAgent: string) => {
    const target = new URL(url)
    const local = ruleHosts.has(target.host)
      ? new URL(`${target.pathname}${target.search}`, robotsUrl).toString()
      : url
    return parsed.isAllowed(local, userAgent) ?? true
  }
  const robotsTxt: NonNullable<CrawlAiSignals['robotsTxt']> = {
    url: result.url,
    exists,
    availability,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.contentType ? { contentType: result.contentType } : {}),
    ...(servesHtml ? { servesHtml } : {}),
    ...(unknown
      ? {
          error: result.error ?? `robots.txt returned HTTP ${result.status}.`,
        }
      : {}),
    ...(result.errorKind ? { errorKind: result.errorKind } : {}),
    sitemapUrls: exists ? sitemapUrlsFromRobots(result.text) : [],
    ...(unknown
      ? {}
      : {
          contentSignals: exists ? contentSignalsFromRobots(result.text) : [],
        }),
    botAccess: AI_BOTS.map(([userAgent, purpose]) => ({
      userAgent,
      purpose,
      allowed: unknown ? null : isAllowed(input.url, userAgent),
      declared: declared.has(userAgent.toLowerCase()),
      coveredByWildcard: declared.has('*'),
    })),
  }
  return {
    robotsTxt,
    allows: (url) => (unknown ? null : isAllowed(url, SEO_CRAWLER_USER_AGENT)),
  }
}

async function checkAgentResources(
  input: SignalInput,
): Promise<NonNullable<CrawlAiSignals['agentResources']>> {
  const resources: NonNullable<CrawlAiSignals['agentResources']> = []
  for (const path of AGENT_RESOURCE_PATHS) {
    if (input.signal?.aborted) break
    const result = await get(input, new URL(path, input.url).toString())
    const exists =
      result.availability === 'available' && !isHtml(result.contentType)
    let validJson: boolean | undefined
    if (exists && /\bjson\b/i.test(result.contentType)) {
      try {
        JSON.parse(result.text)
        validJson = true
      } catch {
        validJson = false
      }
    }
    resources.push({
      url: result.url,
      exists,
      ...(result.status === undefined ? {} : { status: result.status }),
      ...(result.contentType ? { contentType: result.contentType } : {}),
      ...(validJson === undefined ? {} : { validJson }),
    })
  }
  return resources
}

async function checkMarkdownNegotiation(
  input: SignalInput,
): Promise<NonNullable<CrawlAiSignals['markdownNegotiation']>> {
  const result = await get(input, input.url, { accept: 'text/markdown' }, false)
  const vary = result.headers?.get('vary') ?? ''
  return {
    url: result.url,
    availability: result.availability,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(result.contentType ? { contentType: result.contentType } : {}),
    markdown:
      result.availability === 'available' && isMarkdown(result.contentType),
    varyAccept: vary
      .split(',')
      .some((value) => value.trim().toLowerCase() === 'accept'),
    ...(result.error ? { error: result.error } : {}),
  }
}

// Robots.txt is read first. When the crawl respects robots.txt, the start URL
// is requested as Markdown only if robots.txt allows it.
export async function collectCrawlAiSignals(
  input: SignalInput & { respectRobots: boolean },
): Promise<{ signals: CrawlAiSignals; allows: RobotsGate }> {
  const robots = await checkRobotsAiAccess(input)
  const allows: RobotsGate = input.respectRobots ? robots.allows : () => true
  const startAllowed = allows(input.url)
  const [llmsTxt, agentResources, markdownNegotiation] = await Promise.all([
    checkLlmsTxt(input),
    checkAgentResources(input),
    startAllowed
      ? checkMarkdownNegotiation(input)
      : Promise.resolve({
          url: input.url,
          availability: 'unreachable' as const,
          markdown: false,
          varyAccept: false,
          error:
            startAllowed === null
              ? 'Not requested: robots.txt could not be read.'
              : 'Not requested: robots.txt disallows the start URL.',
        }),
  ])
  return {
    signals: {
      llmsTxt,
      robotsTxt: robots.robotsTxt,
      agentResources,
      markdownNegotiation,
    },
    allows,
  }
}

export const MARKDOWN_COPY_LIMIT = 20

// Checks the Markdown copies that crawled pages link to: private pages first,
// then public pages, each in URL order, up to the limit.
export async function checkMarkdownCopies(
  input: Omit<SignalInput, 'url'> & {
    pages: Array<{
      url: string
      markdownAlternates?: string[]
      public: boolean
    }>
    allows: RobotsGate
  },
): Promise<NonNullable<CrawlAiSignals['markdownCopies']>> {
  const linked = input.pages
    .filter((page) => page.markdownAlternates?.length)
    .sort(
      (a, b) =>
        Number(a.public) - Number(b.public) || a.url.localeCompare(b.url),
    )
  const broken: NonNullable<CrawlAiSignals['markdownCopies']>['broken'] = []
  let largest: { url: string; estimatedTokens: number } | undefined
  let checked = 0
  for (const page of linked.slice(0, MARKDOWN_COPY_LIMIT)) {
    if (input.signal?.aborted) break
    const url = page.markdownAlternates?.[0]
    if (!url || !input.allows(url)) continue
    checked += 1
    const result = await get({ ...input, url }, url)
    const link = brokenLink(result, true)
    if (link) {
      broken.push({ ...link, page: page.url, public: page.public })
      continue
    }
    // About four characters per token. An estimate, not a model's count.
    const estimatedTokens = Math.ceil(result.text.length / 4)
    if (!largest || estimatedTokens > largest.estimatedTokens)
      largest = { url: result.url, estimatedTokens }
  }
  return {
    publicPages: input.pages.filter((page) => page.public).length,
    publicPagesWithLink: linked.filter((page) => page.public).length,
    privatePagesWithLink: linked.filter((page) => !page.public).length,
    checked,
    limit: MARKDOWN_COPY_LIMIT,
    broken,
    ...(largest ? { largest } : {}),
  }
}

// The relation names in a Link header, such as sitemap or describedby.
export function linkRelations(header: string | undefined): string[] {
  const relations = new Set<string>()
  for (const match of (header ?? '').matchAll(/rel\s*=\s*"?([^";,]+)"?/gi)) {
    for (const value of (match[1] ?? '').trim().toLowerCase().split(/\s+/))
      if (value) relations.add(value)
  }
  return [...relations].sort()
}
