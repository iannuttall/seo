import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import test from 'node:test'
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

test('unscheduled nested sitemaps and invalid locs have structured evidence', async () => {
  const calls: string[] = []
  const fixture = await sitemapServer((request, response) => {
    const path = request.url ?? '/'
    calls.push(path)
    const origin = `http://${request.headers.host}`
    if (path === '/root.xml') {
      xml(
        response,
        `${urlset([`${origin}/valid`, 'mailto:invalid@example.com'])}${sitemapIndex(
          [`${origin}/a.xml`, 'not a URL', `${origin}/b.xml`],
        )}`,
      )
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
        ['url', 'mailto:invalid@example.com'],
        ['sitemap', 'not a URL'],
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
