// Shared by the noindex checker, the title and meta description checker and
// the redirect map checker: follow a public URL one hop at a time behind the
// site's own guards, then read what the final page tells Google. The
// directive rules come from @seo/core, so the site and the CLI agree on what
// a robots tag means.
import {
  boundedText,
  type EffectiveSnippetControl,
  effectiveSnippetControl,
  headFacts,
  metaRobotsDirectives,
  type RedirectOutcome,
  type RobotsDirective,
  traceRedirects,
  xRobotsDirectives,
} from '@seo/core/commands'
import { parseAttributes } from './favicon-image.ts'
import { safePublicFetchMessage } from './public-fetch-errors.ts'
import { ToolInputError } from './serp-preview.ts'
import { parseSitemapUrl, type SitemapFetcher } from './sitemap.ts'

export const PAGE_TRACE_LIMITS = Object.freeze({
  htmlBytes: 1_048_576,
  timeoutMilliseconds: 8_000,
})

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

// A public http or https URL with no credentials and no custom port. Old
// sites in a migration often still start on http, so http is allowed here.
export function parsePublicUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) {
    throw new ToolInputError('Enter a public website URL.')
  }
  const trimmed = value.trim()
  const complete = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(complete)
  } catch {
    throw new ToolInputError('Enter a public website URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolInputError('Use an http or https URL.')
  }
  if (url.protocol === 'http:' && url.port) {
    throw new ToolInputError(
      'Use a public URL without credentials or a custom port.',
    )
  }
  try {
    // The sitemap guard checks the host, credentials and port. It accepts
    // only https, so an http URL is checked as its https twin.
    parseSitemapUrl(
      url.protocol === 'http:'
        ? `https://${url.host}${url.pathname}${url.search}`
        : url.toString(),
    )
  } catch {
    throw new ToolInputError(
      'Use a public URL without credentials or a custom port.',
    )
  }
  url.hash = ''
  return url
}

export type TraceHop = {
  url: string
  status: number
  location: string | null
  robotsHeader: string | null
}

export type PageTrace = {
  // Every response, in order. The last one is the final page when the
  // outcome is done.
  hops: TraceHop[]
  redirects: number
  finalUrl: string
  finalStatus: number | null
  outcome: RedirectOutcome
  error?: string
  contentType: string | null
  // Response headers of the final page that the checks read.
  headers: {
    robots: string | null
    link: string | null
    platform: string | null
  }
  html: string | null
}

function platformFromHeaders(headers: Headers): string | null {
  if (headers.has('x-vercel-id')) return 'vercel'
  if (headers.has('x-shopid') || headers.has('x-shopify-stage')) {
    return 'shopify'
  }
  if (headers.has('x-wix-request-id')) return 'wix'
  if (headers.get('server')?.toLowerCase() === 'netlify') return 'netlify'
  return null
}

class UnsafeHopError extends Error {}

// Follows the redirects with the shared tracer in @seo/core, through the
// site's fetcher. Every hop is checked against the public URL rules before
// it is requested, and only the final page's body is read, up to maxBytes.
export async function tracePage(
  start: URL,
  fetcher: SitemapFetcher,
  options: {
    userAgent: string
    readBody: boolean
    maxBytes?: number
    timeoutMilliseconds?: number
  },
): Promise<PageTrace> {
  const robotsHeaders = new Map<string, string | null>()
  let final: Omit<
    PageTrace,
    'hops' | 'redirects' | 'finalUrl' | 'finalStatus' | 'outcome'
  > = {
    contentType: null,
    headers: { robots: null, link: null, platform: null },
    html: null,
  }
  const trace = await traceRedirects(start.toString(), {
    timeoutMs:
      options.timeoutMilliseconds ?? PAGE_TRACE_LIMITS.timeoutMilliseconds,
    fetch: async (url, init) => {
      try {
        parsePublicUrl(url)
      } catch {
        throw new UnsafeHopError(
          `It redirects to ${url}, which this tool cannot fetch.`,
        )
      }
      const headers = new Headers(init.headers)
      headers.set('user-agent', options.userAgent)
      return fetcher(url, { ...init, headers })
    },
    onResponse: async (response, url) => {
      robotsHeaders.set(url, response.headers.get('x-robots-tag'))
      if (
        REDIRECT_STATUSES.has(response.status) &&
        response.headers.has('location')
      ) {
        return
      }
      const contentType =
        response.headers.get('content-type')?.split(';')[0]?.trim() ?? null
      final = {
        contentType,
        headers: {
          robots: response.headers.get('x-robots-tag'),
          link: response.headers.get('link'),
          platform: platformFromHeaders(response.headers),
        },
        html: null,
      }
      const isHtml = /^(?:text\/html|application\/xhtml\+xml)$/iu.test(
        contentType ?? '',
      )
      if (options.readBody && response.status === 200 && isHtml) {
        try {
          final.html = await boundedText(
            response,
            options.maxBytes ?? PAGE_TRACE_LIMITS.htmlBytes,
          )
        } catch {
          final.html = null
        }
      }
    },
  })
  const unsafe = trace.error?.startsWith('It redirects to ')
  return {
    ...final,
    hops: trace.steps.map((step) => ({
      url: step.url,
      status: step.status,
      location: step.location,
      robotsHeader: robotsHeaders.get(step.url) ?? null,
    })),
    redirects: trace.hops,
    finalUrl: trace.final_url,
    finalStatus: trace.final_status,
    outcome: trace.outcome,
    error:
      trace.outcome === 'timeout'
        ? `${trace.final_url} did not answer within ${(options.timeoutMilliseconds ?? PAGE_TRACE_LIMITS.timeoutMilliseconds) / 1_000} seconds.`
        : trace.outcome === 'error' && !unsafe
          ? safePublicFetchMessage(new Error(trace.error), 'page')
          : trace.error,
  }
}

