import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptsMarkdown,
  createCloudflareMarkdownHandler,
  parseAccept,
} from './cloudflare.js'

const markdown = '# Docs\n\nUseful docs.\n'
const markdownBytes = Buffer.byteLength(markdown)
const markdownTokens = String(Math.ceil(markdownBytes / 4))
const modified = 'Tue, 14 Jul 2026 10:00:00 GMT'

function fixtureAssets(): {
  calls: Request[]
  fetch(request: Request): Promise<Response>
} {
  const calls: Request[] = []
  return {
    calls,
    async fetch(request) {
      calls.push(request.clone())
      const url = new URL(request.url)
      const isMarkdown = ['/docs.md', '/index.md', '/privacy.md'].includes(
        url.pathname,
      )
      if (isMarkdown) {
        const headers = new Headers({
          'Cache-Control': 'public, max-age=60',
          'Content-Length': String(markdownBytes),
          'Content-Type': 'text/markdown',
          ETag: '"markdown-etag"',
          'Last-Modified': modified,
          Link: '<https://example.com/license>; rel="license"',
          'X-Markdown-Tokens': markdownTokens,
        })
        if (url.pathname === '/privacy.md') {
          headers.set('X-Robots-Tag', 'noindex, follow')
        }
        if (
          request.headers.get('If-None-Match') === '"markdown-etag"' ||
          request.headers.get('If-Modified-Since') === modified
        ) {
          headers.delete('Content-Length')
          return new Response(null, { headers, status: 304 })
        }
        const range = request.headers.get('Range')
        if (range === 'bytes=0-9') {
          headers.set('Content-Length', '10')
          headers.set('Content-Range', `bytes 0-9/${markdownBytes}`)
          headers.delete('X-Markdown-Tokens')
          return new Response(markdown.slice(0, 10), {
            headers,
            status: 206,
          })
        }
        return new Response(request.method === 'HEAD' ? null : markdown, {
          headers,
        })
      }
      if (url.pathname === '/.well-known/agent-skills/seo/SKILL.md') {
        return new Response('# Skill\n', {
          headers: { 'Content-Type': 'text/markdown' },
        })
      }
      if (url.pathname === '/missing' || url.pathname === '/missing.md') {
        return new Response('Not found', {
          headers: { 'Content-Type': 'text/html' },
          status: 404,
        })
      }
      const htmlHeaders = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        ETag: '"html-etag"',
        'Last-Modified': modified,
        Link: '<https://example.com/feed>; rel="alternate"',
      })
      if (
        request.headers.get('If-None-Match') === '"html-etag"' ||
        request.headers.get('If-Modified-Since') === modified
      ) {
        return new Response(null, { headers: htmlHeaders, status: 304 })
      }
      return new Response('<html><h1>Docs</h1></html>', {
        headers: htmlHeaders,
      })
    },
  }
}

function handler() {
  return createCloudflareMarkdownHandler({
    canonicalHosts: ['example.com', 'www.example.com'],
    contentSignal: 'search=yes, ai-input=yes, ai-train=no',
    noindexPaths: ['/privacy'],
    responseHeaders: { 'Strict-Transport-Security': 'max-age=300' },
    site: 'https://example.com',
  })
}

test('parses precise Accept quality values and defaults ties to HTML', () => {
  assert.equal(parseAccept('text/markdown').length, 1)
  assert.equal(acceptsMarkdown(null), false)
  assert.equal(acceptsMarkdown('*/*'), false)
  assert.equal(acceptsMarkdown('text/*'), false)
  assert.equal(acceptsMarkdown('text/markdown/extra'), false)
  assert.equal(acceptsMarkdown('TEXT/MARKDOWN ; Q=0.8'), true)
  assert.equal(acceptsMarkdown('text/markdown;q=0, */*;q=1'), false)
  assert.equal(acceptsMarkdown('text/markdown;q=0, text/*;q=1'), false)
  assert.equal(acceptsMarkdown('text/html;q=0.7, text/markdown;q=0.8'), true)
  assert.equal(acceptsMarkdown('text/html;q=0.8, text/markdown;q=0.8'), false)
  assert.equal(acceptsMarkdown('text/markdown;q="0.5"'), true)
  assert.equal(acceptsMarkdown('text/markdown;q=wat'), false)
  assert.equal(acceptsMarkdown('text/markdown;q=1;q=0.5'), false)
  assert.equal(acceptsMarkdown('application/json'), false)
})

test('serves explicit and negotiated Markdown as identical bytes', async () => {
  const assets = fixtureAssets()
  const explicit = await handler()(
    new Request('https://example.com/docs.md'),
    assets,
  )
  const negotiated = await handler()(
    new Request('https://example.com/docs', {
      headers: { Accept: 'text/markdown, text/html;q=0.5' },
    }),
    assets,
  )

  assert.equal(await explicit.text(), markdown)
  assert.equal(await negotiated.text(), markdown)
  for (const response of [explicit, negotiated]) {
    assert.equal(
      response.headers.get('Content-Type'),
      'text/markdown; charset=utf-8',
    )
    assert.match(
      response.headers.get('Link') ?? '',
      /<https:\/\/example\.com\/docs>; rel="canonical"/u,
    )
    assert.match(response.headers.get('Link') ?? '', /rel="license"/u)
    assert.equal(response.headers.get('Vary'), 'Accept')
    assert.equal(response.headers.get('ETag'), '"markdown-etag"')
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60')
    assert.equal(response.headers.get('X-Markdown-Tokens'), markdownTokens)
    assert.equal(
      response.headers.get('Content-Signal'),
      'search=yes, ai-input=yes, ai-train=no',
    )
    assert.equal(
      response.headers.get('Strict-Transport-Security'),
      'max-age=300',
    )
  }
})

