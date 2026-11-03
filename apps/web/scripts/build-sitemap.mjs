import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cmsPaths } from '../src/content/cms.ts'
import { docsPaths } from '../src/content/docs-nav.mjs'
import { integrationPaths } from '../src/content/integrations.ts'
import { toolPaths } from '../src/content/tools/manifest.mjs'

const site = (process.env.SITE_URL ?? 'https://seoskill.dev').replace(/\/$/, '')
const publicDirectory = resolve(import.meta.dirname, '..', 'public')
// One comparison page for each fact file in src/content/alternatives.
const alternativePaths = [
  '/alternatives',
  ...readdirSync(
    resolve(import.meta.dirname, '..', 'src', 'content', 'alternatives'),
  )
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => `/alternatives/${file.replace(/\.json$/, '')}`),
]
// One feature page for each file in src/pages/features.
const featurePaths = [
  '/features',
  ...readdirSync(resolve(import.meta.dirname, '..', 'src', 'pages', 'features'))
    .filter((file) => file.endsWith('.astro') && file !== 'index.astro')
    .sort()
    .map((file) => `/features/${file.replace(/\.astro$/, '')}`),
]
const paths = [
  '/',
  ...featurePaths,
  '/tools',
  ...toolPaths,
  ...docsPaths,
  ...integrationPaths,
  ...cmsPaths,
  ...alternativePaths,
  '/pricing',
  '/stats',
  '/telemetry',
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
