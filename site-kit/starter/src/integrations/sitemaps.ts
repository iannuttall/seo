import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildUrlManifest,
  hashContent,
  serializeManifest,
} from '@iannuttall/seo-graph-core'
import type { AstroIntegration } from 'astro'
import { pagePathname } from '../lib/og/path'
import { absoluteUrl } from '../site'

export const SITEMAP_URL_LIMIT = 5_000

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const xml = (tag: string, entries: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</${tag}>\n`

// Writes a sitemap index with one file per section, split at 5,000 URLs,
// from the pages that were really built. No lastmod: a fake date is worse
// than none. Also writes indexnow.json, the page hashes that
// scripts/deploy.mjs compares to find the URLs that changed.
export default function sitemaps(): AstroIntegration {
  return {
    name: 'sitemaps',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir)
        const entries = await readdir(out, {
          withFileTypes: true,
          recursive: true,
        })
        const pages: Array<{ url: string; content: string }> = []
        for (const entry of entries) {
          if (!entry.isFile()) continue
          if (/^sitemap.*\.xml$/.test(entry.name)) {
            await rm(join(entry.parentPath, entry.name))
            continue
          }
          if (!entry.name.endsWith('.html')) continue
          const file = join(entry.parentPath, entry.name)
          const path = pagePathname(relative(out, file))
          if (path === '/404') continue
          const html = await readFile(file, 'utf8')
          if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) continue
          pages.push({ url: absoluteUrl(path), content: html })
        }
        pages.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))

        const groups = new Map<string, string[]>()
        for (const { url } of pages) {
          const parts = new URL(url).pathname.split('/').filter(Boolean)
          const section = parts.length > 1 ? (parts[0] as string) : 'pages'
          const group = groups.get(section)
          if (group) group.push(url)
          else groups.set(section, [url])
        }
        const files: string[] = []
        for (const [section, urls] of [...groups].sort()) {
          for (let at = 0; at < urls.length; at += SITEMAP_URL_LIMIT) {
            const name = `sitemap-${section}-${at / SITEMAP_URL_LIMIT + 1}.xml`
            const chunk = urls.slice(at, at + SITEMAP_URL_LIMIT)
            await writeFile(
              join(out, name),
              xml(
                'urlset',
                chunk.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`),
              ),
            )
            files.push(name)
          }
        }
        await writeFile(
          join(out, 'sitemap.xml'),
          xml(
            'sitemapindex',
            files.map(
              (name) =>
                `<sitemap><loc>${absoluteUrl(`/${name}`)}</loc></sitemap>`,
            ),
          ),
        )
        await writeFile(
          join(out, 'indexnow.json'),
          // Hash the page content only, so a new stylesheet hash does not
          // mark every page as changed.
          serializeManifest(
            buildUrlManifest(pages, (html) =>
              hashContent(/<main\b[\s\S]*<\/main>/i.exec(html)?.[0] ?? html),
            ),
          ),
        )
        logger.info(`${pages.length} URLs in ${files.length} sitemap files`)
      },
    },
  }
}
