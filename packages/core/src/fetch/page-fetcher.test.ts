import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
import { resolveBrowserExecutable } from './page-fetcher/browser-path.js'
import {
  normalizeRateControls,
  recordHostFetch,
  waitForHostBackpressure,
} from './page-fetcher/rate-controls.js'
import { JavaScriptRenderingError } from './page-fetcher/rendered.js'
import type { PageRenderer } from './page-fetcher/types.js'
import { fetchPage } from './page-fetcher.js'

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

test('finds the newest browser that agent-browser or Playwright installed', () => {
  const home = '/home/example'
  const listings: Record<string, string[]> = {
    [`${home}/.agent-browser/browsers`]: [
      'chrome-99.0.1',
      'chrome-157.0.8103.38',
      'chrome-156.0.8078.73',
    ],
    [`${home}/.cache/ms-playwright`]: ['chromium-1200', 'chromium-1300'],
  }
  const installed = new Set([
    `${home}/.agent-browser/browsers/chrome-156.0.8078.73/chrome`,
    `${home}/.agent-browser/browsers/chrome-157.0.8103.38/chrome`,
    `${home}/.cache/ms-playwright/chromium-1300/chrome-linux64/chrome`,
  ])
  const resolve = (available: Set<string>) =>
    resolveBrowserExecutable('/missing/playwright/chrome', {
      environment: {},
      platform: 'linux',
      homeDirectory: home,
      fileExists: (path) => available.has(path),
      listDirectory: (path) => listings[path] ?? [],
    })

  assert.deepEqual(resolve(installed), {
    status: 'available',
    browser: {
      path: `${home}/.agent-browser/browsers/chrome-157.0.8103.38/chrome`,
      source: 'agent-browser-cache',
      product: 'agent-browser Chrome for Testing',
    },
  })
  const playwrightOnly = new Set(
    [...installed].filter((path) => path.includes('ms-playwright')),
  )
  const fallback = resolve(playwrightOnly)
  assert.equal(
    fallback.status === 'available' ? fallback.browser.path : undefined,
    `${home}/.cache/ms-playwright/chromium-1300/chrome-linux64/chrome`,
  )
})

test('rate limits slow the host down instead of stopping it', async () => {
  const host = 'rate-limited.example'
  const rate = normalizeRateControls({ concurrency: 1 })
  for (let index = 0; index < 4; index += 1) {
    recordHostFetch({ host, status: 429, durationMs: 5, rate })
  }
  const snapshot = await waitForHostBackpressure(host, rate)
  assert.equal(snapshot.status, 'ok')
  assert.equal(snapshot.consecutiveBlocked, 0)
  assert.match(snapshot.reason ?? '', /rate limited the crawler \(HTTP 429\)/)

  recordHostFetch({ host, status: 403, durationMs: 5, rate })
  recordHostFetch({ host, status: 403, durationMs: 5, rate })
  await assert.rejects(waitForHostBackpressure(host, rate), {
    name: 'OriginBackpressureError',
  })
})
