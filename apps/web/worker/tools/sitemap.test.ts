import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  handleSitemapImport,
  SITEMAP_TOOL_LIMITS,
  type SitemapToolResult,
} from './sitemap.ts'

const endpoint = 'https://seoskill.dev/api/tools/sitemap'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify({ url }),
  })
}

function xmlResponse(xml: string | Uint8Array, init?: ResponseInit): Response {
  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    ...init,
  })
}

test('imports, deduplicates, and labels page URLs from a sitemap', async () => {
  const seen: string[] = []
  const response = await handleSitemapImport(
    request('https://example.com/sitemap.xml'),
    async (input) => {
      seen.push(input.toString())
      return xmlResponse(`<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/docs/getting-started/</loc></url>
        <url><loc>https://example.com/docs/getting-started/#intro</loc></url>
        <url><loc>https://example.com/about-us.html?from=sitemap&amp;v=1</loc></url>
      </urlset>`)
    },
  )

  assert.equal(response.status, 200)
  const result = (await response.json()) as SitemapToolResult
  assert.deepEqual(seen, ['https://example.com/sitemap.xml'])
  assert.equal(result.source.dataStatus, 'complete')
  assert.deepEqual(result.urls, [
    { url: 'https://example.com/', label: 'example.com' },
    {
      url: 'https://example.com/docs/getting-started/',
      label: 'Getting started',
    },
    {
      url: 'https://example.com/about-us.html?from=sitemap&v=1',
      label: 'About us',
    },
  ])
})

test('defaults a scheme-less sitemap import URL to HTTPS', async () => {
  const seen: string[] = []
  const response = await handleSitemapImport(
    request('example.com/sitemap.xml'),
    async (input) => {
      seen.push(input.toString())
      return xmlResponse(
        '<urlset><url><loc>https://example.com/</loc></url></urlset>',
      )
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(seen, ['https://example.com/sitemap.xml'])
})

test('follows a bounded sitemap index and reports skipped child files', async () => {
  const calls: string[] = []
  const responses = new Map([
    [
      'https://example.com/sitemap.xml',
      xmlResponse(`<sitemapindex>
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/broken.xml</loc></sitemap>
        <sitemap><loc>https://cdn.example.net/foreign.xml</loc></sitemap>
      </sitemapindex>`),
    ],
    [
      'https://example.com/pages.xml',
      xmlResponse(
        '<urlset><url><loc>https://example.com/docs/</loc></url></urlset>',
      ),
    ],
    ['https://example.com/broken.xml', new Response('nope', { status: 503 })],
  ])
  const response = await handleSitemapImport(
    request('https://example.com/sitemap.xml'),
    async (input) => {
      const url = input.toString()
      calls.push(url)
      const found = responses.get(url)
      if (!found) throw new Error(`Unexpected URL: ${url}`)
      return found
    },
  )

  const result = (await response.json()) as SitemapToolResult
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [
    'https://example.com/sitemap.xml',
    'https://example.com/pages.xml',
    'https://example.com/broken.xml',
  ])
  assert.equal(result.source.dataStatus, 'partial')
  assert.equal(result.source.sitemapsFetched, 2)
  assert.deepEqual(result.urls, [
    { url: 'https://example.com/docs/', label: 'Docs' },
  ])
  assert.ok(
    result.warnings.some((warning) => warning.includes('another hostname')),
  )
  assert.ok(result.warnings.some((warning) => warning.includes('HTTP 503')))
})

test('reads gzip sitemap files without allowing unbounded expansion', async () => {
  const compressed = gzipSync(
    '<urlset><url><loc>https://example.com/compressed-page</loc></url></urlset>',
  )
  const response = await handleSitemapImport(
    request('https://example.com/sitemap.xml.gz'),
    async () => xmlResponse(compressed),
  )
  const result = (await response.json()) as SitemapToolResult

  assert.equal(response.status, 200)
  assert.deepEqual(result.urls, [
    { url: 'https://example.com/compressed-page', label: 'Compressed page' },
  ])
})

test('caps URL output before serializing a large sitemap', async () => {
  const entries = Array.from(
    { length: SITEMAP_TOOL_LIMITS.urls + 2 },
    (_, index) => `<url><loc>https://example.com/page-${index}</loc></url>`,
  ).join('')
  const response = await handleSitemapImport(
    request('https://example.com/sitemap.xml'),
    async () => xmlResponse(`<urlset>${entries}</urlset>`),
  )
  const result = (await response.json()) as SitemapToolResult

  assert.equal(response.status, 200)
  assert.equal(result.urls.length, SITEMAP_TOOL_LIMITS.urls)
  assert.equal(result.truncation.urlLimitExceeded, true)
  assert.equal(result.source.dataStatus, 'partial')
})

test('rejects unsafe input and cross-site browser requests before fetching', async () => {
  let fetches = 0
  const fetcher = async () => {
    fetches += 1
    return xmlResponse('<urlset></urlset>')
  }

  const privateResponse = await handleSitemapImport(
    request('https://127.0.0.1/sitemap.xml'),
    fetcher,
  )
  const insecureResponse = await handleSitemapImport(
    request('http://example.com/sitemap.xml'),
    fetcher,
  )
  const crossSiteResponse = await handleSitemapImport(
    request('https://example.com/sitemap.xml', {
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

test('revalidates redirect destinations before another subrequest', async () => {
  let fetches = 0
  const response = await handleSitemapImport(
    request('https://example.com/sitemap.xml'),
    async () => {
      fetches += 1
      return new Response(null, {
        status: 302,
        headers: { location: 'https://localhost/private.xml' },
      })
    },
  )
  assert.equal(response.status, 422)
  assert.equal(fetches, 1)
  assert.match(JSON.stringify(await response.json()), /cannot be fetched/u)
})
