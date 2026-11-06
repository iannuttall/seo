import { SeoError } from '../../errors.js'
import { detectAccessBlock } from '../../fetch/access-block.js'
import {
  publicHttpFetch,
  readBoundedResponseText,
} from '../../fetch/http-client.js'
import { MAX_PAGE_RESPONSE_BYTES } from '../../fetch/page-fetcher/plain.js'
import { fetchWithRedirectChain } from '../../fetch/page-fetcher/redirects.js'
import type { PageFetchResult } from '../../types.js'
import { snapshotFetchedPage } from '../monitoring/crawl-page.js'
import { abortController, REQUEST_TIMEOUT_CAP_MS } from './crawl-control.js'
import type {
  CrawlAiAvailability,
  CrawlAiBotAccess,
  CrawlAiSignals,
  CrawlFetchErrorKind,
} from './report.js'
import {
  checkRobotsAiAccess,
  linkRelations,
  llmsLinks,
  readLlmsTxt,
  requestError,
} from './site-crawl-ai-signals.js'

// Sites mode reads three things per site: robots.txt, the home page and
// llms.txt, one request at a time per site.
export const SITE_FACTS_MAX_SITES = 1_000
export const SITE_FACTS_DEFAULT_CONCURRENCY = 8
export const SITE_FACTS_MAX_CONCURRENCY = 16
// Each request, redirects and body included.
export const SITE_FACTS_TIMEOUT_MS = REQUEST_TIMEOUT_CAP_MS
const SITEMAP_URL_LIMIT = 20
const MARKDOWN_ALTERNATE_LIMIT = 5
const TEXT_LIMIT = 300

export type SiteHomepageFacts = {
  url: string
  outcome: 'response' | 'failed' | 'skipped'
  skipReason?: 'robots-disallowed' | 'robots-unknown'
  availability?: CrawlAiAvailability
  status?: number
  finalUrl?: string
  redirects?: NonNullable<PageFetchResult['diagnostics']['redirectChain']>
  contentType?: string
  accessBlock?: { provider: string; kind: string }
  responseTimeMs?: number
  sizeBytes?: number
  title?: string
  metaDescription?: string
  h1?: string
  lang?: string
  canonical?: string
  metaRobots?: string
  xRobotsTag?: string
  indexable?: boolean
  indexability?: string
  markdownAlternates?: string[]
  contentSignal?: string
  linkRelations?: string[]
  error?: string
  errorKind?: CrawlFetchErrorKind
}

export type SiteRobotsFacts = Omit<
  NonNullable<CrawlAiSignals['robotsTxt']>,
  'sitemapUrls'
> & {
  sitemapUrls: string[]
  sitemapCount: number
  // Whether robots.txt lets this crawler fetch the home page. null when
  // robots.txt could not be read.
  homepageAllowed: boolean | null
}

export type SiteLlmsFacts = NonNullable<CrawlAiSignals['llmsTxt']> & {
  sizeBytes?: number
  // The first non-empty line is a Markdown H1, as the llms.txt format asks.
  startsWithH1?: boolean
  h1?: string
  sameSiteLinks?: number
}

export type SiteFactsRow = {
  type: 'site'
  input: string
  origin?: string
  // Set only when the input is not a usable http(s) site. No request is made.
  error?: string
  checkedAt?: string
  robotsTxt?: SiteRobotsFacts
  homepage?: SiteHomepageFacts
  llmsTxt?: SiteLlmsFacts
}

type AvailabilityCounts = Record<CrawlAiAvailability, number> & {
  // Requests that got no response at all, a subset of unreachable.
  failed: number
}

export type SiteFactsSummary = {
  type: 'summary'
  status: 'complete' | 'cancelled'
  sites: number
  checked: number
  invalid: number
  duplicatesRemoved: number
  maxSites: number
  concurrency: number
  timeoutMs: number
  durationMs: number
  robotsTxt: AvailabilityCounts
  homepage: AvailabilityCounts & { skipped: number }
  llmsTxt: AvailabilityCounts & { startsWithH1: number }
  botAccess: Array<{
    userAgent: string
    purpose: CrawlAiBotAccess['purpose']
    allowed: number
    blocked: number
    unknown: number
  }>
}

