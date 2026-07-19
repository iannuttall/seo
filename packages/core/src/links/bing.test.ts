import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BingWebmasterClient } from '../bing/client.js'
import { collectBingLinkEvidence } from './bing.js'

test('Bing link evidence caps provider work and marks sampled results partial', async () => {
  const calls = { counts: 0, details: 0, active: 0, maxActive: 0 }
  const client = {
    authentication: 'api-key',
    async getLinkCounts(_site: string, page: number) {
      calls.counts += 1
      return {
        rows: Array.from({ length: 10 }, (_, index) => ({
          url: `https://target.example/${page}-${index}`,
          count: 100 - index,
        })),
        totalPages: 20,
        invalidRows: 0,
        capped: false,
        returnedRows: 10,
      }
    },
    async getUrlLinks(_site: string, link: string) {
      calls.details += 1
      calls.active += 1
      calls.maxActive = Math.max(calls.maxActive, calls.active)
      await new Promise((resolve) => setImmediate(resolve))
      calls.active -= 1
      return {
        rows: [{ url: `https://source.example/${encodeURIComponent(link)}` }],
        totalPages: 2,
        invalidRows: 0,
        capped: false,
        returnedRows: 1,
      }
    },
  } as unknown as BingWebmasterClient

  const evidence = await collectBingLinkEvidence({
    site: 'https://target.example/',
    client,
    targetLimit: 4,
    detailPagesPerTarget: 1,
    rowLimit: 3,
  })
  assert.equal(calls.counts, 1)
  assert.equal(calls.details, 4)
  assert.ok(calls.maxActive <= 3)
  assert.equal(evidence.rows.length, 3)
  assert.equal(evidence.provenance.capped, true)
  assert.equal(evidence.provenance.providerRequests?.maxConcurrentRequests, 3)
  assert.deepEqual(evidence.provenance.providerCoverage, {
    targetCountRows: { returnedRows: 10, retainedRows: 10, invalidRows: 0 },
    detailRows: { returnedRows: 4, retainedRows: 3, invalidRows: 0 },
  })
  assert.match(evidence.warnings[0] ?? '', /bounded/i)
})

test('Bing link evidence retains successful targets when one detail request fails', async () => {
  const client = {
    authentication: 'api-key',
    async getLinkCounts() {
      return {
        rows: [
          { url: 'https://target.example/a', count: 2 },
          { url: 'https://target.example/b', count: 1 },
        ],
        totalPages: 1,
        invalidRows: 0,
        capped: false,
        returnedRows: 2,
      }
    },
    async getUrlLinks(_site: string, target: string) {
      if (target.endsWith('/a')) throw new Error('temporary failure')
      return {
        rows: [{ url: 'https://source.example/b' }],
        totalPages: 1,
        invalidRows: 0,
        capped: false,
        returnedRows: 1,
      }
    },
  } as unknown as BingWebmasterClient

  const evidence = await collectBingLinkEvidence({
    site: 'https://target.example/',
    client,
  })
  assert.equal(evidence.rows.length, 1)
  assert.equal(evidence.rows[0]?.targetUrl, 'https://target.example/b')
  assert.equal(evidence.provenance.completeness, 'partial')
  assert.match(evidence.warnings[1] ?? '', /1 target detail request failed/i)
})

test('Bing link evidence does not mark fully read pagination as capped', async () => {
  const client = {
    authentication: 'api-key',
    async getLinkCounts() {
      return {
        rows: [{ url: 'https://target.example/a', count: 1 }],
        totalPages: 1,
        invalidRows: 0,
        capped: false,
        returnedRows: 1,
      }
    },
    async getUrlLinks() {
      return {
        rows: [{ url: 'https://source.example/a' }],
        totalPages: 1,
        invalidRows: 0,
        capped: false,
        returnedRows: 1,
      }
    },
  } as unknown as BingWebmasterClient

  const evidence = await collectBingLinkEvidence({
    site: 'https://target.example/',
    client,
  })
  assert.equal(evidence.provenance.capped, false)
  assert.equal(evidence.provenance.completeness, 'unknown')
  assert.deepEqual(evidence.warnings, [])
})

test('Bing link evidence makes an empty provider response explicitly inconclusive', async () => {
  const client = {
    authentication: 'api-key',
    async getLinkCounts() {
      return {
        rows: [],
        totalPages: 0,
        invalidRows: 0,
        capped: false,
        returnedRows: 0,
      }
    },
  } as unknown as BingWebmasterClient

  const evidence = await collectBingLinkEvidence({
    site: 'https://target.example/',
    client,
  })
  assert.equal(evidence.provenance.completeness, 'unknown')
  assert.match(evidence.warnings[0] ?? '', /does not prove/i)
})
