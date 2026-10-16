import { Parser } from 'htmlparser2'
import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import type { PageFacts } from './types.js'

// Live facts for report URLs: status, redirect target, title, meta
// description, first H1, canonical and robots. One request per URL, no
// redirects followed, at most MAX_BYTES of HTML read, nothing stored. Pure
// JavaScript, so the CLI and the hosted MCP check pages the same way.

const MAX_PAGES = 20
const TIMEOUT_MS = 6000
const MAX_BYTES = 1_000_000

const clean = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, ' ') || null

// Reads at most MAX_BYTES of the body as text.
async function boundedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let total = 0
  while (total < MAX_BYTES) {
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
): Pick<PageFacts, 'title' | 'description' | 'h1' | 'canonical' | 'robots'> {
  let title = ''
  let h1 = ''
  let inTitle = false
  let inH1 = false
  let titleDone = false
  let h1Done = false
  let description: string | null = null
  let canonical: string | null = null
  const robots: string[] = []
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'title' && !titleDone) inTitle = true
        if (name === 'h1' && !h1Done) inH1 = true
        if (name === 'meta') {
          const metaName = attributes.name?.toLowerCase()
          if (metaName === 'description' && description === null) {
            description = attributes.content ?? null
          }
          if (metaName === 'robots' && attributes.content) {
            robots.push(attributes.content)
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
        if (inTitle) title += text
        if (inH1) h1 += text
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
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.includes('html')
    ) {
      out.robots = headerRobots
      await response.body?.cancel()
      return out
    }
    const head = headFacts(await boundedText(response), url)
    Object.assign(out, head)
    out.robots = [headerRobots, head.robots].filter(Boolean).join(', ') || null
  } catch (error) {
    out.error = error instanceof Error ? error.message : 'fetch failed'
  }
  return out
}

export function checkPages(urls: string[]): Promise<PageFacts[]> {
  return Promise.all(urls.slice(0, MAX_PAGES).map(facts))
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
