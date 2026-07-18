import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MEBIBYTE = 1024 * 1024
const PAGE_COUNT = Number(process.env.SEO_RESOURCE_PAGE_COUNT ?? 100)
const PAGE_BYTES = Number(process.env.SEO_RESOURCE_PAGE_BYTES ?? 256 * 1024)
const CONCURRENCY = Number(process.env.SEO_RESOURCE_CONCURRENCY ?? 4)
const MAX_RSS_GROWTH = 384 * MEBIBYTE
const MAX_DISK_GROWTH = 96 * MEBIBYTE
const MAX_DURATION_MS = 60_000

function directoryBytes(path) {
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name)
    total += entry.isDirectory()
      ? directoryBytes(entryPath)
      : statSync(entryPath).size
  }
  return total
}

function urlset(origin) {
  return `<urlset>${Array.from(
    { length: PAGE_COUNT },
    (_, index) => `<url><loc>${origin}/page-${index}</loc></url>`,
  ).join('')}</urlset>`
}

function sitemapIndex(origin) {
  return `<sitemapindex>${Array.from(
    { length: 40 },
    (_, index) => `<sitemap><loc>${origin}/child-${index}.xml</loc></sitemap>`,
  ).join('')}</sitemapindex>`
}

function pageBody() {
  const links = Array.from(
    { length: PAGE_COUNT },
    (_, index) => `<a href="/page-${index}">Page ${index}</a>`,
  ).join('')
  const paragraph =
    '<p>This realistic crawl fixture repeats useful page copy to exercise extraction and cache storage without retaining the full response in the report.</p>'
  const repeated = paragraph.repeat(
    Math.ceil((PAGE_BYTES - links.length) / paragraph.length),
  )
  return `<!doctype html><html><head><title>Resource fixture</title><meta name="description" content="Resource fixture page"></head><body><main><h1>Resource fixture</h1>${links}${repeated}</main></body></html>`
}

const root = mkdtempSync(join(tmpdir(), 'seo-resource-harness-'))
process.env.SEO_CONFIG_DIR = join(root, 'config')
process.env.SEO_CACHE_DIR = join(root, 'cache')
process.env.SEO_LOG_DIR = join(root, 'logs')

let sitemapRequests = 0
const fixturePageBody = pageBody()
const server = createServer((request, response) => {
  const origin = `http://${request.headers.host}`
  const path = request.url ?? '/'
  if (path === '/root.xml') {
    sitemapRequests += 1
    response.writeHead(200, { 'content-type': 'application/xml' })
    response.end(sitemapIndex(origin))
    return
  }
  if (/^\/child-\d+\.xml$/.test(path)) {
    sitemapRequests += 1
    response.writeHead(200, { 'content-type': 'application/xml' })
    response.end(urlset(origin))
    return
  }
  if (path === '/robots.txt') {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('User-agent: *\nAllow: /\n')
    return
  }
  if (path === '/llms.txt') {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('missing')
    return
  }
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(fixturePageBody)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`

let timer
try {
  const { crawlSite } = await import('../dist/index.js')
  const baselineMemory = process.memoryUsage()
  const baselineRss = baselineMemory.rss
  let peakRss = baselineRss
  let peakHeapUsed = baselineMemory.heapUsed
  timer = setInterval(() => {
    const memory = process.memoryUsage()
    peakRss = Math.max(peakRss, memory.rss)
    peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed)
  }, 5)
  const startedAt = performance.now()
  const report = await crawlSite({
    url: origin,
    mode: 'sitemap',
    sitemapUrl: `${origin}/root.xml`,
    useSitemap: true,
    maxPages: PAGE_COUNT,
    concurrency: CONCURRENCY,
    js: 'off',
    checkExternal: false,
    checkAgentDiscovery: false,
    refresh: false,
  })
  const durationMs = performance.now() - startedAt
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  clearInterval(timer)
  timer = undefined

  const rssGrowthBytes = Math.max(0, peakRss - baselineRss)
  const heapGrowthBytes = Math.max(0, peakHeapUsed - baselineMemory.heapUsed)
  const diskBytes = directoryBytes(root)
  const largestLinkSample = Math.max(
    0,
    ...report.pages.map((page) => page.sampleInternalLinks?.length ?? 0),
  )

  const measurements = {
    pages: report.pages.length,
    concurrency: CONCURRENCY,
    pageKiB: Math.round(PAGE_BYTES / 1024),
    sitemapRequests,
    durationMs: Math.round(durationMs),
    rssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
    heapGrowthMiB: Number((heapGrowthBytes / MEBIBYTE).toFixed(1)),
    diskMiB: Number((diskBytes / MEBIBYTE).toFixed(1)),
    largestLinkSample,
  }
  console.log(JSON.stringify(measurements))

  assert.equal(
    sitemapRequests,
    2,
    'sitemap acquisition must stop at the URL budget',
  )
  assert.equal(report.pages.length, PAGE_COUNT)
  assert.equal(
    largestLinkSample,
    25,
    'reports retain only bounded link samples',
  )
  assert.ok(
    rssGrowthBytes <= MAX_RSS_GROWTH,
    `RSS grew by ${(rssGrowthBytes / MEBIBYTE).toFixed(1)} MiB`,
  )
  assert.ok(
    diskBytes <= MAX_DISK_GROWTH,
    `temporary local data grew by ${(diskBytes / MEBIBYTE).toFixed(1)} MiB`,
  )
  assert.ok(
    durationMs <= MAX_DURATION_MS,
    `resource crawl took ${(durationMs / 1000).toFixed(1)} seconds`,
  )
} finally {
  if (timer) clearInterval(timer)
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  rmSync(root, { force: true, recursive: true })
}