type Fetch = typeof publicHttpFetch

export type SiteFactsInput = {
  sites: string[]
  concurrency?: number
  respectRobots?: boolean
  signal?: AbortSignal
  onRow: (row: SiteFactsRow) => Promise<void> | void
}

export type SiteFactsDependencies = {
  fetch?: Fetch
  now?: () => Date
}

// The http(s) origin for a site, such as https://example.com for
// "example.com" or "https://example.com/blog".
function siteOrigin(value: string): string | undefined {
  const text = value.trim()
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text)
    ? text
    : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    if (!url.hostname || /\s/.test(text)) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

const clip = (value: string | undefined) =>
  value === undefined ? undefined : value.slice(0, TEXT_LIMIT)

function emptyCounts(): AvailabilityCounts {
  return {
    available: 0,
    absent: 0,
    'access-blocked': 0,
    'rate-limited': 0,
    unreachable: 0,
    failed: 0,
  }
}

function availabilityOf(status: number): CrawlAiAvailability {
  if (status >= 200 && status < 300) return 'available'
  if (status === 401 || status === 403) return 'access-blocked'
  if (status === 429) return 'rate-limited'
  if (status >= 400 && status < 500) return 'absent'
  return 'unreachable'
}

async function readHomepage(
  url: string,
  fetch: Fetch,
  signal?: AbortSignal,
): Promise<SiteHomepageFacts> {
  const startedAt = Date.now()
  const controller = abortController({
    timeoutMs: SITE_FACTS_TIMEOUT_MS,
    signal,
  })
  try {
    const { response, redirectChain } = await fetchWithRedirectChain(
      url,
      controller.signal,
      fetch,
    )
    const finalUrl = redirectChain.at(-1)?.location ?? url
    const accessBlock = detectAccessBlock({
      status: response.status,
      headers: response.headers,
    })
    let html = ''
    if (accessBlock) await response.body?.cancel().catch(() => undefined)
    else
      html = await readBoundedResponseText(
        response,
        MAX_PAGE_RESPONSE_BYTES,
        'Home page response',
      )
    const headers = Object.fromEntries(response.headers.entries())
    const fetched: PageFetchResult = {
      url,
      finalUrl,
      status: response.status,
      headers,
      html,
      usedJs: false,
      diagnostics: {
        source: 'network',
        cache: 'bypass',
        fetched: true,
        rendered: false,
        blocked: Boolean(accessBlock),
        durationMs: Date.now() - startedAt,
        retries: 0,
        rateLimit: {
          host: new URL(url).host,
          concurrency: 1,
          intervalCap: 1,
          intervalMs: 0,
        },
        accessBlock,
        redirectChain,
      },
      warnings: [],
    }
    const page = (await snapshotFetchedPage(url, fetched)).page
    return {
      url,
      outcome: 'response',
      availability: accessBlock
        ? 'access-blocked'
        : availabilityOf(response.status),
      status: response.status,
      finalUrl,
      ...(redirectChain.length ? { redirects: redirectChain } : {}),
      ...(headers['content-type']
        ? { contentType: headers['content-type'] }
        : {}),
      ...(accessBlock
        ? {
            accessBlock: {
              provider: accessBlock.provider,
              kind: accessBlock.kind,
            },
          }
        : {}),
      responseTimeMs: fetched.diagnostics.durationMs,
      sizeBytes: new TextEncoder().encode(html).byteLength,
      ...(page?.title ? { title: clip(page.title) } : {}),
      ...(page?.metaDescription
        ? { metaDescription: clip(page.metaDescription) }
        : {}),
      ...(page?.h1 ? { h1: clip(page.h1) } : {}),
      ...(page?.lang ? { lang: clip(page.lang) } : {}),
      ...(page?.canonical ? { canonical: page.canonical } : {}),
      ...(page?.metaRobots ? { metaRobots: clip(page.metaRobots) } : {}),
      ...(headers['x-robots-tag']
        ? { xRobotsTag: clip(headers['x-robots-tag']) }
        : {}),
      ...(page ? { indexable: page.indexable } : {}),
      ...(page?.indexability ? { indexability: page.indexability } : {}),
      ...(page?.markdownAlternates?.length
        ? {
            markdownAlternates: page.markdownAlternates.slice(
              0,
              MARKDOWN_ALTERNATE_LIMIT,
            ),
          }
        : {}),
      ...(headers['content-signal']
        ? { contentSignal: clip(headers['content-signal']) }
        : {}),
      linkRelations: linkRelations(headers.link),
    }
  } catch (error) {
    return {
      url,
      outcome: 'failed',
      ...requestError(error, SITE_FACTS_TIMEOUT_MS, signal),
    }
  } finally {
    controller.cleanup()
  }
}

