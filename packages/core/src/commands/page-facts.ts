import { Parser } from 'htmlparser2'
import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import {
  hasMetaRobotsDirective,
  hasXRobotsDirective,
} from '../robots-directives.js'
import type { PageFacts } from './types.js'

// Live facts for report URLs: status, redirect target, title, meta
// description, first H1, canonical and robots. One request per URL, no
// redirects followed, at most MAX_BYTES of HTML read, nothing stored. Pure
// JavaScript, so the CLI and the hosted MCP check pages the same way.

const MAX_PAGES = 20
const TIMEOUT_MS = 6000
const MAX_BYTES = 1_000_000

// Null stays null (no tag); an empty tag stays ''.
const clean = (value: string | null) =>
  value === null ? null : value.trim().replace(/\s+/g, ' ')

// A robots meta tag for one crawler, such as googlebot, googlebot-news or
// bingbot. Only robots and googlebot apply to Google Search.
const BOT_META = /^([a-z][a-z0-9_-]*bot(-[a-z]+)?|slurp|yandex|baiduspider)$/

// Reads at most maxBytes of the body as text.
export async function boundedText(
  response: Response,
  maxBytes = MAX_BYTES,
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let total = 0
  while (total < maxBytes) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    total += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel()
  return text
}

export function headFacts(
  html: string,
  url: string,
): Pick<
  PageFacts,
  'title' | 'description' | 'h1' | 'canonical' | 'robots' | 'google_noindex'
> {
  let title: string | null = null
  let h1: string | null = null
  let inTitle = false
  let inH1 = false
  let titleDone = false
  let h1Done = false
  let description: string | null = null
  let canonical: string | null = null
  const robots: string[] = []
  const google: string[] = []
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'title' && !titleDone) {
          inTitle = true
          title ??= ''
        }
        if (name === 'h1' && !h1Done) {
          inH1 = true
          h1 ??= ''
        }
        if (name === 'meta') {
          const metaName = attributes.name?.trim().toLowerCase() ?? ''
          const content = attributes.content?.trim()
          if (metaName === 'description' && description === null) {
            description = attributes.content ?? ''
          }
          if (content && (metaName === 'robots' || BOT_META.test(metaName))) {
            // A crawler's own tag is shown with its name.
            robots.push(
              metaName === 'robots' ? content : `${metaName}: ${content}`,
            )
            if (metaName === 'robots' || metaName === 'googlebot') {
              google.push(content)
            }
          }
        }
        if (
          name === 'link' &&
          canonical === null &&
          attributes.rel?.toLowerCase().split(/\s+/).includes('canonical') &&
          attributes.href
        ) {
          try {
            canonical = new URL(attributes.href, url).toString()
          } catch {
            canonical = attributes.href
          }
        }
      },
      ontext(text) {
        if (inTitle) title = (title ?? '') + text
        if (inH1) h1 = (h1 ?? '') + text
      },
      onclosetag(name) {
        if (name === 'title' && inTitle) {
          inTitle = false
          titleDone = true
        }
        if (name === 'h1' && inH1) {
          inH1 = false
          h1Done = true
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  )
  parser.write(html)
  parser.end()
  return {
    title: clean(title),
    description: clean(description),
    h1: clean(h1),
    canonical,
    robots: robots.length ? robots.join(', ') : null,
    google_noindex: hasMetaRobotsDirective(google, 'noindex'),
  }
}

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
    google_noindex: null,
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
    const headerRobots = response.headers.get('x-robots-tag')
    // Scoped by crawler: "bingbot: noindex" is not a noindex for Google.
    const headerNoindex = hasXRobotsDirective(
      headerRobots ?? undefined,
      'noindex',
    )
    const auth = response.headers.get('www-authenticate')
    if (auth) out.www_authenticate = auth.slice(0, 200)
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.includes('html')
    ) {
      out.robots = headerRobots
      out.google_noindex = headerNoindex
      await response.body?.cancel()
      return out
    }
    const head = headFacts(await boundedText(response), url)
    Object.assign(out, head)
    out.robots = [headerRobots, head.robots].filter(Boolean).join(', ') || null
    out.google_noindex = headerNoindex || head.google_noindex
  } catch (error) {
    out.error = error instanceof Error ? error.message : 'fetch failed'
  }
  return out
}

export function checkPages(urls: string[]): Promise<PageFacts[]> {
  return Promise.all(urls.slice(0, MAX_PAGES).map(facts))
}

const MAX_HOPS = 5

export type RedirectKind = 'permanent' | 'temporary'

export type LiveCheck = {
  // The URL's own response.
  first: PageFacts
  // Each redirect followed, in order, with its status.
  hops: { from: string; status: number; to: string; kind: RedirectKind }[]
  // The last response: the URL itself when it does not redirect. Null when
  // the redirects loop or go past MAX_HOPS.
  last: PageFacts | null
}

export const redirectKind = (status: number | null): RedirectKind | null =>
  status === 301 || status === 308
    ? 'permanent'
    : status === 302 || status === 303 || status === 307
      ? 'temporary'
      : null

// One URL fetched live from this machine or server, following up to
// MAX_HOPS redirects one request at a time. These are the redirects the
// server sends; a browser's HSTS upgrade (shown as "307 Internal Redirect")
// never reaches a server-side fetch.
export async function liveCheck(url: string): Promise<LiveCheck> {
  const first = await facts(url)
  const hops: LiveCheck['hops'] = []
  const seen = new Set([url])
  let last = first
  while (last.redirects_to && last.status !== null) {
    const kind = redirectKind(last.status)
    if (!kind) break
    const to = last.redirects_to
    hops.push({ from: last.url, status: last.status, to, kind })
    if (seen.has(to) || hops.length > MAX_HOPS) {
      return { first, hops, last: null }
    }
    seen.add(to)
    last = await facts(to)
  }
  return { first, hops, last }
}

// A note, not a defect: same-site 302 and 307 redirects are temporary, and a
// permanent move (such as adding a trailing slash) usually uses 301 or 308.
export function temporaryRedirectNote(
  pages: Pick<PageFacts, 'url' | 'status' | 'redirects_to'>[],
): string | null {
  const temporary = pages.filter(
    (page) =>
      (page.status === 302 || page.status === 307) &&
      page.redirects_to !== null &&
      new URL(page.redirects_to).host === new URL(page.url).host,
  )
  if (!temporary.length) return null
  return `Note: 302 and 307 are temporary redirects; a permanent move usually uses 301 or 308. Temporary redirects here: ${temporary
    .map((page) => `${page.url} (${page.status} to ${page.redirects_to})`)
    .join('; ')}.`
}
