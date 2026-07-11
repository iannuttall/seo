import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
import { JavaScriptRenderingError } from './page-fetcher/rendered.js'
import type { PageRenderer } from './page-fetcher/types.js'
import { fetchPage, normalizeJavaScriptRenderingMode } from './page-fetcher.js'

function plainResult(
  html = '<title>SSR page</title><main>Content</main>',
): PageFetchResult {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    headers: { 'content-type': 'text/html' },
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 10,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 4,
        intervalCap: 4,
        intervalMs: 1_000,
      },
    },
    warnings: [],
  }
}

function renderer(
  input: { render?: PageRenderer['render']; onClose?: () => void } = {},
): PageRenderer {
  return {
    render:
      input.render ??
      (async () => ({
        ...plainResult('<title>Rendered page</title><main>Rendered</main>'),
        usedJs: true,
        diagnostics: {
          ...plainResult().diagnostics,
          source: 'rendered',
          cache: 'bypass',
          rendered: true,
          rendering: { mode: 'on', status: 'rendered' },
        },
      })),
    close: async () => input.onClose?.(),
  }
}

function dependencies(
  input: { renderer?: PageRenderer; onCreate?: () => void } = {},
) {
  return {
    fetchPlain: async () => plainResult(),
    createPageRenderer: () => {
      input.onCreate?.()
      return input.renderer ?? renderer()
    },
  }
}

test('normalizes explicit rendering modes while retaining legacy booleans', () => {
  assert.equal(normalizeJavaScriptRenderingMode(undefined), 'auto')
  assert.equal(normalizeJavaScriptRenderingMode(true), 'on')
  assert.equal(normalizeJavaScriptRenderingMode(false), 'off')
  assert.equal(normalizeJavaScriptRenderingMode('on'), 'on')
  assert.equal(normalizeJavaScriptRenderingMode('off'), 'off')
})

test('records when rendering is intentionally off', async () => {
  let created = 0
  const result = await fetchPage(
    'https://example.com/',
    { js: 'off' },
    dependencies({ onCreate: () => created++ }),
  )

  assert.equal(created, 0)
  assert.equal(result.usedJs, false)
  assert.equal(result.diagnostics.rendering?.mode, 'off')
  assert.equal(result.diagnostics.rendering?.status, 'not-requested')
})

test('does not start a browser for a normal SSR page in auto mode', async () => {
  let created = 0
  const result = await fetchPage(
    'https://example.com/',
    { js: 'auto' },
    dependencies({ onCreate: () => created++ }),
  )

  assert.equal(created, 0)
  assert.equal(result.diagnostics.rendering?.status, 'not-needed')
})

test('keeps raw evidence explicit when automatic rendering is unavailable', async () => {
  let closed = 0
  const unavailable = renderer({
    render: async () => {
      throw new JavaScriptRenderingError(
        'JavaScript rendering needs a local Chrome or Chromium browser.',
        'browser-unavailable',
      )
    },
    onClose: () => closed++,
  })
  const result = await fetchPage(
    'https://example.com/',
    { js: 'auto' },
    {
      ...dependencies({ renderer: unavailable }),
      fetchPlain: async () => plainResult('<div id="root"></div>'),
    },
  )

  assert.equal(closed, 1)
  assert.equal(result.usedJs, false)
  assert.equal(result.diagnostics.source, 'network')
  assert.equal(result.diagnostics.rendered, false)
  assert.equal(result.diagnostics.rendering?.status, 'unavailable')
  assert.equal(result.diagnostics.rendering?.raw?.source, 'network')
  assert.match(result.warnings.join('\n'), /raw HTTP HTML only/)
})

test('retains raw provenance alongside successful rendered evidence', async () => {
  const result = await fetchPage(
    'https://example.com/',
    { js: 'on' },
    dependencies({ renderer: renderer() }),
  )

  assert.equal(result.usedJs, true)
  assert.equal(result.diagnostics.source, 'rendered')
  assert.equal(result.diagnostics.rendering?.mode, 'on')
  assert.equal(result.diagnostics.rendering?.status, 'rendered')
  assert.deepEqual(result.diagnostics.rendering?.raw, {
    source: 'network',
    cache: 'miss',
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
  })
  assert.deepEqual(result.diagnostics.rendering?.documentDifference?.changed, [
    'title',
    'content',
  ])
  assert.equal(
    result.diagnostics.rendering?.documentDifference?.raw.title,
    'SSR page',
  )
  assert.equal(
    result.diagnostics.rendering?.documentDifference?.rendered.title,
    'Rendered page',
  )
})
