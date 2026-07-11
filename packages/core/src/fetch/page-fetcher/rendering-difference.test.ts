import assert from 'node:assert/strict'
import test from 'node:test'
import type { PageFetchResult } from '../../types.js'
import { renderingDocumentDifference } from './rendering-difference.js'

function page(html: string): PageFetchResult {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    headers: {},
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 1,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 1,
        intervalCap: 1,
        intervalMs: 1,
      },
    },
    warnings: [],
  }
}

test('rendering differences retain compact raw and rendered observations', () => {
  const raw = page(`
    <title>Raw title</title>
    <meta name="description" content="Raw description">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="/raw">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
    <h1>Raw heading</h1><a href="/raw-link">Raw link</a><p>Raw page text.</p>
  `)
  const rendered = page(`
    <title>Rendered title</title>
    <meta name="description" content="Rendered description">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="/rendered">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script>
    <h1>Rendered heading</h1><a href="https://other.example/link">Rendered link</a><p>Rendered page text with more words.</p>
  `)

  const difference = renderingDocumentDifference(raw, rendered)

  assert.deepEqual(difference.changed, [
    'title',
    'metaDescription',
    'canonical',
    'robots',
    'headings',
    'links',
    'content',
    'structuredData',
  ])
  assert.equal(difference.raw.title, 'Raw title')
  assert.equal(
    difference.rendered.canonical.url,
    'https://example.com/rendered',
  )
  assert.deepEqual(difference.raw.robots, { meta: 'follow, index' })
  assert.deepEqual(difference.rendered.headings, [
    { level: 1, text: 'Rendered heading' },
  ])
  assert.equal(difference.raw.links.internal, 1)
  assert.equal(difference.rendered.links.external, 1)
  assert.deepEqual(difference.rendered.structuredData.schemaTypes, ['Product'])
})

test('rendering differences ignore directive order and unchanged snapshots', () => {
  const raw = page(
    '<meta name="robots" content="index, follow"><h1>Same</h1><p>Same text.</p>',
  )
  const rendered = page(
    '<meta name="robots" content="follow,index"><h1>Same</h1><p>Same text.</p>',
  )

  assert.deepEqual(renderingDocumentDifference(raw, rendered).changed, [])
})
