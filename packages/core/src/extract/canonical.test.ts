import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from 'cheerio'
import { extractCanonicalEvidence } from './canonical.js'
import { streamedArticleHtml } from './react-streaming.test-fixtures.js'

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

const NEXT_PAYLOAD =
  '<script>(self.__next_f=self.__next_f||[]).push([0])</script>'

test('canonical evidence accepts Next.js streamed body metadata as streamed', () => {
  const url = 'https://example.com/post'
  const streamed = extractCanonicalEvidence(
    load(streamedArticleHtml({ canonicalUrl: url, metadata: 'body' })),
    {},
    url,
  )
  assert.equal(streamed.status, 'streamed-outside-head')
  assert.equal(streamed.selectedUrl, url)
  assert.deepEqual(streamed.candidates, [
    { source: 'html-body', raw: url, resolved: url, streamedMetadata: true },
  ])

  // The same page served with metadata in the head (HTML-limited bot or a
  // cached response) is an ordinary single canonical.
  const head = extractCanonicalEvidence(
    load(streamedArticleHtml({ canonicalUrl: url, metadata: 'head' })),
    {},
    url,
  )
  assert.equal(head.status, 'single')
  assert.equal(head.candidates[0]?.source, 'html-head')
  assert.equal(head.candidates[0]?.streamedMetadata, undefined)
})

test('canonical evidence still rejects body canonicals outside Next.js', () => {
  const url = 'https://example.com/post'
  // React streaming markers alone do not prove Next.js streamed metadata.
  const fizzOnly = extractCanonicalEvidence(
    load(
      streamedArticleHtml({
        canonicalUrl: url,
        metadata: 'body',
        nextPayload: false,
      }),
    ),
    {},
    url,
  )
  assert.equal(fizzOnly.status, 'outside-head-only')
  assert.equal(fizzOnly.selectedUrl, undefined)
  assert.equal(fizzOnly.candidates[0]?.ignoredReason, 'outside-head')
  assert.equal(fizzOnly.candidates[0]?.streamedMetadata, undefined)

  const plain = extractCanonicalEvidence(
    load(
      '<html><head><title>Plain</title></head><body><main><link rel="canonical" href="/post"></main></body></html>',
    ),
    {},
    url,
  )
  assert.equal(plain.status, 'outside-head-only')
})

test('streamed canonicals still take part in duplicate, conflict, and invalid checks', () => {
  const base = 'https://example.com/post'
  const evidence = (head: string, body: string) =>
    extractCanonicalEvidence(
      load(
        `<html><head>${head}</head><body>${NEXT_PAYLOAD}${body}</body></html>`,
      ),
      {},
      base,
    )

  const duplicate = evidence(
    `<link rel="canonical" href="${base}">`,
    `<link rel="canonical" href="${base}">`,
  )
  assert.equal(duplicate.status, 'duplicate')
  assert.equal(duplicate.selectedUrl, base)
  assert.equal(duplicate.candidates[0]?.source, 'html-head')

  const conflict = evidence(
    '<link rel="canonical" href="https://example.com/head">',
    '<link rel="canonical" href="https://example.com/streamed">',
  )
  assert.equal(conflict.status, 'conflicting')

  const invalid = evidence('', '<link rel="canonical" href="mailto:a@b.c">')
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.candidates[0]?.ignoredReason, 'non-http-url')
})
