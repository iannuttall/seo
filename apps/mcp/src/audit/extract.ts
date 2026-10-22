import { Parser } from 'htmlparser2'

// Reads one HTML response as a stream and keeps only the facts the audit
// needs. The body is never held whole: each chunk goes through the parser
// and is dropped, so memory per page stays small whatever the page size.

export const MAX_HTML_BYTES = 2_000_000
const MAX_ANCHOR_CHARS = 100
const MAX_LINKS = 500

export type Link = { u: string; a: string; n?: 1 }

export type PageFacts = {
  title: string | null
  description: string | null
  h1: string | null
  canonical: string | null
  robots: string | null
  lang: string | null
  words: number
  bytes: number
  truncated: boolean
  internal: Link[]
  external: number
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')

// An http(s) URL without its fragment, or null.
export function resolveUrl(href: string, base: string): URL | null {
  const url = URL.parse(href.trim(), base)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null
  }
  url.hash = ''
  return url
}

export async function extractPage(
  response: Response,
  pageUrl: string,
  origin: string,
): Promise<PageFacts> {
  let title = ''
  let h1 = ''
  let inTitle = false
  let inH1 = false
  let titleSeen = false
  let h1Seen = false
  let skip = 0
  let description: string | null = null
  let canonical: string | null = null
  let lang: string | null = null
  let base = pageUrl
  const robots: string[] = []
  let words = 0
  let anchor: { href: string; text: string; nofollow: boolean } | null = null
  const internal = new Map<string, Link>()
  let external = 0

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'script' || name === 'style' || name === 'noscript') {
          skip += 1
        } else if (name === 'html' && attributes.lang) {
          lang = attributes.lang
        } else if (name === 'base' && attributes.href) {
          base = URL.parse(attributes.href, pageUrl)?.href ?? base
        } else if (name === 'title' && !titleSeen) {
          inTitle = true
        } else if (name === 'h1' && !h1Seen) {
          inH1 = true
        } else if (name === 'meta') {
          const metaName = attributes.name?.toLowerCase()
          if (metaName === 'description' && description === null) {
            description = clean(attributes.content ?? '')
          }
          if (metaName === 'robots' && attributes.content) {
            robots.push(attributes.content)
          }
        } else if (
          name === 'link' &&
          canonical === null &&
          attributes.rel?.toLowerCase().split(/\s+/).includes('canonical') &&
          attributes.href
        ) {
          canonical = resolveUrl(attributes.href, base)?.href ?? null
        } else if (name === 'a' && attributes.href) {
          anchor = {
            href: attributes.href,
            text: '',
            nofollow: /\bnofollow\b/i.test(attributes.rel ?? ''),
          }
        }
      },
      ontext(text) {
        if (skip > 0) return
        if (inTitle) title += text
        if (inH1) h1 += text
        if (anchor && anchor.text.length < MAX_ANCHOR_CHARS) anchor.text += text
        for (const word of text.split(/\s+/)) if (word) words += 1
      },
      onclosetag(name) {
        if (name === 'script' || name === 'style' || name === 'noscript') {
          skip = Math.max(0, skip - 1)
        } else if (name === 'title' && inTitle) {
          inTitle = false
          titleSeen = true
        } else if (name === 'h1' && inH1) {
          inH1 = false
          h1Seen = true
        } else if (name === 'a' && anchor) {
          const to = resolveUrl(anchor.href, base)
          if (to?.origin === origin) {
            const key = to.href
            if (!internal.has(key) && internal.size < MAX_LINKS) {
              const link: Link = {
                u: key,
                a: clean(anchor.text).slice(0, MAX_ANCHOR_CHARS),
              }
              if (anchor.nofollow) link.n = 1
              internal.set(key, link)
            }
          } else if (to) {
            external += 1
          }
          anchor = null
        }
      },
    },
    { decodeEntities: true },
  )

  let bytes = 0
  let truncated = false
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      parser.write(decoder.decode(value, { stream: true }))
      if (bytes >= MAX_HTML_BYTES) {
        truncated = true
        await reader.cancel()
        break
      }
    }
    parser.write(decoder.decode())
  }
  parser.end()

  return {
    title: titleSeen || title ? clean(title) : null,
    description,
    h1: h1Seen || h1 ? clean(h1) : null,
    canonical,
    robots: robots.length ? robots.join(', ').toLowerCase() : null,
    lang,
    words,
    bytes,
    truncated,
    internal: [...internal.values()],
    external,
  }
}
