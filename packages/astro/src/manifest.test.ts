import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderAgentRouteManifest, sha256 } from './manifest.js'

test('renders a sorted manifest without build-time data', () => {
  const entry = (path: string) => ({
    bytes: 10,
    canonical: `https://example.com${path}`,
    description: `${path} description`,
    htmlFile: `${path.slice(1) || 'index'}/index.html`,
    htmlPath: path,
    language: 'en',
    markdownFile: `${path.slice(1) || 'index'}.md`,
    markdownPath: `${path === '/' ? '/index' : path}.md`,
    noindex: false,
    sha256: sha256(path),
    title: path,
    tokens: 3,
  })
  const rendered = renderAgentRouteManifest('https://example.com', [
    entry('/z'),
    entry('/a'),
  ])
  const parsed = JSON.parse(rendered)

  assert.deepEqual(
    parsed.pages.map((page: { htmlPath: string }) => page.htmlPath),
    ['/a', '/z'],
  )
  assert.doesNotMatch(rendered, /generated|timestamp|duration/iu)
  assert.ok(rendered.endsWith('\n'))
})
