import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { performanceAudit } from './performance.js'

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

test('performanceAudit falls back when Lighthouse is unavailable', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Fast</title><h1>Fast page</h1>')
  })
  const port = await listen(server)
  try {
    const report = await performanceAudit({
      url: `http://127.0.0.1:${port}/`,
      lighthouseBin: 'definitely-not-lighthouse',
      refresh: true,
    })

    assert.equal(report.source, 'fetch-fallback')
    assert.equal(report.strategy, 'mobile')
    assert.equal(report.metrics.responseTime?.value !== undefined, true)
    assert.match(report.headline, /fallback/)
    assert.ok(report.topActions.length >= 1)
    assert.ok(
      report.caveats.some((item) => item.includes('Lighthouse unavailable')),
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
