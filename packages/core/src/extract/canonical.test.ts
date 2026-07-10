import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from 'cheerio'
import { extractCanonicalEvidence } from './canonical.js'

test('canonical evidence rejects body declarations and alternate qualifiers', () => {
  const $ = load(`<!doctype html><html><head>
    <link rel="canonical" href="/print" media="print">
  </head><body><link rel="canonical" href="/body"></body></html>`)

  const evidence = extractCanonicalEvidence($, {}, 'https://example.com/page')

  assert.equal(evidence.status, 'outside-head-only')
  assert.deepEqual(
    evidence.candidates.map(({ source, ignoredReason }) => ({
      source,
      ignoredReason,
    })),
    [
      { source: 'html-head', ignoredReason: 'alternate-qualifier' },
      { source: 'html-body', ignoredReason: 'outside-head' },
    ],
  )
})

test('canonical evidence distinguishes duplicate and conflicting targets', () => {
  const same = extractCanonicalEvidence(
    load('<head><link rel="canonical" href="https://example.com/page"></head>'),
    { link: '<https://example.com/page>; rel="canonical"' },
    'https://example.com/page',
  )
  assert.equal(same.status, 'duplicate')
  assert.equal(same.selectedUrl, 'https://example.com/page')

  const conflict = extractCanonicalEvidence(
    load('<head><link rel="canonical" href="/html"></head>'),
    {
      link: '<https://example.com/header,version>; rel="canonical", <https://example.com/alternate>; rel="alternate"',
    },
    'https://example.com/page',
  )
  assert.equal(conflict.status, 'conflicting')
  assert.equal(conflict.selectedUrl, undefined)
  assert.deepEqual(
    conflict.candidates.map((candidate) => candidate.resolved),
    ['https://example.com/html', 'https://example.com/header,version'],
  )
})

test('canonical evidence rejects fragments and non-HTTP targets', () => {
  const evidence = extractCanonicalEvidence(
    load('<head><link rel="canonical" href="#section"></head>'),
    { link: '<mailto:editor@example.com>; rel=canonical' },
    'https://example.com/page',
  )

  assert.equal(evidence.status, 'invalid')
  assert.deepEqual(
    evidence.candidates.map((candidate) => candidate.ignoredReason),
    ['fragment', 'non-http-url'],
  )
})

test('canonical evidence does not resolve an empty href to the page URL', () => {
  const evidence = extractCanonicalEvidence(
    load('<head><link rel="canonical" href=""></head>'),
    {},
    'https://example.com/page',
  )

  assert.equal(evidence.status, 'invalid')
  assert.equal(evidence.selectedUrl, undefined)
  assert.equal(evidence.candidates[0]?.raw, '')
  assert.equal(evidence.candidates[0]?.ignoredReason, 'invalid-url')
})