test('keeps HTML as the default and preserves existing Link values', async () => {
  const response = await handler()(
    new Request('https://example.com/docs', { headers: { Accept: '*/*' } }),
    fixtureAssets(),
  )

  assert.match(await response.text(), /<h1>Docs<\/h1>/u)
  assert.match(response.headers.get('Link') ?? '', /rel="alternate"/u)
  assert.match(response.headers.get('Link') ?? '', /example\.com\/docs\.md/u)
  assert.match(response.headers.get('Link') ?? '', /example\.com\/feed/u)
  assert.equal(response.headers.get('Vary'), 'Accept')
  assert.equal(response.headers.get('ETag'), '"html-etag"')
})

test('GET and HEAD select the same Markdown headers without a HEAD body', async () => {
  const assets = fixtureAssets()
  const get = await handler()(
    new Request('https://example.com/docs', {
      headers: { Accept: 'text/markdown' },
    }),
    assets,
  )
  const head = await handler()(
    new Request('https://example.com/docs', {
      headers: { Accept: 'text/markdown' },
      method: 'HEAD',
    }),
    assets,
  )

  assert.equal(await head.text(), '')
  for (const name of [
    'Content-Length',
    'Content-Type',
    'ETag',
    'Link',
    'Vary',
    'X-Markdown-Tokens',
  ]) {
    assert.equal(head.headers.get(name), get.headers.get(name), name)
  }
})

test('decorates validators for HTML, explicit Markdown and negotiated Markdown', async () => {
  for (const [url, headers] of [
    ['https://example.com/docs', { 'If-None-Match': '"html-etag"' }],
    ['https://example.com/docs.md', { 'If-None-Match': '"markdown-etag"' }],
    [
      'https://example.com/docs',
      {
        Accept: 'text/markdown',
        'If-Modified-Since': modified,
      },
    ],
  ] as const) {
    const response = await handler()(
      new Request(url, { headers }),
      fixtureAssets(),
    )
    assert.equal(response.status, 304)
    assert.equal(await response.text(), '')
    assert.equal(response.headers.get('Vary'), 'Accept')
    assert.ok(response.headers.get('Link'))
    if (url.endsWith('.md') || 'Accept' in headers) {
      assert.equal(response.headers.get('X-Markdown-Tokens'), markdownTokens)
    }
  }
})

test('uses the full representation size for explicit and negotiated ranges', async () => {
  for (const [url, accept] of [
    ['https://example.com/docs.md', undefined],
    ['https://example.com/docs', 'text/markdown'],
  ] as const) {
    const headers = new Headers({ Range: 'bytes=0-9' })
    if (accept) headers.set('Accept', accept)
    const response = await handler()(
      new Request(url, { headers }),
      fixtureAssets(),
    )
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('Content-Length'), '10')
    assert.equal(
      response.headers.get('Content-Range'),
      `bytes 0-9/${markdownBytes}`,
    )
    assert.equal(response.headers.get('X-Markdown-Tokens'), markdownTokens)
    assert.equal(await response.text(), markdown.slice(0, 10))
  }
})

test('preserves noindex, real 404s and non-page Markdown assets', async () => {
  const assets = fixtureAssets()
  const privacy = await handler()(
    new Request('https://example.com/privacy.md'),
    assets,
  )
  const privacyHtml = await handler()(
    new Request('https://example.com/privacy'),
    assets,
  )
  const missing = await handler()(
    new Request('https://example.com/missing', {
      headers: { Accept: 'text/markdown' },
    }),
    assets,
  )
  const skill = await handler()(
    new Request('https://example.com/.well-known/agent-skills/seo/SKILL.md'),
    assets,
  )

  assert.equal(privacy.headers.get('X-Robots-Tag'), 'noindex, follow')
  assert.equal(privacyHtml.headers.get('X-Robots-Tag'), 'noindex, follow')
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('Link'), null)
  assert.equal(skill.headers.get('Link'), null)
  assert.equal(skill.headers.get('Vary'), null)
  assert.equal(
    skill.headers.get('Content-Signal'),
    'search=yes, ai-input=yes, ai-train=no',
  )
})

test('redirects only configured canonical host aliases', async () => {
  const response = await handler()(
    new Request('https://www.example.com/docs?x=1'),
    fixtureAssets(),
  )
  assert.equal(response.status, 308)
  assert.equal(response.headers.get('Location'), 'https://example.com/docs?x=1')
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=300')

  const defaultHandler = createCloudflareMarkdownHandler({
    site: 'https://example.com',
  })
  const unconfigured = await defaultHandler(
    new Request('https://www.example.com/docs'),
    fixtureAssets(),
  )
  assert.equal(unconfigured.status, 200)
})

test('rejects methods that cannot negotiate a representation', async () => {
  const response = await handler()(
    new Request('https://example.com/docs', { method: 'POST' }),
    fixtureAssets(),
  )
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET, HEAD')
})