// Who a robots rule applies to. Google reads only robots, googlebot and
// googlebot-news in a meta name; Bing reads robots and bingbot.
export type RobotsAudience = 'all' | 'google' | 'google-news' | 'bing' | 'other'

export type RobotsRule = {
  source: 'meta' | 'header'
  // The meta name, or the crawler named before a header rule.
  name: string
  value: string
  audience: RobotsAudience
  inHead: boolean
  directives: RobotsDirective[]
}

export type PageSignals = {
  title: { count: number; value: string | null }
  description: { count: number; value: string | null }
  h1: string | null
  canonical: {
    count: number
    href: string | null
    header: string | null
  }
  robots: RobotsRule[]
  google: {
    noindex: boolean
    nofollow: boolean
    snippet: EffectiveSnippetControl
    unavailableAfter: { raw: string; passed: boolean } | null
  }
  bingNoindex: boolean
  metaRefresh: { seconds: number; url: string | null } | null
  generator: string | null
}

const ROBOTS_NAMES =
  /^(?:robots|googlebot(?:-news)?|bingbot|[a-z][\w-]*bot|slurp|yandex|baiduspider)$/u

function audienceOf(name: string): RobotsAudience {
  if (name === 'robots' || name === '') return 'all'
  if (name === 'googlebot') return 'google'
  if (name === 'googlebot-news') return 'google-news'
  if (name === 'bingbot') return 'bing'
  return 'other'
}

function stripInert(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/giu, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/giu, ' ')
}

// Splits one X-Robots-Tag value into rules per crawler, the way Google
// reads a "googlebot: noindex" prefix: it applies until the next prefix.
function headerRules(value: string | null): RobotsRule[] {
  if (!value) return []
  const groups = new Map<string, string[]>()
  let agent = ''
  for (const raw of value.split(',')) {
    const token = raw.trim()
    if (!token) continue
    const scoped = token.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/iu)
    const prefix = scoped?.[1]?.toLowerCase()
    if (
      scoped &&
      prefix !== 'unavailable_after' &&
      !prefix?.startsWith('max-')
    ) {
      agent = prefix ?? ''
      const rest = scoped[2]?.trim()
      if (rest) groups.set(agent, [...(groups.get(agent) ?? []), rest])
      continue
    }
    groups.set(agent, [...(groups.get(agent) ?? []), token])
  }
  return [...groups].map(([name, tokens]) => {
    const joined = tokens.join(', ')
    return {
      source: 'header' as const,
      name,
      value: joined,
      audience: audienceOf(name),
      inHead: true,
      directives: [...metaRobotsDirectives(joined)],
    }
  })
}

function unavailableAfter(
  values: string[],
  now: Date,
): PageSignals['google']['unavailableAfter'] {
  for (const value of values) {
    const match = value.match(/unavailable_after\s*:\s*([^,]+)(,[^,]+)?/iu)
    if (!match?.[1]) continue
    // RFC 850 dates carry a comma ("Friday, 25-Jun-27 15:00:00 PST"), so
    // try the value with the next part when the first part is not a date.
    const short = match[1].trim()
    const long = `${short}${match[2] ?? ''}`.trim()
    const raw = Number.isFinite(Date.parse(short)) ? short : long
    const time = Date.parse(raw)
    return { raw, passed: Number.isFinite(time) && time <= now.getTime() }
  }
  return null
}

