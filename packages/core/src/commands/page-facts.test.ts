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
