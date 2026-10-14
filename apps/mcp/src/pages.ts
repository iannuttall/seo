// Live page facts for report URLs: status, redirect target, title, meta
// description, first H1, canonical and robots. One request per URL, no
// redirects followed, nothing stored.

import type { PageFacts } from '@seo/core/commands'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
}

// HTMLRewriter gives raw text and attributes, so entities such as &amp; are
// decoded here to show the text a searcher sees.
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, code: string) => {
      if (code[0] === '#') {
        const point =
          code[1]?.toLowerCase() === 'x'
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10)
        return Number.isFinite(point) && point > 0 && point < 0x110000
          ? String.fromCodePoint(point)
          : match
      }
      return ENTITIES[code.toLowerCase()] ?? match
    },
  )
}

const clean = (value: string | null) =>
  value === null
    ? null
    : decodeEntities(value).trim().replace(/\s+/g, ' ') || null

const MAX_PAGES = 20
const TIMEOUT_MS = 6000
const USER_AGENT = 'SEOSkillBot/1.0 (+https://seoskill.dev)'

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
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
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
    let title = ''
    let h1 = ''
    let inTitle = false
    let inH1 = false
    await new HTMLRewriter()
      .on('title', {
        element(element) {
          inTitle = !title
          element.onEndTag(() => {
            inTitle = false
          })
        },
        text(text) {
          if (inTitle) title += text.text
        },
      })
      .on('h1', {
        element(element) {
          inH1 = !h1
          element.onEndTag(() => {
            inH1 = false
          })
        },
        text(text) {
          if (inH1) h1 += text.text
        },
      })
      .on('meta', {
        element(element) {
          const name = element.getAttribute('name')?.toLowerCase()
          const content = element.getAttribute('content')
          if (name === 'description' && out.description === null) {
            out.description = content
          }
          if (name === 'robots' && content) {
            out.robots = [out.robots, content].filter(Boolean).join(', ')
          }
        },
      })
      .on('link[rel="canonical"]', {
        element(element) {
          const href = element.getAttribute('href')
          if (href && out.canonical === null) {
            out.canonical = new URL(decodeEntities(href), url).toString()
          }
        },
      })
      .transform(response)
      .arrayBuffer()
    out.title = clean(title)
    out.h1 = clean(h1)
    out.description = clean(out.description)
  } catch (error) {
    out.error = error instanceof Error ? error.message : 'fetch failed'
  }
  return out
}

export async function pageFacts(urls: string[]): Promise<PageFacts[]> {
  return Promise.all(urls.slice(0, MAX_PAGES).map(facts))
}
