import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { unstable_dev } from 'wrangler'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const manifest = JSON.parse(
  await readFile(resolve(dist, 'agent-routes.json'), 'utf8'),
)
const docsPage = manifest.pages.find((page) => page.htmlPath === '/docs')
assert.ok(docsPage)

function linkRel(response, rel) {
  return (response.headers.get('Link') ?? '').includes(`rel="${rel}"`)
}

test('local Worker serves every generated representation contract', async (t) => {
  const worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.jsonc',
    experimental: { disableExperimentalWarning: true },
  })
  t.after(() => worker.stop())

  for (const page of manifest.pages) {
    await t.test(page.htmlPath, async () => {
      const expected = await readFile(resolve(dist, page.markdownFile), 'utf8')
      const html = await worker.fetch(page.htmlPath, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      })
      assert.equal(html.status, 200)
      assert.match(html.headers.get('Content-Type') ?? '', /^text\/html/u)
      assert.equal(html.headers.get('Vary'), 'Accept')
      assert.ok(linkRel(html, 'alternate'))

      const negotiated = await worker.fetch(page.htmlPath, {
        headers: { Accept: 'text/markdown, text/html;q=0.5' },
        redirect: 'manual',
      })
      assert.equal(negotiated.status, 200)
      assert.equal(
        negotiated.headers.get('Content-Type'),
        'text/markdown; charset=utf-8',
      )
      assert.equal(negotiated.headers.get('Vary'), 'Accept')
      assert.equal(
        negotiated.headers.get('X-Markdown-Tokens'),
        `${page.tokens}`,
      )
      assert.ok(linkRel(negotiated, 'canonical'))
      assert.equal(await negotiated.text(), expected)

      const explicit = await worker.fetch(page.markdownPath, {
        redirect: 'manual',
      })
      assert.equal(explicit.status, 200)
      assert.equal(explicit.headers.get('X-Markdown-Tokens'), `${page.tokens}`)
      assert.equal(await explicit.text(), expected)

      for (const response of [html, negotiated, explicit]) {
        assert.equal(
          response.headers.get('Content-Signal'),
          'search=yes, ai-input=yes, ai-train=no',
        )
        assert.equal(
          response.headers.get('Strict-Transport-Security'),
          'max-age=300',
        )
        assert.equal(
          response.headers.get('X-Robots-Tag'),
          page.noindex ? 'noindex, follow' : null,
        )
      }
    })
  }

  await t.test('validators, ranges and request order', async () => {
    const first = await worker.fetch('/docs.md')
    const etag = first.headers.get('ETag')
    assert.ok(etag)
    const notModified = await worker.fetch('/docs', {
      headers: {
        Accept: 'text/markdown',
        'If-None-Match': etag,
      },
      redirect: 'manual',
    })
    assert.equal(notModified.status, 304)
    assert.equal(
      notModified.headers.get('X-Markdown-Tokens'),
      `${docsPage.tokens}`,
    )
    assert.ok(linkRel(notModified, 'canonical'))

    const range = await worker.fetch('/docs', {
      headers: { Accept: 'text/markdown', Range: 'bytes=0-9' },
    })
    assert.ok([200, 206].includes(range.status))
    const rangeBytes = (await range.arrayBuffer()).byteLength
    if (range.status === 206) {
      assert.equal(rangeBytes, 10)
      assert.match(range.headers.get('Content-Range') ?? '', /^bytes 0-9\//u)
    } else {
      assert.equal(rangeBytes, docsPage.bytes)
    }
    assert.equal(range.headers.get('X-Markdown-Tokens'), `${docsPage.tokens}`)

    for (const accept of ['text/html', 'text/markdown', 'text/html']) {
      const response = await worker.fetch('/docs', {
        headers: { Accept: accept },
      })
      assert.match(
        response.headers.get('Content-Type') ?? '',
        accept === 'text/markdown' ? /^text\/markdown/u : /^text\/html/u,
      )
    }
  })

  await t.test('asset bypass, canonical forms and real 404s', async () => {
    const assetNames = await readdir(resolve(dist, '_astro'))
    const bundledAsset = assetNames.find((name) => name.endsWith('.js'))
    assert.ok(bundledAsset)

    for (const pathname of [
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/.well-known/agent-skills/seo/SKILL.md',
      `/_astro/${bundledAsset}`,
    ]) {
      const response = await worker.fetch(pathname)
      assert.equal(response.status, 200, pathname)
      assert.equal(response.headers.get('Vary'), null, pathname)
      assert.equal(response.headers.get('Link'), null, pathname)
    }

    for (const pathname of ['/missing', '/missing.md']) {
      const response = await worker.fetch(pathname, { redirect: 'manual' })
      assert.equal(response.status, 404, pathname)
      assert.equal(response.headers.get('Link'), null, pathname)
    }

    for (const pathname of [
      '/docs/',
      '/docs//',
      '/docs/index.html',
      '/docs.html',
    ]) {
      const response = await worker.fetch(pathname, { redirect: 'manual' })
      assert.equal(response.status, 307, pathname)
      assert.equal(
        new URL(response.headers.get('Location'), 'https://seoskill.dev')
          .pathname,
        '/docs',
      )
    }
  })
})