export function readPageSignals(
  html: string | null,
  url: string,
  headers: { robots: string | null; link: string | null },
  now = new Date(),
): PageSignals {
  const source = stripInert(html ?? '')
  const headEnd = (() => {
    const close = source.search(/<\/head\s*>/iu)
    if (close >= 0) return close
    const body = source.search(/<body\b/iu)
    return body >= 0 ? body : source.length
  })()

  let titleCount = 0
  for (const _ of source.slice(0, headEnd).matchAll(/<title\b/giu)) {
    titleCount += 1
  }
  let descriptionCount = 0
  let canonicalCount = 0
  let generator: string | null = null
  let metaRefresh: PageSignals['metaRefresh'] = null
  const robots: RobotsRule[] = []
  for (const match of source.matchAll(/<(meta|link)\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const inHead = (match.index ?? 0) < headEnd
    if (match[1]?.toLowerCase() === 'link') {
      const rel = attributes.get('rel')?.toLowerCase().split(/\s+/u) ?? []
      if (rel.includes('canonical') && inHead) canonicalCount += 1
      continue
    }
    const name = attributes.get('name')?.trim().toLowerCase()
    const content = attributes.get('content')
    const httpEquiv = attributes.get('http-equiv')?.trim().toLowerCase()
    if (httpEquiv === 'refresh' && content !== undefined && !metaRefresh) {
      const refresh = content.match(
        /^\s*(\d+)\s*(?:[;,]\s*(?:url\s*=\s*)?['"]?([^'"]*)['"]?)?/iu,
      )
      if (refresh) {
        metaRefresh = {
          seconds: Number(refresh[1]),
          url: refresh[2]?.trim() || null,
        }
      }
    }
    if (!name || content === undefined) continue
    if (name === 'description' && inHead) descriptionCount += 1
    if (name === 'generator' && !generator) generator = content.slice(0, 80)
    if (ROBOTS_NAMES.test(name)) {
      robots.push({
        source: 'meta',
        name,
        value: content.trim(),
        audience: audienceOf(name),
        inHead,
        directives: [...metaRobotsDirectives(content)],
      })
    }
  }
  robots.push(...headerRules(headers.robots))

  const facts = html
    ? headFacts(html, url)
    : { title: null, description: null, h1: null, canonical: null }
  // An empty tag is still a tag. headFacts trims it to nothing, so the tag
  // count decides between empty and missing.
  const titleValue = facts.title ?? (titleCount > 0 ? '' : null)
  const descriptionValue =
    facts.description ?? (descriptionCount > 0 ? '' : null)

  const forGoogle = robots.filter(
    (rule) => rule.audience === 'all' || rule.audience === 'google',
  )
  const googleMeta = forGoogle
    .filter((rule) => rule.source === 'meta')
    .map((rule) => rule.value)
  const googleHeader = xRobotsDirectives(headers.robots ?? undefined)
  const googleDirectives = new Set([
    ...metaRobotsDirectives(googleMeta),
    ...googleHeader,
  ])
  const expiry = unavailableAfter(
    forGoogle.map((rule) => rule.value),
    now,
  )
  const bingDirectives = new Set([
    ...metaRobotsDirectives(
      robots
        .filter(
          (rule) =>
            rule.source === 'meta' &&
            (rule.audience === 'all' || rule.audience === 'bing'),
        )
        .map((rule) => rule.value),
    ),
    ...xRobotsDirectives(headers.robots ?? undefined, 'bingbot'),
  ])

  const linkCanonical = headers.link
    ?.split(/,(?=\s*<)/u)
    .find((part) => /;\s*rel\s*=\s*"?canonical"?/iu.test(part))
    ?.match(/<([^>]+)>/u)?.[1]
  let header: string | null = null
  if (linkCanonical) {
    try {
      header = new URL(linkCanonical, url).toString()
    } catch {
      header = linkCanonical
    }
  }

  return {
    title: { count: titleCount, value: titleValue },
    description: { count: descriptionCount, value: descriptionValue },
    h1: facts.h1,
    canonical: { count: canonicalCount, href: facts.canonical, header },
    robots,
    google: {
      noindex: googleDirectives.has('noindex') || Boolean(expiry?.passed),
      nofollow: googleDirectives.has('nofollow'),
      snippet: effectiveSnippetControl({
        metaRobots: googleMeta,
        xRobotsTag: headers.robots ?? undefined,
      }),
      unavailableAfter: expiry,
    },
    bingNoindex: bingDirectives.has('noindex'),
    metaRefresh,
    generator,
  }
}
