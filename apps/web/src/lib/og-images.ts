// Build-time sharing images. After `astro build`, every prerendered page gets
// a PNG beside its HTML (`/pricing/index.html` -> `/pricing/index.png`),
// drawn by Takumi from the page's H1 (else its og:title) over art: a post's
// own cover, else its section's art in src/assets/og. Pages kept out of
// search point at the home page's card instead.
// The build fails if a page's og:image does not match the file written.
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { render } from 'takumi-js'
import {
  OG_COVER_SRC,
  OG_IMAGE_FORMAT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  type OgCoverAlign,
  ogCardFonts,
  renderOgCoverCard,
} from './og-card'

// Each section's card art. Pages outside these sections use the home art.
const SECTION_ART = new Set([
  'alternatives',
  'docs',
  'features',
  'guides',
  'integrations',
  'pricing',
  'tools',
])

const sectionArtFile = (pathname: string) => {
  const section = pathname.replace(/^\/+/, '').split('/')[0] ?? ''
  const name = SECTION_ART.has(section) ? section : 'home'
  return fileURLToPath(new URL(`../assets/og/${name}.webp`, import.meta.url))
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#x'))
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)))
    return ENTITIES[code.toLowerCase()] ?? match
  })

/** Reads one `<meta property="og:…">` value from built HTML. */
export const readOgMeta = (html: string, property: string) => {
  const tag = html.match(
    new RegExp(`<meta[^>]+property="og:${property}"[^>]*>`, 'i'),
  )?.[0]
  const content = tag?.match(/content="([^"]*)"/i)?.[1]
  return content === undefined ? undefined : decodeEntities(content)
}

/** The path of an image marked `data-og-cover`, such as a post's cover. */
export const readOgCover = (html: string) => {
  const tag = html.match(/<img\b[^>]*\sdata-og-cover\b[^>]*>/i)?.[0]
  if (!tag) return undefined
  const src = tag.match(/\ssrc="([^"]+)"/i)?.[1]
  const align = tag.match(/\sdata-og-cover="left"/i) ? 'left' : 'center'
  return src ? { src, align: align as OgCoverAlign } : undefined
}

/** Reads the text of the first `<h1>` in built HTML. */
export const readH1 = (html: string) => {
  const inner = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (inner === undefined) return undefined
  const text = decodeEntities(
    inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()
  return text || undefined
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  )

const htmlFileFor = async (outDir: string, pathname: string) => {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '')
  const nested = path.join(outDir, trimmed, 'index.html')
  if (await exists(nested)) return nested
  const flat = path.join(outDir, `${trimmed || 'index'}.html`)
  return (await exists(flat)) ? flat : null
}

export const ogImages = (): AstroIntegration => ({
  name: 'seo-og-images',
  hooks: {
    'astro:build:done': async ({ dir, pages, logger }) => {
      const outDir = fileURLToPath(dir)
      let written = 0
      for (const page of pages) {
        const htmlFile = await htmlFileFor(outDir, page.pathname)
        if (!htmlFile) continue
        const html = await readFile(htmlFile, 'utf8')
        // The card shows what the page says, not the longer SEO title.
        const title = readH1(html) ?? readOgMeta(html, 'title')
        const image = readOgMeta(html, 'image')
        if (!title || !image) continue
        const imageFile = htmlFile.replace(/\.html$/, `.${OG_IMAGE_FORMAT}`)
        const expected = `/${path.relative(outDir, imageFile).split(path.sep).join('/')}`
        // Pages kept out of search share the home page's card.
        if (
          new URL(image).pathname === '/index.png' &&
          expected !== '/index.png'
        )
          continue
        if (new URL(image).pathname !== expected) {
          throw new Error(
            `${page.pathname}: og:image is ${image}, but the card is written to ${expected}`,
          )
        }
        // A post's own cover is the card's background; other pages get
        // their section's art.
        const cover = readOgCover(html)
        const coverFile = cover
          ? path.join(outDir, decodeEntities(cover.src).replace(/^\/+/, ''))
          : sectionArtFile(page.pathname)
        if (!(await exists(coverFile))) {
          throw new Error(`${page.pathname}: card art ${coverFile} is missing`)
        }
        const png = await render(
          renderOgCoverCard({ title, align: cover?.align }),
          {
            width: OG_IMAGE_WIDTH,
            height: OG_IMAGE_HEIGHT,
            format: OG_IMAGE_FORMAT,
            fonts: ogCardFonts,
            images: [{ src: OG_COVER_SRC, data: () => readFile(coverFile) }],
          },
        )
        await writeFile(imageFile, png)
        written += 1
      }
      logger.info(`Wrote ${written} sharing images.`)
    },
  },
})
