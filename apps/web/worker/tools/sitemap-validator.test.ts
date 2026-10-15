import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SitemapValidationReport } from '../../src/lib/sitemap-validator.ts'
import { handleSitemapValidation } from './sitemap-validator.ts'

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
