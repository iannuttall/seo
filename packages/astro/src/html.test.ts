import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalFromHtml,
  injectMarkdownAlternate,
  isNoindexHtml,
  isRedirectHtml,
} from './html.js'

test('injects one absolute Markdown alternate idempotently', () => {
  const original = '<HTML><HEAD><title>Page</title></HEAD><body></body></HTML>'
  const once = injectMarkdownAlternate(original, 'https://example.com/page.md')
  const twice = injectMarkdownAlternate(once, 'https://example.com/page.md')

  assert.equal(twice, once)
  assert.equal((once.match(/type="text\/markdown"/gu) ?? []).length, 1)
  assert.match(once, /href="https:\/\/example\.com\/page\.md"/u)
})

test('replaces an existing managed alternate regardless of attribute order', () => {
  const html =
    '<html><head><link href="/old.md" type="text/markdown" rel="alternate"></head><body></body></html>'
  const result = injectMarkdownAlternate(html, 'https://example.com/new.md')

  assert.doesNotMatch(result, /old\.md/u)
  assert.match(result, /https:\/\/example\.com\/new\.md/u)
})

test('classifies redirects, noindex pages, and canonicals', () => {
  const html = `<html><head>
    <meta HTTP-EQUIV="refresh" content="0;url=/new">
    <meta name="ROBOTS" content="nofollow, NOINDEX">
    <link rel="CANONICAL" href="https://example.com/new">
  </head></html>`

  assert.equal(isRedirectHtml(html), true)
  assert.equal(isNoindexHtml(html), true)
  assert.equal(canonicalFromHtml(html), 'https://example.com/new')
})

test('fails rather than emitting an undiscoverable alternate', () => {
  assert.throws(
    () => injectMarkdownAlternate('<html><body></body></html>', '/page.md'),
    /without <\/head>/u,
  )
})
