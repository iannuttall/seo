import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  handleSitemapExtraction,
  SITEMAP_EXTRACTOR_LIMITS,
  type SitemapExtractorEvent,
} from './sitemap-extractor.ts'

const endpoint = 'https://seoskill.dev/api/tools/sitemap-extractor'

function request(
  url: string,
  maxUrls = 10_000,
  headers: Record<string, string> = {},
): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify({ url, maxUrls }),
  })
}

function response(
  body: string | Uint8Array,
  contentType = 'application/xml',
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

async function eventsFrom(result: Response): Promise<SitemapExtractorEvent[]> {
  const text = await result.text()
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SitemapExtractorEvent)
}

test('streams recursive sitemap URLs with metadata and honest coverage', async () => {
  const responses = new Map<string, Response>([
    [
      'https://example.com/sitemap.xml',
      response(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
        <sitemap><loc>https://cdn.example.net/products.xml.gz</loc></sitemap>
      </sitemapindex>`),
    ],
    [
      'https://example.com/pages.xml',
      response(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
          xmlns:xhtml="http://www.w3.org/1999/xhtml"
          xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url>
          <loc>https://example.com/docs/?source=sitemap&amp;version=1</loc>
          <lastmod>2026-08-01</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
          <xhtml:link rel="alternate" hreflang="en" href="https://example.com/docs/" />
          <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/docs/" />
          <image:image><image:loc>https://example.com/image.jpg</image:loc></image:image>
        </url>
        <url><loc>https://example.com/docs/?source=sitemap&amp;version=1#again</loc></url>
      </urlset>`),
    ],
    [
      'https://cdn.example.net/products.xml.gz',
      response(
        gzipSync(
          '<urlset><url><loc>https://example.com/products/one</loc></url></urlset>',
        ),
        'application/gzip',
      ),
    ],
  ])
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml'),
    async (input) => {
      const found = responses.get(input.toString())
      if (!found) throw new Error(`Unexpected URL: ${input.toString()}`)
      return found
    },
  )
  const events = await eventsFrom(result)
  const urls = events.filter((event) => event.type === 'url')
  const complete = events.find((event) => event.type === 'complete')

  assert.equal(
    result.headers.get('content-type'),
    'application/x-ndjson; charset=utf-8',
  )
  assert.equal(urls.length, 2)
  assert.deepEqual(urls[0], {
    type: 'url',
    url: 'https://example.com/docs/?source=sitemap&version=1',
    sourceSitemap: 'https://example.com/pages.xml',
    depth: 1,
    lastmod: '2026-08-01',
    changefreq: 'weekly',
    priority: '0.8',
    hreflang: ['en', 'fr'],
    hreflangCount: 2,
    imageCount: 1,
    videoCount: 0,
    newsCount: 0,
  })
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.dataStatus, 'complete')
  assert.equal(complete.duplicateUrls, 1)
  assert.equal(complete.sitemapsFetched, 3)
  assert.equal(complete.sitemapsFailed, 0)
})

test('discovers a sitemap from robots.txt when given a domain', async () => {
  const calls: string[] = []
  const result = await handleSitemapExtraction(
    request('example.com'),
    async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === 'https://example.com/robots.txt') {
        return response(
          'User-agent: *\nSitemap: https://example.com/content-map.xml\n',
          'text/plain',
        )
      }
      if (url === 'https://example.com/content-map.xml') {
        return response(
          '<urlset><url><loc>https://example.com/one</loc></url></urlset>',
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  )
  const events = await eventsFrom(result)

  assert.deepEqual(calls, [
    'https://example.com/robots.txt',
    'https://example.com/content-map.xml',
  ])
  assert.ok(events.some((event) => event.type === 'url'))
  assert.equal(
    events.find((event) => event.type === 'complete')?.dataStatus,
    'complete',
  )
})

test('tries common sitemap locations without treating failed probes as partial data', async () => {
  const calls: string[] = []
  const result = await handleSitemapExtraction(
    request('https://example.com/'),
    async (input) => {
      const url = input.toString()
      calls.push(url)
      if (url === 'https://example.com/robots.txt') {
        return new Response('missing', { status: 404 })
      }
      if (url === 'https://example.com/sitemap.xml') {
        return new Response('missing', { status: 404 })
      }
      if (url === 'https://example.com/sitemap_index.xml') {
        return response(
          '<urlset><url><loc>https://example.com/found</loc></url></urlset>',
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  )
  const events = await eventsFrom(result)
  const complete = events.find((event) => event.type === 'complete')

  assert.deepEqual(calls, [
    'https://example.com/robots.txt',
    'https://example.com/sitemap.xml',
    'https://example.com/sitemap_index.xml',
  ])
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.dataStatus, 'complete')
  assert.equal(complete.sitemapsFailed, 0)
})

test('extracts one-URL-per-line text sitemaps', async () => {
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.txt'),
    async () =>
      response(
        'https://example.com/one\n\nhttps://example.com/two#fragment\n',
        'text/plain',
      ),
  )
  const events = await eventsFrom(result)
  const urls = events.filter((event) => event.type === 'url')
  const sitemap = events.find((event) => event.type === 'sitemap')

  assert.deepEqual(
    urls.map((event) => (event.type === 'url' ? event.url : '')),
    ['https://example.com/one', 'https://example.com/two'],
  )
  assert.ok(sitemap && sitemap.type === 'sitemap')
  assert.equal(sitemap.kind, 'text')
})

test('warns when one sitemap passes the 10,000 URL working threshold', async () => {
  const entries = Array.from(
    { length: SITEMAP_EXTRACTOR_LIMITS.largeSitemapWarningUrls + 1 },
    (_, index) => `<url><loc>https://example.com/page-${index}</loc></url>`,
  ).join('')
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml', 25_000),
    async () => response(`<urlset>${entries}</urlset>`),
  )
  const events = await eventsFrom(result)
  const warning = events.find(
    (event) => event.type === 'warning' && event.code === 'large-sitemap',
  )
  const sitemap = events.find((event) => event.type === 'sitemap')
  const complete = events.find((event) => event.type === 'complete')

  assert.ok(warning && warning.type === 'warning')
  assert.match(warning.message, /technical SEO teams/u)
  assert.match(warning.message, /Google accepts up to 50,000/u)
  assert.ok(sitemap && sitemap.type === 'sitemap')
  assert.equal(sitemap.urlEntries, 10_001)
  assert.equal(sitemap.overRecommendedSize, true)
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.dataStatus, 'complete')
  assert.equal(complete.largeSitemaps, 1)
})

