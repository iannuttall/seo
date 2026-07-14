import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertNoRouteCollisions, markdownRouteForPath } from './routes.js'

test('maps root and nested pages to one stable public contract', () => {
  assert.deepEqual(markdownRouteForPath('/'), {
    htmlPath: '/',
    markdownPath: '/index.md',
    filePath: 'index.md',
  })
  assert.deepEqual(markdownRouteForPath('/docs/start/'), {
    htmlPath: '/docs/start',
    markdownPath: '/docs/start.md',
    filePath: 'docs/start.md',
  })
})

test('keeps a base in public URLs without duplicating it in files', () => {
  assert.deepEqual(markdownRouteForPath('/seo/docs/start', '/seo'), {
    htmlPath: '/seo/docs/start',
    markdownPath: '/seo/docs/start.md',
    filePath: 'docs/start.md',
  })
})

test('normalizes Unicode for URLs and decodes it for the filesystem', () => {
  assert.deepEqual(markdownRouteForPath('/café'), {
    htmlPath: '/caf%C3%A9',
    markdownPath: '/caf%C3%A9.md',
    filePath: 'café.md',
  })
})

test('rejects traversal, encoded separators, and routes outside the base', () => {
  for (const pathname of ['/../secret', '/%2e%2e/secret', '/a%2Fb', '/a%5Cb']) {
    assert.throws(() => markdownRouteForPath(pathname), /Route path/u)
  }
  assert.throws(
    () => markdownRouteForPath('/docs/start', '/site'),
    /outside base/u,
  )
})

test('rejects duplicate and case-only output collisions', () => {
  assert.throws(
    () =>
      assertNoRouteCollisions([
        markdownRouteForPath('/docs'),
        markdownRouteForPath('/docs/'),
      ]),
    /Duplicate/u,
  )
  assert.throws(
    () =>
      assertNoRouteCollisions([
        markdownRouteForPath('/Docs'),
        markdownRouteForPath('/docs'),
      ]),
    /Case-insensitive/u,
  )
})
