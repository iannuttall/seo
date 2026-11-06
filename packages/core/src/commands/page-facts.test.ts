import assert from 'node:assert/strict'
import { test } from 'node:test'
import { headFacts } from './page-facts.js'
import { parseRedirectMap, traceRedirectMap } from './redirect-chain.js'

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
    google_noindex: true,
  })
})

test('a googlebot noindex is a noindex for Google; other crawlers are named', () => {
  const facts = headFacts(
    `<head><meta name="bingbot" content="noindex">
    <meta name="robots" content="max-snippet:50">
    <meta name="Googlebot" content="noindex, nofollow"></head>`,
    'https://example.com/page',
  )
  assert.equal(
    facts.robots,
    'bingbot: noindex, max-snippet:50, googlebot: noindex, nofollow',
  )
  assert.equal(facts.google_noindex, true)
  const news = headFacts(
    '<meta name="googlebot-news" content="noindex">',
    'https://example.com/page',
  )
  assert.equal(news.robots, 'googlebot-news: noindex')
  assert.equal(news.google_noindex, false)
})

test('an empty title, description or H1 is empty, not missing', () => {
  const empty = headFacts(
    '<title> </title><meta name="description" content=""><h1></h1>',
    'https://example.com/page',
  )
  assert.equal(empty.title, '')
  assert.equal(empty.description, '')
  assert.equal(empty.h1, '')
  const missing = headFacts('<p>Text</p>', 'https://example.com/page')
  assert.equal(missing.title, null)
  assert.equal(missing.description, null)
  assert.equal(missing.h1, null)
})

test('gives each redirect map row its verdict from the live chain', async () => {
  const redirects: Record<string, string> = {
    'https://example.com/old': '/new/',
    'https://example.com/moved': 'https://www.example.com/x',
    'https://www.example.com/x': 'https://example.com/new',
    'https://example.com/a': '/b',
    'https://example.com/b': 'https://example.com/a',
  }
  const fetch = async (url: string) => {
    if (url.startsWith('https://down.example')) {
      throw new TypeError('fetch failed')
    }
    const location = redirects[url]
    return new Response(null, {
      status: location ? 301 : 200,
      headers: location ? { location } : {},
    })
  }
  const rows = parseRedirectMap(
    [
      'old_url,expected_new_url',
      'https://example.com/old,https://EXAMPLE.com/new',
      'https://example.com/moved,https://example.com/new',
      'https://example.com/old,https://example.com/other',
      'https://example.com/a',
      'https://example.com/new,https://example.com/new2',
      'https://down.example/old,https://example.com/new',
    ].join('\n'),
  )
  const verdicts: [number, string, number, number | null][] = []
  const summary = await traceRedirectMap(
    rows,
    (row) => {
      verdicts.push([row.line, row.verdict, row.hops, row.final_status])
    },
    { fetch },
  )
  assert.deepEqual(verdicts, [
    [2, 'matches', 1, 200],
    [3, 'chain', 2, 200],
    [4, 'wrong_target', 1, 200],
    [5, 'loop', 2, 301],
    [6, 'not_redirected', 0, 200],
    [7, 'error', 0, null],
  ])
  assert.equal(summary.rows, 6)
})
