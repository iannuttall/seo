import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { fetchFailureKind } from '../../analyze/monitoring/crawl-page.js'
import { SEO_CRAWLER_USER_AGENT } from '../crawler-identity.js'
import { RedirectChainError } from './redirects.js'
import { fetchPageStatus } from './status-probe.js'

test('status probe follows redirects without retaining the response body', async () => {
  const userAgents: string[] = []
  const server = createServer((req, res) => {
    userAgents.push(String(req.headers['user-agent'] ?? ''))
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: SEO-Skill\nAllow: /\n')
      return
    }
    if (req.url === '/old') {
      res.statusCode = 301
      res.setHeader('location', '/blocked')
      res.end('redirect body that must not be retained')
      return
    }
    res.statusCode = 403
    res.setHeader('content-type', 'text/html')
    res.setHeader('cf-mitigated', 'challenge')
    res.setHeader('cf-ray', 'health-test-LHR')
    res.setHeader('server', 'cloudflare')
    res.end(
      '<html><title>Challenge body that must not be retained</title></html>',
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/old`

  try {
    const result = await fetchPageStatus(url, {
      respectRobots: true,
      timeoutMs: 2_000,
      rate: { concurrency: 1, intervalCap: 100, intervalMs: 1 },
    })

    assert.equal(result.html, '')
    assert.equal(result.status, 403)
    assert.equal(result.finalUrl, `http://127.0.0.1:${address.port}/blocked`)
    assert.equal(result.diagnostics.cache, 'bypass')
    assert.equal(result.diagnostics.rendered, false)
    assert.equal(result.diagnostics.redirectChain?.length, 1)
    assert.equal(result.diagnostics.accessBlock?.provider, 'cloudflare')
    assert.equal(result.diagnostics.accessBlock?.requestId, 'health-test-LHR')
    assert.ok(userAgents.every((value) => value === SEO_CRAWLER_USER_AGENT))
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
})

test('status probe stops redirect loops and chains over the hop cap without retrying', async () => {
  const paths: string[] = []
  const server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    paths.push(String(req.url))
    const step = Number(req.url?.match(/^\/chain\/(\d+)$/)?.[1])
    res.statusCode = 301
    res.setHeader(
      'location',
      req.url === '/loop/a'
        ? '/loop/b'
        : req.url === '/loop/b'
          ? '/loop/a'
          : `/chain/${step + 1}`,
    )
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const options = {
    timeoutMs: 2_000,
    rate: { concurrency: 1, intervalCap: 100, intervalMs: 1 },
  }

  try {
    await assert.rejects(
      fetchPageStatus(`${base}/loop/a`, options),
      (error) => {
        assert.ok(error instanceof RedirectChainError)
        assert.equal(error.kind, 'loop')
        assert.equal(fetchFailureKind(error), 'redirect-loop')
        assert.deepEqual(
          error.redirectChain.map((hop) => hop.location),
          [`${base}/loop/b`, `${base}/loop/a`],
        )
        return true
      },
    )
    assert.deepEqual(paths, ['/loop/a', '/loop/b'])

    paths.length = 0
    await assert.rejects(
      fetchPageStatus(`${base}/chain/0`, options),
      (error) => {
        assert.ok(error instanceof RedirectChainError)
        assert.equal(error.kind, 'too_many')
        assert.equal(fetchFailureKind(error), 'redirect-limit')
        return true
      },
    )
    // The start URL and MAX_REDIRECT_HOPS redirects, once each.
    assert.equal(paths.length, 11)
    assert.equal(paths.at(-1), '/chain/10')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
})
