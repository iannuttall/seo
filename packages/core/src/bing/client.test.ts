import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { BingWebmasterClient } from './client.js'

function client(responses: Record<string, unknown>) {
  return new BingWebmasterClient(
    { apiKey: 'secret-key' },
    {
      fetchImpl: async (url) => {
        const parsed = new URL(url)
        const method = parsed.pathname.split('/').at(-1) ?? ''
        assert.equal(parsed.searchParams.get('apikey'), 'secret-key')
        return new Response(JSON.stringify({ d: responses[method] }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  )
}

test('Bing client errors never expose the API key', async () => {
  const api = new BingWebmasterClient(
    { apiKey: 'do-not-print' },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ Message: 'InvalidApiKey' }), {
          status: 400,
        }),
    },
  )
  await assert.rejects(
    () => api.listSites(),
    (error: Error) =>
      /providers bing connect/.test(error.message) &&
      !error.message.includes('do-not-print'),
  )
})

test('Bing client rejects oversized provider responses before parsing rows', async () => {
  const api = new BingWebmasterClient(
    { apiKey: 'secret-key' },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ d: 'x'.repeat(2_100_000) }), {
          headers: { 'content-type': 'application/json' },
        }),
    },
  )
  await assert.rejects(
    () => api.getQueryStats('https://example.com/'),
    /exceeds the 2000000-byte response limit/i,
  )
})

test('Bing client normalizes link count and referring URL pages', async () => {
  const api = client({
    GetLinkCounts: {
      Links: [
        { Url: 'https://example.com/a', Count: 12 },
        { Url: 123, Count: 2 },
      ],
      TotalPages: 3,
    },
    GetUrlLinks: {
      Details: [
        { Url: 'https://source.example/a', AnchorText: ' Example ' },
        { Url: false },
      ],
      TotalPages: 2,
    },
  })
  assert.deepEqual(await api.getLinkCounts('https://example.com/', 0), {
    rows: [{ url: 'https://example.com/a', count: 12 }],
    totalPages: 3,
    invalidRows: 1,
    capped: false,
    returnedRows: 1,
  })
  assert.deepEqual(
    await api.getUrlLinks('https://example.com/', 'https://example.com/a', 0),
    {
      rows: [{ url: 'https://source.example/a', anchorText: 'Example' }],
      totalPages: 2,
      invalidRows: 1,
      capped: false,
      returnedRows: 1,
    },
  )
})
