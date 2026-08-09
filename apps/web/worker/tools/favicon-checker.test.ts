import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FAVICON_CHECKER_LIMITS,
  type FaviconCheckerResult,
  handleFaviconCheck,
} from './favicon-checker.ts'

const endpoint = 'https://seoskill.dev/api/tools/favicon-checker'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify({ url }),
  })
}

function htmlResponse(html: string, init?: ResponseInit): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function imageResponse(
  body: Uint8Array,
  contentType = 'image/png',
  init?: ResponseInit,
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
    ...init,
  })
}

async function result(response: Response): Promise<FaviconCheckerResult> {
  assert.equal(response.status, 200)
  return (await response.json()) as FaviconCheckerResult
}

test('checks declared, fallback, Apple, and manifest favicon coverage', async () => {
  const calls: string[] = []
  const responses = new Map<string, () => Response>([
    [
      'https://example.com/',
      () =>
        htmlResponse(`<html><head>
          <base href="https://static.example.com/assets/">
          <link rel="icon" href="favicon.png?theme=light&amp;v=2" sizes="64x64" type="image/png" media="(prefers-color-scheme: light)">
          <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
          <link rel="manifest" href="https://example.com/app/site.webmanifest">
        </head></html>`),
    ],
    [
      'https://example.com/app/site.webmanifest',
      () =>
        new Response(
          JSON.stringify({
            icons: [
              {
                src: 'pwa-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
              },
            ],
          }),
          { headers: { 'content-type': 'application/manifest+json' } },
        ),
    ],
    ['https://example.com/favicon.ico', () => imageResponse(png(32, 32))],
    [
      'https://static.example.com/assets/favicon.png?theme=light&v=2',
      () => imageResponse(png(64, 64)),
    ],
    [
      'https://static.example.com/touch.png',
      () => imageResponse(png(180, 180)),
    ],
    ['https://example.com/app/pwa-512.png', () => imageResponse(png(512, 512))],
  ])

  const checked = await result(
    await handleFaviconCheck(request('example.com/docs'), async (input) => {
      const url = input.toString()
      calls.push(url)
      const response = responses.get(url)
      if (!response) throw new Error(`Unexpected URL: ${url}`)
      return response()
    }),
  )

  assert.equal(checked.source.homepageUrl, 'https://example.com/')
  assert.equal(checked.page.baseUrl, 'https://static.example.com/assets/')
  assert.equal(checked.page.manifestStatus, 'fetched')
  assert.equal(checked.icons.length, 4)
  assert.deepEqual(checked.coverage.googleSearch.state, 'found')
  assert.deepEqual(checked.coverage.browsers.state, 'found')
  assert.deepEqual(checked.coverage.ios.state, 'found')
  assert.deepEqual(checked.coverage.pwa.state, 'found')
  assert.ok(
    checked.icons.some(
      (icon) =>
        icon.url ===
          'https://static.example.com/assets/favicon.png?theme=light&v=2' &&
        icon.image?.width === 64 &&
        icon.declarations[0]?.media === '(prefers-color-scheme: light)' &&
        icon.preview?.dataUrl.startsWith('data:image/png;base64,'),
    ),
  )
  assert.ok(
    checked.icons.some(
      (icon) =>
        icon.url === 'https://example.com/app/pwa-512.png' &&
        icon.declarations[0]?.purpose === 'any maskable',
    ),
  )
  assert.deepEqual(calls, [
    'https://example.com/',
    'https://example.com/app/site.webmanifest',
    'https://example.com/favicon.ico',
    'https://static.example.com/assets/favicon.png?theme=light&v=2',
    'https://static.example.com/touch.png',
    'https://example.com/app/pwa-512.png',
  ])
})

test('keeps inline raster previews within their own output budget', async () => {
  const declarations = Array.from(
    { length: 5 },
    (_, index) => `<link rel="icon" href="/preview-${index}.png">`,
  ).join('')
  const largeIcon = new Uint8Array(120_000)
  largeIcon.set(png(64, 64))
  const checked = await result(
    await handleFaviconCheck(request('https://example.com'), async (input) => {
      if (input.toString() === 'https://example.com/') {
        return htmlResponse(declarations)
      }
      return imageResponse(largeIcon)
    }),
  )

  const previews = checked.icons.flatMap((icon) =>
    icon.preview ? [icon.preview] : [],
  )
  assert.equal(previews.length, 4)
  assert.ok(
    previews.reduce((sum, preview) => sum + preview.bytes, 0) <=
      FAVICON_CHECKER_LIMITS.previewTotalBytes,
  )
  assert.ok(
    checked.icons.some((icon) => icon.fetch.status === 'ok' && !icon.preview),
  )
})

test('inspects SVG dimensions without embedding active markup in a preview', async () => {
  const checked = await result(
    await handleFaviconCheck(request('https://example.com'), async (input) => {
      if (input.toString() === 'https://example.com/') {
        return htmlResponse(
          '<link rel="icon" href="/icon.svg" type="image/svg+xml">',
        )
      }
      if (input.toString() === 'https://example.com/favicon.ico') {
        return new Response('missing', { status: 404 })
      }
      return new Response(
        '<svg viewBox="0 0 64 64"><script>alert(1)</script><path d="M0 0h64v64H0z" /></svg>',
        { headers: { 'content-type': 'image/svg+xml' } },
      )
    }),
  )

  const svg = checked.icons.find((icon) => icon.image?.format === 'svg')
  assert.equal(svg?.image?.width, 64)
  assert.equal(svg?.image?.height, 64)
  assert.equal(svg?.image?.square, true)
  assert.equal(svg?.preview, undefined)
  assert.equal(checked.coverage.googleSearch.state, 'found')
})

