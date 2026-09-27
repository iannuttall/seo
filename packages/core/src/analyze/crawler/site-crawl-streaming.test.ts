import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  streamedArticleHtml,
  streamedArticleWords,
} from '../../extract/react-streaming.test-fixtures.js'
import { auditCrawlPages } from './audit.js'
import { crawlPage } from './audit.test-fixtures.js'
import { crawlSite } from './site-crawl.js'
import { withServer } from './site-crawl.test-fixtures.js'

async function crawlOne(baseUrl: string, path: string) {
  const report = await crawlSite({
    url: `${baseUrl}${path}`,
    mode: 'page',
    useSitemap: false,
    maxPages: 1,
    refresh: true,
  })
  const page = report.pages[0]
  assert.ok(page)
  return {
    page,
    canonicalIssues: report.issues
      .filter((issue) => ['canonical', 'indexability'].includes(issue.category))
      .map((issue) => issue.ruleId)
      .sort(),
    ruleIds: report.issues.map((issue) => issue.ruleId),
  }
}

test('crawlSite reports Next.js streamed metadata and streamed article text', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    const self = `${fixture.baseUrl}${req.url}`
    if (req.url === '/streamed') {
      res.end(streamedArticleHtml({ canonicalUrl: self, metadata: 'body' }))
    } else if (req.url === '/cached') {
      res.end(streamedArticleHtml({ canonicalUrl: self, metadata: 'head' }))
    } else if (req.url === '/streamed-elsewhere') {
      res.end(
        streamedArticleHtml({
          canonicalUrl: `${fixture.baseUrl}/preferred`,
          metadata: 'body',
        }),
      )
    } else {
      res.end(
        streamedArticleHtml({
          canonicalUrl: self,
          metadata: 'body',
          nextPayload: false,
        }),
      )
    }
  })

  try {
    const streamed = await crawlOne(fixture.baseUrl, '/streamed')
    assert.equal(streamed.page.canonicalStatus, 'streamed-outside-head')
    assert.equal(streamed.page.canonical, `${fixture.baseUrl}/streamed`)
    assert.equal(streamed.page.canonicalCandidates?.[0]?.source, 'html-body')
    assert.equal(streamed.page.canonicalCandidates?.[0]?.streamedMetadata, true)
    assert.equal(streamed.page.declaredIndexability, 'indexable-candidate')
    assert.deepEqual(streamed.canonicalIssues, ['canonical_streamed_in_body'])
    assert.equal(streamed.page.wordCount, streamedArticleWords())
    assert.equal(streamed.ruleIds.includes('near_empty_content'), false)
    assert.match(
      streamed.page.warnings?.join(' ') ?? '',
      /streamed into the body/u,
    )

    // The same document with metadata in the head is a plain single canonical
    // with the same content evidence.
    const cached = await crawlOne(fixture.baseUrl, '/cached')
    assert.equal(cached.page.canonicalStatus, 'single')
    assert.deepEqual(cached.canonicalIssues, [])
    assert.equal(cached.page.wordCount, streamed.page.wordCount)
    assert.equal(cached.page.mainContentHash, streamed.page.mainContentHash)

    // A streamed canonical is still the declared target, so non-self targets
    // are reported instead of being hidden behind an ignored declaration.
    const elsewhere = await crawlOne(fixture.baseUrl, '/streamed-elsewhere')
    assert.equal(elsewhere.page.declaredIndexability, 'canonical-hint-other')
    assert.deepEqual(elsewhere.canonicalIssues, [
      'canonical_streamed_in_body',
      'canonicalized_page',
    ])

    // Without Next.js flight data, a body canonical is still ignored.
    const plain = await crawlOne(fixture.baseUrl, '/react-without-next')
    assert.equal(plain.page.canonicalStatus, 'outside-head-only')
    assert.equal(plain.page.canonical, undefined)
    assert.deepEqual(plain.canonicalIssues, ['canonical_outside_head'])
    assert.equal(plain.page.wordCount, streamedArticleWords())
  } finally {
    await fixture.close()
  }
})

test('auditCrawlPages does not check ignored body canonical values', () => {
  const issues = auditCrawlPages([
    crawlPage({
      url: 'https://example.com/body',
      canonical: undefined,
      canonicalRaw: '/relative-body-canonical',
      canonicalStatus: 'outside-head-only',
      canonicalCandidates: [
        {
          source: 'html-body',
          raw: '/relative-body-canonical',
          resolved: 'https://example.com/relative-body-canonical',
          ignoredReason: 'outside-head',
        },
      ],
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'canonical')
      .map((issue) => issue.ruleId),
    ['canonical_outside_head'],
  )
})
