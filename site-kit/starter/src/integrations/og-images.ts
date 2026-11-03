import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import config from '../../site.config.json'
import { readH1 } from '../lib/og/card'
import { ogImagePath, pagePathname } from '../lib/og/path'
import { ogRenderer } from '../lib/og/render'

// Draws one sharing image per page at build time, from the page's real H1,
// into dist/og/<path>.png. The layout points og:image at the same path, and
// `seo site check` fails the build when an image is missing.
export default function ogImages(): AstroIntegration {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir)
        const started = performance.now()
        const card = await ogRenderer(config)
        const entries = await readdir(out, {
          withFileTypes: true,
          recursive: true,
        })
        let drawn = 0
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue
          const file = join(entry.parentPath, entry.name)
          const path = pagePathname(relative(out, file))
          if (path === '/404') continue
          const title = readH1(await readFile(file, 'utf8'))
          if (!title) {
            logger.warn(
              `${relative(out, file)} has no H1, so it gets no image.`,
            )
            continue
          }
          const target = join(out, ogImagePath(path))
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, await card(title, path))
          drawn += 1
        }
        logger.info(
          `${drawn} sharing images in ${Math.round(performance.now() - started)} ms`,
        )
      },
    },
  }
}