test('keeps browser fallback separate from Google favicon declarations', async () => {
  const checked = await result(
    await handleFaviconCheck(
      request('https://example.com/anything'),
      async (input) => {
        if (input.toString() === 'https://example.com/') {
          return htmlResponse(
            '<html><head><title>Example</title></head></html>',
          )
        }
        if (input.toString() === 'https://example.com/favicon.ico') {
          return imageResponse(png(32, 32))
        }
        throw new Error(`Unexpected URL: ${input.toString()}`)
      },
    ),
  )

  assert.equal(checked.coverage.googleSearch.state, 'not-found')
  assert.equal(checked.coverage.browsers.state, 'found')
  assert.equal(checked.coverage.ios.state, 'not-found')
  assert.equal(checked.coverage.pwa.state, 'not-found')
  assert.match(checked.actions[0] ?? '', /Declare a square favicon/u)
})

test('reports non-image responses and HTTP errors without inventing coverage', async () => {
  const checked = await result(
    await handleFaviconCheck(request('https://example.com'), async (input) => {
      if (input.toString() === 'https://example.com/') {
        return htmlResponse(
          '<link rel="icon" href="/login"><link rel="apple-touch-icon" href="/missing.png">',
        )
      }
      if (input.toString() === 'https://example.com/favicon.ico') {
        return new Response('missing', { status: 404 })
      }
      if (input.toString() === 'https://example.com/login') {
        return htmlResponse('<p>Sign in</p>')
      }
      if (input.toString() === 'https://example.com/missing.png') {
        return new Response('gone', { status: 410 })
      }
      throw new Error(`Unexpected URL: ${input.toString()}`)
    }),
  )

  assert.equal(checked.source.dataStatus, 'complete')
  assert.equal(checked.coverage.googleSearch.state, 'issues-found')
  assert.equal(checked.coverage.browsers.state, 'not-found')
  assert.equal(checked.coverage.ios.state, 'not-found')
  assert.equal(
    checked.icons.find((icon) => icon.url.endsWith('/favicon.ico'))?.fetch
      .httpStatus,
    404,
  )
  assert.equal(
    checked.icons.find((icon) => icon.url.endsWith('/missing.png'))?.fetch
      .status,
    'http-error',
  )
  assert.ok(
    checked.warnings.some((warning) =>
      warning.includes('recognised favicon image'),
    ),
  )
})

test('does not treat a link in the page body as a home page favicon declaration', async () => {
  const checked = await result(
    await handleFaviconCheck(request('https://example.com'), async (input) => {
      if (input.toString() === 'https://example.com/') {
        return htmlResponse(
          '<html><head><title>Example</title></head><body><link rel="icon" href="/body-icon.png"></body></html>',
        )
      }
      if (input.toString() === 'https://example.com/favicon.ico') {
        return imageResponse(png(32, 32))
      }
      throw new Error(`Unexpected URL: ${input.toString()}`)
    }),
  )

  assert.equal(checked.icons.length, 1)
  assert.equal(checked.coverage.googleSearch.state, 'not-found')
  assert.equal(checked.coverage.browsers.state, 'found')
})

test('caps icon acquisition at sixteen unique URLs', async () => {
  const declarations = Array.from(
    { length: FAVICON_CHECKER_LIMITS.icons + 5 },
    (_, index) => `<link rel="icon" href="/icon-${index}.png">`,
  ).join('')
  let fetches = 0
  const checked = await result(
    await handleFaviconCheck(request('https://example.com'), async (input) => {
      fetches += 1
      if (input.toString() === 'https://example.com/') {
        return htmlResponse(declarations)
      }
      return imageResponse(png(64, 64))
    }),
  )

  assert.equal(checked.icons.length, FAVICON_CHECKER_LIMITS.icons)
  assert.equal(fetches, 1 + FAVICON_CHECKER_LIMITS.icons)
  assert.equal(checked.source.dataStatus, 'partial')
  assert.ok(
    checked.warnings.includes(
      'Only the first 16 unique icon URLs were checked.',
    ),
  )
  assert.equal(checked.icons[0]?.sources[0], 'fallback')
})

test('rejects unsafe inputs and cross-site browser requests before fetching', async () => {
  let fetches = 0
  const fetcher = async () => {
    fetches += 1
    return htmlResponse('<html></html>')
  }

  const privateResponse = await handleFaviconCheck(
    request('https://127.0.0.1'),
    fetcher,
  )
  const insecureResponse = await handleFaviconCheck(
    request('http://example.com'),
    fetcher,
  )
  const crossSiteResponse = await handleFaviconCheck(
    request('https://example.com', {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    }),
    fetcher,
  )

  assert.equal(privateResponse.status, 400)
  assert.equal(insecureResponse.status, 400)
  assert.equal(crossSiteResponse.status, 404)
  assert.equal(fetches, 0)
})

test('revalidates redirect destinations before fetching private locations', async () => {
  let fetches = 0
  const response = await handleFaviconCheck(
    request('https://example.com'),
    async () => {
      fetches += 1
      return new Response(null, {
        status: 302,
        headers: { location: 'https://localhost/private' },
      })
    },
  )

  assert.equal(response.status, 422)
  assert.equal(fetches, 1)
  assert.match(JSON.stringify(await response.json()), /cannot be fetched/u)
})

test('rejects an oversized homepage before retaining it in memory', async () => {
  const response = await handleFaviconCheck(
    request('https://example.com'),
    async () =>
      htmlResponse('too large', {
        headers: {
          'content-type': 'text/html',
          'content-length': String(FAVICON_CHECKER_LIMITS.homepageBytes + 1),
        },
      }),
  )

  assert.equal(response.status, 413)
  assert.match(JSON.stringify(await response.json()), /download limit/u)
})
