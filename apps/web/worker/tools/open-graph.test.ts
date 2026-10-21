import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleOpenGraphCheck, type OpenGraphResult } from './open-graph.ts'

// A PNG header with the given size, padded to a byte count.
function png(width: number, height: number, bytes = 64): Uint8Array {
  const data = new Uint8Array(bytes)
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  data.set([0x49, 0x48, 0x44, 0x52], 12)
  const view = new DataView(data.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return data
}

function site(files: Record<string, string | Uint8Array>) {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const file = files[url]
    if (file === undefined) return new Response('missing', { status: 404 })
    return typeof file === 'string'
      ? new Response(file, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      : new Response(file, { headers: { 'content-type': 'image/png' } })
  }
  return { fetch, calls }
}

async function check(url: string, files: Record<string, string | Uint8Array>) {
  const { fetch, calls } = site(files)
  const response = await handleOpenGraphCheck(
    new Request('https://seoskill.dev/api/tools/open-graph', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://seoskill.dev',
      },
      body: JSON.stringify({ url }),
    }),
    fetch,
  )
  assert.equal(response.status, 200)
  return { result: (await response.json()) as OpenGraphResult, calls }
}

const levels = (result: OpenGraphResult) =>
  Object.fromEntries(result.checks.map((item) => [item.id, item.level]))

test('resolves a relative share image, measures it and lets X fall back to it', async () => {
  const { result, calls } = await check('https://example.com/post', {
    'https://example.com/post': `<!doctype html><html><head>
      <title>Post | Example</title>
      <link rel="canonical" href="https://example.com/post">
      <meta property="og:title" content="A post &amp; more">
      <meta property="og:image" content="/share.png">
      <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
      <meta property="og:url" content="https://example.com/other">
      <meta name="twitter:card" content="summary_large_image">
      </head><body><meta property="og:description" content="late"></body></html>`,
    'https://example.com/share.png': png(1200, 600),
  })
  assert.equal(result.preview.title, 'A post & more')
  assert.equal(result.preview.image, 'https://example.com/share.png')
  assert.equal(result.preview.xImage, 'https://example.com/share.png')
  assert.equal(result.preview.xTitle, 'A post & more')
  // One fetch serves both platforms.
  assert.equal(calls.filter((url) => url.endsWith('/share.png')).length, 1)
  assert.deepEqual(result.images[0]?.usedBy, ['open-graph', 'x'])
  assert.equal(result.images[0]?.width, 1200)
  const found = levels(result)
  assert.equal(found['og-image'], 'warn')
  assert.equal(found['image-declared'], 'warn')
  assert.equal(found['og-url'], 'warn')
  assert.equal(found['outside-head'], 'warn')
  assert.equal(found['og-description'], 'warn')
})

test('fails images below the minimum and reports a missing image as a failure, not a pass', async () => {
  const small = await check('https://example.com/', {
    'https://example.com/':
      '<head><meta property="og:image" content="https://example.com/i.png"><meta name="twitter:image" content="https://example.org/x.png"></head>',
    'https://example.com/i.png': png(150, 150),
  })
  const found = levels(small.result)
  assert.equal(found['image-dimensions'], 'fail')
  assert.equal(found['image-x'], 'fail')
  assert.equal(small.result.images.length, 2)

  const none = await check('https://example.com/', {
    'https://example.com/': '<head><title>Home</title></head>',
  })
  assert.equal(levels(none.result)['og-image'], 'fail')
  assert.equal(none.result.images.length, 0)
  assert.equal(none.result.preview.title, 'Home')
})
