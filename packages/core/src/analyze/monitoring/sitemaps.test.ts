import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { fetchSitemapUrls } from './sitemaps.js'

async function sitemapServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function urlset(urls: string[]): string {
  return `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`
}

function sitemapIndex(sitemaps: string[]): string {
  return `<sitemapindex>${sitemaps
    .map((sitemap) => `<sitemap><loc>${sitemap}</loc></sitemap>`)
    .join('')}</sitemapindex>`
}

function xml(response: ServerResponse, body: string) {
  response.writeHead(200, { 'content-type': 'application/xml' })
  response.end(body)
}

test('a URL cap is partial only when another unique loc is omitted', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    xml(response, urlset([`${origin}/a`, `${origin}/b`, `${origin}/c`]))
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/sitemap.xml`,
      limit: 2,
    })

    assert.deepEqual(result.urls, [
      `${fixture.origin}/a`,
      `${fixture.origin}/b`,
    ])
    assert.equal(result.truncation.urlLimitExceeded, true)
    assert.equal(result.truncation.omittedUrlsAtLeast, 1)
    assert.equal(result.truncation.possiblyTruncated, true)
    assert.equal(result.dataStatus, 'partial')
  } finally {
    await fixture.close()
  }
})

test('reads gzip-compressed sitemaps and records the fetched document', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    const body = gzipSync(urlset([`${origin}/from-gzip`]))
    response.writeHead(200, {
      'content-type': 'application/gzip',
      'content-length': body.byteLength,
    })
    response.end(body)
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/sitemap.xml.gz`,
    })

    assert.deepEqual(result.urls, [`${fixture.origin}/from-gzip`])
    assert.equal(result.dataStatus, 'complete')
    assert.deepEqual(result.source.documents[0], {
      url: `${fixture.origin}/sitemap.xml.gz`,
      dataStatus: 'complete',
      status: 200,
      contentType: 'application/gzip',
      compression: 'gzip',
      bytes: result.source.documents[0]?.bytes,
      uncompressedBytes: result.source.documents[0]?.uncompressedBytes,
      root: 'urlset',
    })
    assert.ok((result.source.documents[0]?.bytes ?? 0) > 0)
    assert.ok((result.source.documents[0]?.uncompressedBytes ?? 0) > 0)
  } finally {
    await fixture.close()
  }
})

test('records the final sitemap URL after an HTTP redirect', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    if (request.url === '/legacy-sitemap.xml') {
      response.writeHead(308, { location: `${origin}/sitemap.xml` })
      response.end()
      return
    }
    xml(response, urlset([`${origin}/from-redirect`]))
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/legacy-sitemap.xml`,
    })

    assert.deepEqual(result.urls, [`${fixture.origin}/from-redirect`])
    assert.equal(result.dataStatus, 'complete')
    assert.deepEqual(
      {
        url: result.source.documents[0]?.url,
        finalUrl: result.source.documents[0]?.finalUrl,
        redirected: result.source.documents[0]?.redirected,
        status: result.source.documents[0]?.status,
        root: result.source.documents[0]?.root,
      },
      {
        url: `${fixture.origin}/legacy-sitemap.xml`,
        finalUrl: `${fixture.origin}/sitemap.xml`,
        redirected: true,
        status: 200,
        root: 'urlset',
      },
    )
  } finally {
    await fixture.close()
  }
})

test('records invalid sitemap XML with its HTTP response evidence', async () => {
  const fixture = await sitemapServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html><body>Not a sitemap</body>')
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/not-a-sitemap.xml`,
    })

    assert.deepEqual(result.urls, [])
    assert.equal(result.dataStatus, 'partial')
    assert.equal(result.source.sitemapsFetched, 1)
    assert.deepEqual(result.source.documents[0], {
      url: `${fixture.origin}/not-a-sitemap.xml`,
      dataStatus: 'partial',
      status: 200,
      contentType: 'text/html',
      compression: 'none',
      bytes: 32,
      uncompressedBytes: 32,
      warning: 'Sitemap XML is invalid: an unclosed <html> tag.',
    })
    assert.match(result.warnings.join('\n'), /Sitemap XML is invalid/)
  } finally {
    await fixture.close()
  }
})

test('records an explicit byte-limit failure without reading the response body', async () => {
  const fixture = await sitemapServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/xml',
      'content-length': 52_428_801,
    })
    response.end('<urlset/>')
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/too-large.xml`,
    })

    assert.equal(result.dataStatus, 'partial')
    assert.deepEqual(result.source.documents[0], {
      url: `${fixture.origin}/too-large.xml`,
      dataStatus: 'partial',
      status: 200,
      contentType: 'application/xml',
      compression: 'none',
      warning:
        'Could not read sitemap data: The response exceeds the 52428800-byte sitemap limit.',
    })
    assert.match(result.warnings.join('\n'), /52428800-byte sitemap limit/)
  } finally {
    await fixture.close()
  }
})

test('stops fetching sibling sitemap documents once the URL budget is full', async () => {
  const calls: string[] = []
  const fixture = await sitemapServer((request, response) => {
    const path = request.url ?? '/'
    calls.push(path)
    const origin = `http://${request.headers.host}`
    if (path === '/root.xml') {
      xml(
        response,
        sitemapIndex(
          Array.from(
            { length: 40 },
            (_, index) => `${origin}/child-${index}.xml`,
          ),
        ),
      )
      return
    }
    const child = Number(path.match(/child-(\d+)\.xml/)?.[1] ?? 0)
    xml(
      response,
      urlset(
        Array.from(
          { length: 100 },
          (_, index) => `${origin}/page-${child}-${index}`,
        ),
      ),
    )
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/root.xml`,
      limit: 25,
    })

    assert.deepEqual(calls, ['/root.xml', '/child-0.xml'])
    assert.equal(result.urls.length, 25)
    assert.equal(result.source.sitemapsFetched, 2)
    assert.equal(result.truncation.urlLimitExceeded, true)
    assert.equal(result.truncation.unprocessedSitemaps, 39)
    assert.equal(result.truncation.possiblyTruncated, true)
    assert.equal(result.dataStatus, 'partial')
  } finally {
    await fixture.close()
  }
})
