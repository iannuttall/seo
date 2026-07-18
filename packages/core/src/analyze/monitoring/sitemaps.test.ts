import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { boundedSitemapInventory, fetchSitemapUrls } from './sitemaps.js'

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

function inventoryResult(urls: string[]) {
  return {
    urls,
    truncation: {
      possiblyTruncated: false,
      urlLimitExceeded: false,
      nestedSitemapLimitExceeded: false,
      omittedUrlsAtLeast: 0,
      unprocessedSitemaps: 0,
      limits: { urls: 50_000, sitemaps: 50 },
    },
  }
}

test('the combined inventory reports only actual omissions at the global cap', () => {
  const exact = boundedSitemapInventory(
    [
      inventoryResult(['https://example.com/a']),
      inventoryResult(['https://example.com/b']),
    ],
    2,
  )
  assert.deepEqual(exact.urls, [
    'https://example.com/a',
    'https://example.com/b',
  ])
  assert.equal(exact.truncation.inventoryLimitExceeded, false)
  assert.equal(exact.truncation.possiblyTruncated, false)

  const exceeded = boundedSitemapInventory(
    [
      inventoryResult(['https://example.com/a', 'https://example.com/b']),
      inventoryResult(['https://example.com/b', 'https://example.com/c']),
    ],
    2,
  )
  assert.deepEqual(exceeded.urls, [
    'https://example.com/a',
    'https://example.com/b',
  ])
  assert.equal(exceeded.truncation.inventoryLimitExceeded, true)
  assert.equal(exceeded.truncation.omittedUrlsAtLeast, 1)
  assert.equal(exceeded.truncation.possiblyTruncated, true)
})

test('duplicate URL locs do not consume the cap and an exact-size inventory is complete', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    xml(response, urlset([`${origin}/a`, `${origin}/a`, `${origin}/b`]))
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
    assert.equal(result.source.urlLocs, 3)
    assert.equal(result.source.duplicateUrlLocs, 1)
    assert.equal(result.truncation.urlLimitExceeded, false)
    assert.equal(result.truncation.possiblyTruncated, false)
    assert.equal(result.dataStatus, 'complete')
  } finally {
    await fixture.close()
  }
})

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

test('records sitemap lastmod observations without changing URL inventory or completeness', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    xml(
      response,
      `<urlset>
        <url><loc>${origin}/valid-date</loc><lastmod>2024-02-29</lastmod></url>
        <url><loc>${origin}/valid-minute</loc><lastmod>2024-01-01T12:00Z</lastmod></url>
        <url><loc>${origin}/valid-time</loc><lastmod>2024-01-01T12:00:00+00:00</lastmod></url>
        <url><loc>${origin}/malformed</loc><lastmod>2024-02-30</lastmod></url>
        <url><loc>${origin}/future</loc><lastmod>2999-01-01</lastmod></url>
      </urlset>`,
    )
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/sitemap.xml`,
    })

    assert.deepEqual(result.urls, [
      `${fixture.origin}/valid-date`,
      `${fixture.origin}/valid-minute`,
      `${fixture.origin}/valid-time`,
      `${fixture.origin}/malformed`,
      `${fixture.origin}/future`,
    ])
    assert.equal(result.dataStatus, 'complete')
    assert.deepEqual(result.warnings, [])
    assert.deepEqual(result.source.lastmods, {
      trust: 'unverified',
      observed: 5,
      parseable: 4,
      malformed: {
        count: 1,
        samples: [
          {
            sitemapUrl: `${fixture.origin}/sitemap.xml`,
            kind: 'url',
            loc: `${fixture.origin}/malformed`,
            value: '2024-02-30',
          },
        ],
      },
      future: {
        count: 1,
        samples: [
          {
            sitemapUrl: `${fixture.origin}/sitemap.xml`,
            kind: 'url',
            loc: `${fixture.origin}/future`,
            value: '2999-01-01',
          },
        ],
      },
    })
  } finally {
    await fixture.close()
  }
})

test('keeps sitemap-index lastmod observations separate from page lastmod values', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    if (request.url === '/index.xml') {
      xml(
        response,
        `<sitemapindex>
          <sitemap><loc>${origin}/child.xml</loc><lastmod>2024-01-01T12:00:00+00:00</lastmod></sitemap>
          <sitemap><loc>${origin}/future.xml</loc><lastmod>2999-01-01</lastmod></sitemap>
        </sitemapindex>`,
      )
      return
    }
    xml(response, urlset([]))
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/index.xml`,
    })

    assert.deepEqual(result.nestedSitemaps, [
      `${fixture.origin}/child.xml`,
      `${fixture.origin}/future.xml`,
    ])
    assert.equal(result.dataStatus, 'complete')
    assert.equal(result.source.lastmods.observed, 2)
    assert.equal(result.source.lastmods.parseable, 2)
    assert.equal(result.source.lastmods.malformed.count, 0)
    assert.deepEqual(result.source.lastmods.future, {
      count: 1,
      samples: [
        {
          sitemapUrl: `${fixture.origin}/index.xml`,
          kind: 'sitemap',
          loc: `${fixture.origin}/future.xml`,
          value: '2999-01-01',
        },
      ],
    })
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