test('returns a partial result when the selected URL cap is reached', async () => {
  const entries = Array.from(
    { length: 10_002 },
    (_, index) => `<url><loc>https://example.com/page-${index}</loc></url>`,
  ).join('')
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml', 10_000),
    async () => response(`<urlset>${entries}</urlset>`),
  )
  const events = await eventsFrom(result)
  const complete = events.find((event) => event.type === 'complete')

  assert.equal(events.filter((event) => event.type === 'url').length, 10_000)
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.dataStatus, 'partial')
  assert.equal(complete.truncation.urlLimitExceeded, true)
  assert.ok(
    events.some(
      (event) =>
        event.type === 'warning' &&
        event.message.includes('first 10,000 unique URLs'),
    ),
  )
})

test('does not overstate how many sitemap files were checked at the processing limit', async () => {
  const childUrls = Array.from(
    { length: SITEMAP_EXTRACTOR_LIMITS.sitemaps + 14 },
    (_, index) => `https://example.com/sitemap-${index}.xml`,
  )
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml'),
    async (input) => {
      if (input.toString().endsWith('/sitemap.xml')) {
        return response(
          `<sitemapindex>${childUrls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join('')}</sitemapindex>`,
        )
      }
      return response(
        `<urlset><url><loc>${input.toString().replace('.xml', '')}</loc></url></urlset>`,
      )
    },
  )
  const events = await eventsFrom(result)
  const warning = events.find(
    (event) =>
      event.type === 'warning' &&
      event.code === 'limit-reached' &&
      event.message.includes('sitemap file processing limit'),
  )
  const complete = events.find((event) => event.type === 'complete')

  assert.ok(warning && warning.type === 'warning')
  assert.doesNotMatch(warning.message, /first 50 sitemap files were checked/u)
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.sitemapsFetched, SITEMAP_EXTRACTOR_LIMITS.sitemaps)
  assert.equal(complete.truncation.sitemapLimitExceeded, true)
})

test('keeps successful child results when another child sitemap fails', async () => {
  const result = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml'),
    async (input) => {
      const url = input.toString()
      if (url.endsWith('/sitemap.xml')) {
        return response(`<sitemapindex>
          <sitemap><loc>https://example.com/good.xml</loc></sitemap>
          <sitemap><loc>https://example.com/bad.xml</loc></sitemap>
        </sitemapindex>`)
      }
      if (url.endsWith('/good.xml')) {
        return response(
          '<urlset><url><loc>https://example.com/good</loc></url></urlset>',
        )
      }
      return new Response('unavailable', { status: 503 })
    },
  )
  const events = await eventsFrom(result)
  const complete = events.find((event) => event.type === 'complete')

  assert.ok(events.some((event) => event.type === 'url'))
  assert.ok(
    events.some(
      (event) => event.type === 'warning' && event.code === 'fetch-failed',
    ),
  )
  assert.ok(complete && complete.type === 'complete')
  assert.equal(complete.dataStatus, 'partial')
  assert.equal(complete.sitemapsFetched, 2)
  assert.equal(complete.sitemapsFailed, 1)
})

test('rejects unsafe input and cross-site browser requests before fetching', async () => {
  let fetches = 0
  const fetcher = async () => {
    fetches += 1
    return response('<urlset></urlset>')
  }
  const privateResponse = await handleSitemapExtraction(
    request('https://127.0.0.1/sitemap.xml'),
    fetcher,
  )
  const insecureResponse = await handleSitemapExtraction(
    request('http://example.com/sitemap.xml'),
    fetcher,
  )
  const crossSiteResponse = await handleSitemapExtraction(
    request('https://example.com/sitemap.xml', 10_000, {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    }),
    fetcher,
  )

  assert.equal(privateResponse.status, 400)
  assert.equal(insecureResponse.status, 400)
  assert.equal(crossSiteResponse.status, 404)
  assert.equal(fetches, 0)
})
