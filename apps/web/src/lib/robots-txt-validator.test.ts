import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRobotsTxt, testRobotsUrl } from './robots-txt-validator.ts'

test('uses the most specific user-agent and merges repeated groups', () => {
  const document = parseRobotsTxt(`User-agent: *
Disallow: /global

User-agent: Googlebot
Disallow: /one

User-agent: Googlebot
Disallow: /two

User-agent: Googlebot-News
Disallow: /news
`)

  const google = testRobotsUrl(
    document,
    '/two/page',
    'Mozilla compatible Googlebot/2.1',
    'https://example.com',
  )
  const news = testRobotsUrl(
    document,
    '/news/story',
    'Googlebot-News',
    'https://example.com',
  )
  const globalDoesNotMerge = testRobotsUrl(
    document,
    '/global/page',
    'Googlebot',
    'https://example.com',
  )

  assert.equal(google.verdict, 'blocked')
  assert.equal(google.rule?.line, 8)
  assert.deepEqual(google.groupUserAgents, ['googlebot'])
  assert.equal(news.verdict, 'blocked')
  assert.deepEqual(news.groupUserAgents, ['googlebot-news'])
  assert.equal(globalDoesNotMerge.verdict, 'allowed')
})

test('uses longest matching rule and lets Allow win an equal tie', () => {
  const document = parseRobotsTxt(`User-agent: *
Disallow: /
Allow: /public
Disallow: /same
Allow: /same
`)

  const publicResult = testRobotsUrl(
    document,
    '/public/page',
    'ExampleBot',
    'https://example.com',
  )
  const tiedResult = testRobotsUrl(
    document,
    '/same',
    'ExampleBot',
    'https://example.com',
  )

  assert.equal(publicResult.verdict, 'allowed')
  assert.equal(publicResult.rule?.pattern, '/public')
  assert.equal(tiedResult.verdict, 'allowed')
  assert.equal(tiedResult.rule?.line, 5)
})

test('supports wildcards, end anchors and query strings', () => {
  const document = parseRobotsTxt(`User-agent: *
Disallow: /*.php$
Disallow: /*?preview=
`)

  assert.equal(
    testRobotsUrl(document, '/index.php', 'Bot', 'https://example.com').verdict,
    'blocked',
  )
  assert.equal(
    testRobotsUrl(document, '/index.php?id=1', 'Bot', 'https://example.com')
      .verdict,
    'allowed',
  )
  assert.equal(
    testRobotsUrl(document, '/post?preview=true', 'Bot', 'https://example.com')
      .verdict,
    'blocked',
  )
})