test('keeps valid sitemap XML when the content type is unexpected', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(urlset([`${origin}/still-listed`]))
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/wrong-content-type.xml`,
    })

    assert.deepEqual(result.urls, [`${fixture.origin}/still-listed`])
    assert.equal(result.dataStatus, 'partial')
    assert.deepEqual(
      {
        dataStatus: result.source.documents[0]?.dataStatus,
        contentType: result.source.documents[0]?.contentType,
        root: result.source.documents[0]?.root,
        warning: result.source.documents[0]?.warning,
      },
      {
        dataStatus: 'partial',
        contentType: 'text/html',
        root: 'urlset',
        warning: 'Sitemap returned content type text/html, not an XML type.',
      },
    )
  } finally {
    await fixture.close()
  }
})

test('does not merge URL sets and sitemap indexes from invalid multi-root XML', async () => {
  const fixture = await sitemapServer((request, response) => {
    const origin = `http://${request.headers.host}`
    xml(response, `${urlset([`${origin}/ignored`])}${sitemapIndex([])}`)
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/multi-root.xml`,
    })

    assert.deepEqual(result.urls, [])
    assert.equal(result.dataStatus, 'partial')
    assert.match(
      result.source.documents[0]?.warning ?? '',
      /more than one XML root element/,
    )
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

test('duplicate nested locs do not exhaust scheduling and an exact sitemap boundary is complete', async () => {
  const calls: string[] = []
  const fixture = await sitemapServer((request, response) => {
    const path = request.url ?? '/'
    calls.push(path)
    const origin = `http://${request.headers.host}`
    if (path === '/root.xml') {
      xml(
        response,
        sitemapIndex([
          `${origin}/a.xml`,
          `${origin}/a.xml`,
          `${origin}/a.xml`,
          `${origin}/b.xml`,
        ]),
      )
      return
    }
    if (path === '/a.xml') {
      xml(response, urlset([`${origin}/a`]))
      return
    }
    if (path === '/b.xml') {
      xml(response, urlset([`${origin}/b`]))
      return
    }
    response.writeHead(404).end()
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/root.xml`,
      maxNested: 3,
    })

    assert.deepEqual(calls, ['/root.xml', '/a.xml', '/b.xml'])
    assert.deepEqual(result.urls, [
      `${fixture.origin}/a`,
      `${fixture.origin}/b`,
    ])
    assert.equal(result.source.duplicateSitemapLocs, 2)
    assert.equal(result.source.sitemapsFetched, 3)
    assert.equal(result.truncation.nestedSitemapLimitExceeded, false)
    assert.equal(result.truncation.unprocessedSitemaps, 0)
    assert.equal(result.dataStatus, 'complete')
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

test('unscheduled nested sitemaps and invalid locs have structured evidence', async () => {
  const calls: string[] = []
  const fixture = await sitemapServer((request, response) => {
    const path = request.url ?? '/'
    calls.push(path)
    const origin = `http://${request.headers.host}`
    if (path === '/root.xml') {
      xml(
        response,
        sitemapIndex([`${origin}/a.xml`, 'not a URL', `${origin}/b.xml`]),
      )
      return
    }
    if (path === '/a.xml') {
      xml(response, urlset([`${origin}/valid`, 'mailto:invalid@example.com']))
      return
    }
    xml(response, urlset([]))
  })
  try {
    const result = await fetchSitemapUrls({
      sitemapUrl: `${fixture.origin}/root.xml`,
      maxNested: 2,
    })

    assert.deepEqual(calls, ['/root.xml', '/a.xml'])
    assert.deepEqual(result.urls, [`${fixture.origin}/valid`])
    assert.equal(result.source.invalidLocs.count, 2)
    assert.deepEqual(
      result.source.invalidLocs.samples.map((sample) => [
        sample.kind,
        sample.value,
      ]),
      [
        ['sitemap', 'not a URL'],
        ['url', 'mailto:invalid@example.com'],
      ],
    )
    assert.equal(result.truncation.nestedSitemapLimitExceeded, true)
    assert.equal(result.truncation.unprocessedSitemaps, 1)
    assert.equal(result.truncation.possiblyTruncated, true)
    assert.equal(result.dataStatus, 'partial')
    assert.match(result.warnings.join('\n'), /invalid sitemap <loc>/)
  } finally {
    await fixture.close()
  }
})
