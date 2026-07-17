import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { getDb, hashKey } from '../../storage/database.js'
import { SEO_CRAWLER_USER_AGENT } from '../crawler-identity.js'
import { createRobotsSession, fetchRobots } from './robots.js'

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ;(server as Server).close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

test('fetchRobots classifies Google robots response states exactly', async () => {
  let status = 200
  let body = 'User-agent: *\nDisallow: /private\n'
  const fixture = await withServer((_req, res) => {
    res.statusCode = status
    res.setHeader('content-type', 'text/plain')
    res.end(body)
  })

  try {
    const target = `${fixture.origin}/private/page`
    const disallowed = await fetchRobots(fixture.origin, target, true)
    assert.equal(disallowed.availability, 'available')
    assert.equal(disallowed.allowed, false)
    assert.equal(disallowed.matchedLine, 'Disallow: /private')

    for (const [responseStatus, availability, allowed] of [
      [404, 'absent', true],
      [410, 'absent', true],
      [401, 'access-blocked', true],
      [403, 'access-blocked', true],
      [429, 'rate-limited', null],
      [500, 'unreachable', null],
      [503, 'unreachable', null],
    ] as const) {
      status = responseStatus
      body = 'User-agent: *\nDisallow: /\n'
      const result = await fetchRobots(fixture.origin, target, true)
      assert.equal(result.availability, availability)
      assert.equal(result.allowed, allowed)
      assert.equal(result.status, responseStatus)
    }
  } finally {
    await fixture.close()
  }
})

test('transient robots failures do not overwrite a last good cache entry', async () => {
  let status = 200
  const fixture = await withServer((_req, res) => {
    res.statusCode = status
    res.setHeader('content-type', 'text/plain')
    res.end('User-agent: *\nAllow: /\n')
  })

  try {
    const target = `${fixture.origin}/page`
    const available = await fetchRobots(fixture.origin, target, true)
    assert.equal(available.availability, 'available')
    status = 503
    const failure = await fetchRobots(fixture.origin, target, true)
    assert.equal(failure.availability, 'unreachable')
    const cached = await fetchRobots(fixture.origin, target, false)
    assert.equal(cached.availability, 'available')
    assert.equal(cached.cache, 'hit')
  } finally {
    await fixture.close()
  }
})

test('robots evaluation matches the stable SEO-Skill token', async () => {
  let observedUserAgent = ''
  const fixture = await withServer((req, res) => {
    observedUserAgent = String(req.headers['user-agent'] ?? '')
    res.setHeader('content-type', 'text/plain')
    res.end(
      'User-agent: SEO-Skill\nDisallow: /private\n\nUser-agent: *\nAllow: /\n',
    )
  })

  try {
    const result = await fetchRobots(
      fixture.origin,
      `${fixture.origin}/private/page`,
      true,
    )
    assert.equal(observedUserAgent, SEO_CRAWLER_USER_AGENT)
    assert.equal(result.allowed, false)
    assert.equal(result.matchedLine, 'Disallow: /private')
  } finally {
    await fixture.close()
  }
})

test('crawl-scoped robots resolver fetches once and writes no cache entry', async () => {
  let requests = 0
  let origin = ''
  const fixture = await withServer((_req, res) => {
    requests += 1
    res.setHeader('content-type', 'text/plain')
    res.end(
      `User-agent: *\nDisallow: /private\nSitemap: ${origin}/sitemap.xml\n`,
    )
  })
  origin = fixture.origin

  try {
    const session = createRobotsSession({
      refresh: true,
      writeCache: false,
    })
    const [publicPage, privatePage, sitemapUrls] = await Promise.all([
      session.resolve(fixture.origin, `${fixture.origin}/public`),
      session.resolve(fixture.origin, `${fixture.origin}/private/page`),
      session.sitemapUrls(fixture.origin),
    ])
    const key = hashKey([
      'robots',
      new URL('/robots.txt', fixture.origin).toString(),
    ])
    const cached = getDb()
      .prepare('SELECT 1 FROM http_cache WHERE url_hash = ?')
      .get(key)

    assert.equal(requests, 1)
    assert.equal(publicPage.allowed, true)
    assert.equal(privatePage.allowed, false)
    assert.deepEqual(sitemapUrls, [`${fixture.origin}/sitemap.xml`])
    assert.equal(cached, undefined)
  } finally {
    await fixture.close()
  }
})

test('network robots failures remain unknown', async () => {
  const fixture = await withServer((_req, res) => res.end('ok'))
  await fixture.close()
  const result = await fetchRobots(
    fixture.origin,
    `${fixture.origin}/page`,
    true,
  )

  assert.equal(result.availability, 'unreachable')
  assert.equal(result.allowed, null)
  assert.ok(result.error)
})