// The first non-empty line of llms.txt, when it is a Markdown H1.
function llmsH1(text: string): string | undefined {
  const first = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim())
  const match = first?.match(/^#\s+(.+?)\s*#*\s*$/)
  return match?.[1]
}

async function checkSite(
  origin: string,
  input: SiteFactsInput,
  fetch: Fetch,
): Promise<Omit<SiteFactsRow, 'type' | 'input' | 'checkedAt'>> {
  const home = `${origin}/`
  const signalInput = {
    url: home,
    timeoutMs: SITE_FACTS_TIMEOUT_MS,
    fetch,
    signal: input.signal,
  }
  const robots = await checkRobotsAiAccess(signalInput)
  const homepageAllowed = robots.allows(home)
  const { sitemapUrls, ...robotsTxt } = robots.robotsTxt
  const homepage: SiteHomepageFacts =
    input.respectRobots !== false && homepageAllowed !== true
      ? {
          url: home,
          outcome: 'skipped',
          skipReason:
            homepageAllowed === false ? 'robots-disallowed' : 'robots-unknown',
        }
      : await readHomepage(home, fetch, input.signal)
  const llms = await readLlmsTxt(signalInput)
  const h1 = llms.llmsTxt.exists ? llmsH1(llms.text) : undefined
  return {
    origin,
    robotsTxt: {
      ...robotsTxt,
      sitemapUrls: sitemapUrls.slice(0, SITEMAP_URL_LIMIT),
      sitemapCount: sitemapUrls.length,
      homepageAllowed,
    },
    homepage,
    llmsTxt: {
      ...llms.llmsTxt,
      ...(llms.llmsTxt.exists
        ? {
            sizeBytes: new TextEncoder().encode(llms.text).byteLength,
            startsWithH1: h1 !== undefined,
            ...(h1 ? { h1: clip(h1) } : {}),
            sameSiteLinks: llmsLinks(llms.text, llms.llmsTxt.url).length,
          }
        : {}),
    },
  }
}

function countAvailability(
  counts: AvailabilityCounts,
  facts: { availability?: CrawlAiAvailability; status?: number },
): void {
  if (!facts.availability) return
  counts[facts.availability] += 1
  if (facts.status === undefined) counts.failed += 1
}

