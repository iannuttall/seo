import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SitemapValidationReport } from '../../src/lib/sitemap-validator.ts'
import {
  handleSitemapValidation,
  SITEMAP_VALIDATOR_REQUEST_LIMITS,
} from './sitemap-validator.ts'

const validXml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
</urlset>`

function request(
  body: unknown,
  init: { origin?: string; contentLength?: number } = {},
): Request {
  return new Request('https://seoskill.dev/api/tools/sitemap-validator', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.origin ? { origin: init.origin } : {}),
      ...(init.contentLength
        ? { 'content-length': String(init.contentLength) }
        : {}),
    },
    body: JSON.stringify(body),
  })
}

test('fetches one public sitemap and retains final URL and response provenance', async () => {
  const requests: Array<{ url: string; redirect?: RequestRedirect }> = []
  const response = await handleSitemapValidation(
    request({ url: 'https://example.com/sitemap.xml' }),
    async (input, init) => {
      const url = String(input)
      requests.push({ url, redirect: init?.redirect })
      if (url.endsWith('/sitemap.xml')) {
        return new Response(null, {
          status: 301,
          headers: { location: '/sitemap-final.xml' },
        })
      }
      return new Response(validXml, {
        headers: { 'content-type': 'application/xml' },
      })
    },
  )

  assert.equal(response.status, 200)
  const report = (await response.json()) as SitemapValidationReport
  assert.equal(report.valid, true)
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.source.requestedUrl, 'https://example.com/sitemap.xml')
  assert.equal(report.source.finalUrl, 'https://example.com/sitemap-final.xml')
  assert.equal(report.source.contentType, 'application/xml')
  assert.equal(report.document.entries, 1)
  assert.deepEqual(requests, [
    { url: 'https://example.com/sitemap.xml', redirect: 'manual' },
    { url: 'https://example.com/sitemap-final.xml', redirect: 'manual' },
  ])
})

test('defaults a scheme-less sitemap URL to HTTPS', async () => {
  const seen: string[] = []
  const response = await handleSitemapValidation(
    request({ url: 'example.com/sitemap.xml' }),
    async (input) => {
      seen.push(String(input))
      return new Response(validXml, {
        headers: { 'content-type': 'application/xml' },
      })
    },
  )

  assert.equal(response.status, 200)
  const report = (await response.json()) as SitemapValidationReport
  assert.equal(report.source.requestedUrl, 'https://example.com/sitemap.xml')
  assert.deepEqual(seen, ['https://example.com/sitemap.xml'])
})

test('returns a complete invalid report for HTML and malformed sitemap bodies', async () => {
  const response = await handleSitemapValidation(
    request({ url: 'https://example.com/sitemap.xml' }),
    async () =>
      new Response('<!doctype html><html><title>Blocked</title></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  )
  const report = (await response.json()) as SitemapValidationReport

  assert.equal(response.status, 200)
  assert.equal(report.valid, false)
  assert.equal(
    report.issues.some((issue) => issue.code === 'html-response'),
    true,
  )
  assert.equal(
    report.issues.some((issue) => issue.code === 'invalid-xml'),
    true,
  )
})

test('returns a safe categorized message when the hostname cannot be resolved', async () => {
  const response = await handleSitemapValidation(
    request({ url: 'https://missing.example/sitemap.xml' }),
    async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('getaddrinfo missing.example'), {
          code: 'ENOTFOUND',
        }),
      })
    },
  )

  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), {
    error: 'The hostname for the sitemap could not be resolved.',
  })
})

test('rejects unsafe inputs, redirect destinations, and cross-site browser requests', async () => {
  const privateTarget = await handleSitemapValidation(
    request({ url: 'https://localhost/sitemap.xml' }),
  )
  assert.equal(privateTarget.status, 400)

  const crossSite = await handleSitemapValidation(
    request(
      { url: 'https://example.com/sitemap.xml' },
      { origin: 'https://attacker.example' },
    ),
  )
  assert.equal(crossSite.status, 404)

  let requests = 0
  const redirect = await handleSitemapValidation(
    request({ url: 'https://example.com/sitemap.xml' }),
    async () => {
      requests += 1
      return new Response(null, {
        status: 302,
        headers: { location: 'https://127.0.0.1/private.xml' },
      })
    },
  )
  assert.equal(redirect.status, 422)
  assert.equal(requests, 1)
})

test('bounds methods, request content type, fields, and declared body size', async () => {
  const get = await handleSitemapValidation(
    new Request('https://seoskill.dev/api/tools/sitemap-validator'),
  )
  assert.equal(get.status, 405)

  const wrongType = await handleSitemapValidation(
    new Request('https://seoskill.dev/api/tools/sitemap-validator', {
      method: 'POST',
      body: '{}',
    }),
  )
  assert.equal(wrongType.status, 400)

  const extra = await handleSitemapValidation(
    request({ url: 'https://example.com/sitemap.xml', extra: true }),
  )
  assert.equal(extra.status, 400)

  const oversized = await handleSitemapValidation(
    request(
      { url: 'https://example.com/sitemap.xml' },
      { contentLength: SITEMAP_VALIDATOR_REQUEST_LIMITS.bodyBytes + 1 },
    ),
  )
  assert.equal(oversized.status, 400)
})
