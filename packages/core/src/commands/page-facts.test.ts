import assert from 'node:assert/strict'
import { test } from 'node:test'
import { headFacts } from './page-facts.js'

test('reads the first title, description, H1, canonical and robots', () => {
  const facts = headFacts(
    `<html><head><title>Tools &amp; tips | Site</title>
    <meta name="Description" content="Fast &quot;tips&quot;">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="/a">
    <title>Second</title></head>
    <body><h1>  Big
      heading </h1><h1>Other</h1></body></html>`,
    'https://example.com/page',
  )
  assert.deepEqual(facts, {
    title: 'Tools & tips | Site',
    description: 'Fast "tips"',
    h1: 'Big heading',
    canonical: 'https://example.com/a',
    robots: 'noindex',
  })
})

test('missing tags stay null', () => {
  assert.deepEqual(headFacts('<p>hi</p>', 'https://example.com/'), {
    title: null,
    description: null,
    h1: null,
    canonical: null,
    robots: null,
  })
})
