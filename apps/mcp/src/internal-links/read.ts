import { Parser } from 'htmlparser2'
import { MAX_HTML_BYTES } from '../audit/extract.ts'

// What the internal links crawl needs from one HTML response, read in one
// pass with htmlparser2: the same facts the CLI's crawl reads with cheerio
// (packages/core/src/analyze/internal-links-crawl.ts). The HTML is kept,
// up to MAX_HTML_BYTES, because the shared sentence reader works on it.

const MAX_LINKS = 1000
const MAX_ANCHOR_CHARS = 200
const MAX_HEADINGS = 100

export type LinkLocation = 'navigation' | 'footer' | 'main-content' | 'other'

export type LinkPage = {
  html: string
  title: string
  metaDescription: string
  canonical: string | null
  lang: string | null
  robots: string[]
  headings: Array<{ level: number; text: string }>
  links: Array<{ href: string; text: string; location: LinkLocation }>
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

export async function readLinkPage(response: Response): Promise<LinkPage> {
  let html = ''
  let title = ''
  let titleDone = false
  let inTitle = false
  let metaDescription: string | null = null
  let canonical: string | null = null
  let lang: string | null = null
  const robots: string[] = []
  const headings: LinkPage['headings'] = []
  let heading: { level: number; text: string } | null = null
  const links: LinkPage['links'] = []
  let anchor: { href: string; text: string; location: LinkLocation } | null =
    null
  let skip = 0
  // Every open element, marked when it is a nav or header, a footer, or a
  // main, article or role="main", with a count of each kind open, so a
  // link knows what it sits in. htmlparser2 closes every element it opens.
  type Kind = 'nav' | 'footer' | 'main'
  const open: Array<Kind | null> = []
  const inside: Record<Kind, number> = { nav: 0, footer: 0, main: 0 }
  const location = (): LinkLocation =>
    inside.nav
      ? 'navigation'
      : inside.footer
        ? 'footer'
        : inside.main
          ? 'main-content'
          : 'other'

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const kind: Kind | null =
          name === 'nav' || name === 'header'
            ? 'nav'
            : name === 'footer'
              ? 'footer'
              : name === 'main' ||
                  name === 'article' ||
                  attributes.role?.toLowerCase() === 'main'
                ? 'main'
                : null
        open.push(kind)
        if (kind) inside[kind] += 1
        if (name === 'script' || name === 'style' || name === 'noscript') {
          skip += 1
        } else if (name === 'html' && attributes.lang) lang = attributes.lang
        else if (name === 'title' && !titleDone) inTitle = true
        else if (/^h[1-3]$/.test(name) && headings.length < MAX_HEADINGS) {
          heading = { level: Number(name.slice(1)), text: '' }
        } else if (name === 'meta') {
          const meta = attributes.name?.toLowerCase()
          if (meta === 'description' && metaDescription === null) {
            metaDescription = clean(attributes.content ?? '')
          }
          if (
            (meta === 'robots' || meta === 'googlebot') &&
            attributes.content
          ) {
            robots.push(attributes.content)
          }
        } else if (
          name === 'link' &&
          canonical === null &&
          attributes.rel?.toLowerCase().split(/\s+/).includes('canonical') &&
          attributes.href
        ) {
          canonical = attributes.href
        } else if (name === 'a' && attributes.href !== undefined) {
          anchor = { href: attributes.href, text: '', location: location() }
        }
      },
      ontext(text) {
        if (skip > 0) return
        if (inTitle) title += text
        if (heading) heading.text += text
        if (anchor && anchor.text.length < MAX_ANCHOR_CHARS) anchor.text += text
      },
      onclosetag(name) {
        const kind = open.pop()
        if (kind) inside[kind] -= 1
        if (name === 'script' || name === 'style' || name === 'noscript') {
          skip = Math.max(0, skip - 1)
        } else if (name === 'title' && inTitle) {
          inTitle = false
          titleDone = true
        } else if (heading && name === `h${heading.level}`) {
          const text = clean(heading.text)
          if (text) headings.push({ level: heading.level, text })
          heading = null
        } else if (name === 'a' && anchor) {
          if (links.length < MAX_LINKS) {
            links.push({ ...anchor, text: clean(anchor.text) })
          }
          anchor = null
        }
      },
    },
    { decodeEntities: true },
  )

  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      const chunk = decoder.decode(value, { stream: true })
      html += chunk
      parser.write(chunk)
      if (bytes >= MAX_HTML_BYTES) {
        await reader.cancel()
        break
      }
    }
  }
  parser.end()
  return {
    html,
    title: clean(title),
    metaDescription: metaDescription ?? '',
    canonical,
    lang,
    robots,
    headings,
    links,
  }
}
