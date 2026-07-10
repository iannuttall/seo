import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const site = (process.env.SITE_URL ?? 'https://seoskills.dev').replace(
  /\/$/,
  '',
)
const publicDirectory = resolve(import.meta.dirname, '..', 'public')
const paths = [
  '/',
  '/docs',
  '/docs/agents',
  '/docs/ai-search',
  '/docs/cli',
  '/docs/crawler',
  '/docs/getting-started',
  '/docs/reports',
]

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const urls = paths
  .map((path) => {
    const url = path === '/' ? site : `${site}${path}`
    return `  <url><loc>${escapeXml(url)}</loc></url>`
  })
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

writeFileSync(resolve(publicDirectory, 'sitemap.xml'), xml, 'utf8')
console.log(`Wrote ${paths.length} URLs to public/sitemap.xml`)