// Robots.txt, home page and llms.txt facts for many sites. Rows are written
// in input order as they finish; at most a few rows per worker wait in
// memory, so memory follows the concurrency, not the list size.
export async function checkSites(
  input: SiteFactsInput,
  dependencies: SiteFactsDependencies = {},
): Promise<SiteFactsSummary> {
  const fetch = dependencies.fetch ?? publicHttpFetch
  const now = dependencies.now ?? (() => new Date())
  const concurrency = input.concurrency ?? SITE_FACTS_DEFAULT_CONCURRENCY
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > SITE_FACTS_MAX_CONCURRENCY
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Concurrency must be an integer from 1 to ${SITE_FACTS_MAX_CONCURRENCY}.`,
    )
  }

  const entries: Array<{ input: string; origin?: string }> = []
  const seen = new Set<string>()
  let duplicatesRemoved = 0
  for (const raw of input.sites) {
    const value = raw.trim()
    if (!value) continue
    const origin = siteOrigin(value)
    const key = origin ?? value
    if (seen.has(key)) {
      duplicatesRemoved += 1
      continue
    }
    seen.add(key)
    entries.push({ input: value, origin })
  }
  if (!entries.length) {
    throw new SeoError('INVALID_INPUT', 'No sites given.')
  }
  if (entries.length > SITE_FACTS_MAX_SITES) {
    throw new SeoError(
      'INVALID_INPUT',
      `The list has ${entries.length.toLocaleString('en-US')} sites after removing duplicates. Sites mode checks up to ${SITE_FACTS_MAX_SITES.toLocaleString('en-US')} per run, so split the list and run each part.`,
    )
  }

  const startedAt = Date.now()
  const summary: SiteFactsSummary = {
    type: 'summary',
    status: 'complete',
    sites: entries.length,
    checked: 0,
    invalid: 0,
    duplicatesRemoved,
    maxSites: SITE_FACTS_MAX_SITES,
    concurrency,
    timeoutMs: SITE_FACTS_TIMEOUT_MS,
    durationMs: 0,
    robotsTxt: emptyCounts(),
    homepage: { ...emptyCounts(), skipped: 0 },
    llmsTxt: { ...emptyCounts(), startsWithH1: 0 },
    botAccess: [],
  }
  const bots = new Map<string, SiteFactsSummary['botAccess'][number]>()

  let active = 0
  const waiting: Array<() => void> = []
  const run = async (entry: (typeof entries)[number]) => {
    if (!entry.origin) {
      return {
        type: 'site' as const,
        input: entry.input,
        error: 'Not an http or https site.',
      }
    }
    while (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      if (input.signal?.aborted) return undefined
      const checkedAt = now().toISOString()
      const facts = await checkSite(entry.origin, input, fetch)
      return { type: 'site' as const, input: entry.input, checkedAt, ...facts }
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }

  // Rows wait here until every earlier row is written.
  const windowSize = concurrency * 4
  const window: Array<Promise<SiteFactsRow | undefined>> = []
  let next = 0
  while (next < entries.length || window.length) {
    while (next < entries.length && window.length < windowSize) {
      window.push(run(entries[next] as (typeof entries)[number]))
      next += 1
    }
    const row = await window.shift()
    if (!row) continue
    if (row.error) summary.invalid += 1
    else summary.checked += 1
    if (row.robotsTxt) {
      countAvailability(summary.robotsTxt, row.robotsTxt)
      for (const bot of row.robotsTxt.botAccess) {
        const counts = bots.get(bot.userAgent) ?? {
          userAgent: bot.userAgent,
          purpose: bot.purpose,
          allowed: 0,
          blocked: 0,
          unknown: 0,
        }
        if (bot.allowed === true) counts.allowed += 1
        else if (bot.allowed === false) counts.blocked += 1
        else counts.unknown += 1
        bots.set(bot.userAgent, counts)
      }
    }
    if (row.homepage?.outcome === 'skipped') summary.homepage.skipped += 1
    else if (row.homepage?.outcome === 'failed') {
      summary.homepage.unreachable += 1
      summary.homepage.failed += 1
    } else if (row.homepage) countAvailability(summary.homepage, row.homepage)
    if (row.llmsTxt) {
      countAvailability(summary.llmsTxt, row.llmsTxt)
      if (row.llmsTxt.startsWithH1) summary.llmsTxt.startsWithH1 += 1
    }
    await input.onRow(row)
  }
  if (input.signal?.aborted) summary.status = 'cancelled'
  summary.botAccess = [...bots.values()]
  summary.durationMs = Date.now() - startedAt
  return summary
}
