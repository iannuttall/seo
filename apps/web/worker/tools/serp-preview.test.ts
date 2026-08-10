import assert from 'node:assert/strict'
import test from 'node:test'
import {
  handleSerpPreviewFetch,
  SERP_PREVIEW_FETCH_LIMITS,
  type SerpPreviewFetchResult,
} from './serp-preview.ts'

const endpoint = 'https://seoskill.dev/api/tools/serp-preview'

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

test('loads page metadata and a bounded favicon after safe redirects', async () => {
  const fetched: string[] = []
  const response = await handleSerpPreviewFetch(
    request({ url: 'example.com/old-page' }),
    async (input) => {
      const url = input.toString()
      fetched.push(url)
      if (url === 'https://example.com/old-page') {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://www.example.com/guides/field-notes' },
        })
      }
      if (url === 'https://www.example.com/guides/field-notes') {
        return new Response(
          `<!doctype html><html><head>
            <base href="/assets/">
            <title>Field &amp; coastal notes</title>
            <meta name="description" content="Record &quot;coastal&quot; wildlife.">
            <meta property="og:site_name" content="Field Journal">
            <link rel="shortcut icon" href="icons/site.png">
          </head><body>Page</body></html>`,
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      }
      if (url === 'https://www.example.com/assets/icons/site.png') {
        return new Response(png(64, 64), {
          headers: { 'content-type': 'image/png' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  )

  assert.equal(response.status, 200)
  const result = (await response.json()) as SerpPreviewFetchResult
  assert.equal(
    result.source.finalUrl,
    'https://www.example.com/guides/field-notes',
  )
  assert.deepEqual(result.source.redirects, [
    {
      from: 'https://example.com/old-page',
      to: 'https://www.example.com/guides/field-notes',
      status: 301,
    },
  ])
  assert.equal(result.source.subrequests, 3)
  assert.equal(result.metadata.title, 'Field & coastal notes')
  assert.equal(result.metadata.description, 'Record "coastal" wildlife.')
  assert.equal(result.metadata.siteName, 'Field Journal')
  assert.equal(result.metadata.favicon.status, 'found')
  assert.equal(
    result.metadata.favicon.url,
    'https://www.example.com/assets/icons/site.png',
  )
  assert.match(result.metadata.favicon.dataUrl, /^data:image\/png;base64,/u)
  assert.deepEqual(result.warnings, [])
  assert.deepEqual(fetched, [
    'https://example.com/old-page',
    'https://www.example.com/guides/field-notes',
    'https://www.example.com/assets/icons/site.png',
  ])
})

test('keeps useful page evidence when metadata or a favicon is absent', async () => {
  const response = await handleSerpPreviewFetch(
    request({ url: 'https://example.com/page' }),
    async (input) =>
      input.toString() === 'https://example.com/page'
        ? new Response('<html><head></head><body>Page</body></html>', {
            headers: { 'content-type': 'text/html' },
          })
        : new Response('not found', { status: 404 }),
  )
  assert.equal(response.status, 200)
  const result = (await response.json()) as SerpPreviewFetchResult
  assert.equal(result.metadata.title, '')
  assert.equal(result.metadata.description, '')
  assert.equal(result.metadata.siteName, 'example.com')
  assert.deepEqual(result.metadata.favicon, { status: 'unavailable' })
  assert.deepEqual(result.warnings, [
    'The fetched page has no title element.',
    'The fetched page has no meta description.',
    'No previewable favicon could be loaded.',
  ])
})

test('rejects invalid requests before network acquisition', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
    })
  }
  const responses = await Promise.all([
    handleSerpPreviewFetch(new Request(endpoint), fetcher),
    handleSerpPreviewFetch(
      request(
        { url: 'https://example.com' },
        { origin: 'https://attacker.example' },
      ),
      fetcher,
    ),
    handleSerpPreviewFetch(
      new Request(endpoint, { method: 'POST', body: 'text' }),
      fetcher,
    ),
    handleSerpPreviewFetch(request({ url: 'http://example.com' }), fetcher),
    handleSerpPreviewFetch(
      request({ url: 'https://example.com', extra: true }),
      fetcher,
    ),
  ])
  assert.deepEqual(
    responses.map((response) => response.status),
    [405, 404, 400, 400, 400],
  )
  assert.equal(calls, 0)
})

test('rejects unsafe redirects, non-HTML pages, and oversized HTML', async () => {
  const unsafe = await handleSerpPreviewFetch(
    request({ url: 'https://example.com' }),
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
  )
  const nonHtml = await handleSerpPreviewFetch(
    request({ url: 'https://example.com/file.pdf' }),
    async () =>
      new Response('pdf', { headers: { 'content-type': 'application/pdf' } }),
  )
  const oversized = await handleSerpPreviewFetch(
    request({ url: 'https://example.com/large' }),
    async () =>
      new Response('too large', {
        headers: {
          'content-length': String(SERP_PREVIEW_FETCH_LIMITS.htmlBytes + 1),
          'content-type': 'text/html',
        },
      }),
  )
  const streamedOversized = await handleSerpPreviewFetch(
    request({ url: 'https://example.com/streamed-large' }),
    async () =>
      new Response(new Uint8Array(SERP_PREVIEW_FETCH_LIMITS.htmlBytes + 1), {
        headers: { 'content-type': 'text/html' },
      }),
  )
  assert.equal(unsafe.status, 422)
  assert.equal(nonHtml.status, 422)
  assert.equal(oversized.status, 413)
  assert.equal(streamedOversized.status, 413)
  assert.match(
    String(((await unsafe.json()) as { error: string }).error),
    /cannot be fetched/u,
  )
  assert.match(
    String(((await nonHtml.json()) as { error: string }).error),
    /did not return an HTML page/u,
  )
  assert.match(
    String(((await oversized.json()) as { error: string }).error),
    /size limit/u,
  )
})

test('bounds extracted text, favicon candidates, and returned output', async () => {
  const fetched: string[] = []
  const response = await handleSerpPreviewFetch(
    request({ url: 'https://example.com/limits' }),
    async (input) => {
      const url = input.toString()
      fetched.push(url)
      if (url === 'https://example.com/limits') {
        return new Response(
          `<html><head>
            <title>${'T'.repeat(400)}</title>
            <meta name="description" content="${'D'.repeat(1_200)}">
            <meta property="og:site_name" content="${'S'.repeat(200)}">
            <link rel="icon" href="/first.png">
            <link rel="icon" href="/second.png">
            <link rel="icon" href="/third.png">
          </head></html>`,
          { headers: { 'content-type': 'text/html' } },
        )
      }
      return new Response('not found', { status: 404 })
    },
  )
  assert.equal(response.status, 200)
  const result = (await response.json()) as SerpPreviewFetchResult
  assert.equal(result.metadata.title.length, 300)
  assert.equal(result.metadata.description.length, 1_000)
  assert.equal(result.metadata.siteName.length, 100)
  assert.equal(result.source.subrequests, 3)
  assert.deepEqual(fetched, [
    'https://example.com/limits',
    'https://example.com/first.png',
    'https://example.com/second.png',
  ])
  assert.ok(JSON.stringify(result).length < 4_096)
})
