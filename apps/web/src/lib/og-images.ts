// Build-time sharing images. After `astro build`, every prerendered page gets
// a PNG beside its HTML (`/pricing/index.html` -> `/pricing/index.png`),
// drawn by Takumi from the page's H1 (else its og:title). Pages kept out of
// search point at the home page's card instead.
// The build fails if a page's og:image does not match the file written.
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { render } from 'takumi-js'
import {
  OG_IMAGE_FORMAT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  ogCardFonts,
  ogCardImages,
  renderOgCard,
} from './og-card'

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
        const png = await render(
          renderOgCard({
            title,
            pathname: page.pathname,
          }),
          {
            width: OG_IMAGE_WIDTH,
            height: OG_IMAGE_HEIGHT,
            format: OG_IMAGE_FORMAT,
            fonts: ogCardFonts,
            images: ogCardImages,
          },
        )
        await writeFile(imageFile, png)
        written += 1
      }
      logger.info(`Wrote ${written} sharing images.`)
    },
  },
})
