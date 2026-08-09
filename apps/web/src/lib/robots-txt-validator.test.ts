import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyseRobotsTxt,
  parseRobotsTxt,
  ROBOTS_CRAWLER_PRESETS,
  ROBOTS_TXT_LIMITS,
  testRobotsUrl,
} from './robots-txt-validator.ts'

test('offers a focused set of search, AI, media and archive crawler presets', () => {
  const values = ROBOTS_CRAWLER_PRESETS.map((preset) => preset.value)

  assert.equal(new Set(values).size, values.length)
  for (const expected of [
    'ChatGPT-User',
    'Claude-User',
    'Googlebot-Image',
    'Googlebot-News',
    'Googlebot-Video',
    'Google-InspectionTool',
    'Applebot',
    'Applebot-Extended',
    'CCBot',
    'Bytespider',
  ]) {
    assert.ok(values.includes(expected), `${expected} is available`)
  }
})

test('parses groups, rules, sitemaps and line-level ignored fields', () => {
  const document = parseRobotsTxt(`# file
User-agent: Googlebot
Disallow: /private
Crawl-delay: 2
Sitemap: https://example.com/sitemap.xml

User-agent: *
Allow: /
Bad line
`)

  assert.equal(document.groups.length, 2)
  assert.equal(document.rules, 2)
  assert.deepEqual(document.sitemaps, [
    { value: 'https://example.com/sitemap.xml', line: 5, valid: true },
  ])
  assert.deepEqual(
    document.issues.map((value) => [value.code, value.line]),
    [
      ['google-ignores-crawl-delay', 4],
      ['missing-colon', 9],
    ],
  )
})

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

test('normalizes unreserved percent escapes but retains reserved escapes', () => {
  const document = parseRobotsTxt(`User-agent: *
Disallow: /foo/bar
Disallow: /encoded%2Fslash
`)

  assert.equal(
    testRobotsUrl(document, '/foo/%62ar', 'Bot', 'https://example.com').verdict,
    'blocked',
  )
  assert.equal(
    testRobotsUrl(document, '/encoded%2fslash', 'Bot', 'https://example.com')
      .verdict,
    'blocked',
  )
  assert.equal(
    testRobotsUrl(document, '/encoded/slash', 'Bot', 'https://example.com')
      .verdict,
    'allowed',
  )
})

test('keeps protocol, host and port scope exact and implicitly allows robots.txt', () => {
  const document = parseRobotsTxt(`User-agent: *
Disallow: /
`)

  assert.equal(
    testRobotsUrl(document, 'http://example.com/', 'Bot', 'https://example.com')
      .verdict,
    'not-applicable',
  )
  assert.equal(
    testRobotsUrl(
      document,
      'https://www.example.com/',
      'Bot',
      'https://example.com',
    ).verdict,
    'not-applicable',
  )
  assert.equal(
    testRobotsUrl(document, '/robots.txt', 'Bot', 'https://example.com')
      .verdict,
    'allowed',
  )
})

test('reports malformed and ignored rules without discarding parseable rules', () => {
  const document = parseRobotsTxt(`Disallow: /before
User-agent:
User-agent: GoodBot/1.0
User-agent: GoodBot
Disallow:
Allow: relative
Disallow: /kept
Unknown: value
Sitemap: relative.xml
`)

  assert.deepEqual(
    document.issues.map((value) => value.code),
    [
      'rule-before-user-agent',
      'invalid-user-agent',
      'invalid-user-agent',
      'empty-rule',
      'invalid-rule-path',
      'unknown-field',
      'invalid-sitemap-url',
    ],
  )
  assert.equal(document.rules, 1)
  assert.equal(
    testRobotsUrl(document, '/kept', 'GoodBot', 'https://example.com').verdict,
    'blocked',
  )
})

test('bounds content and URL test inputs', () => {
  assert.throws(
    () => parseRobotsTxt('x'.repeat(ROBOTS_TXT_LIMITS.bytes + 1)),
    /exceeds/u,
  )
  assert.throws(
    () =>
      analyseRobotsTxt({
        content: '',
        origin: 'https://example.com',
        urls: Array.from({ length: ROBOTS_TXT_LIMITS.urls + 1 }, () => '/'),
        userAgent: 'Googlebot',
      }),
    /no more than 100/u,
  )
})
