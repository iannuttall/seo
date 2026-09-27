import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
import { extractPage } from './page-extractor.js'
import { extractionFixtures } from './page-extractor.test-fixtures.js'
import {
  STREAMED_ARTICLE,
  streamedArticleHtml,
  streamedArticleWords,
} from './react-streaming.test-fixtures.js'

function fetched(url: string, html: string): PageFetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 1,
      retries: 0,
      rateLimit: {
        host: new URL(url).host,
        concurrency: 1,
        intervalCap: 1,
        intervalMs: 1_000,
      },
    },
    warnings: [],
  }
}

for (const fixture of extractionFixtures) {
  test(`Defuddle fixture: ${fixture.name}`, async () => {
    const page = await extractPage(fetched(fixture.url, fixture.html))

    assert.equal(page.contentExtraction.used, 'defuddle')
    assert.equal(page.contentExtraction.fallback, false)
    assert.equal(page.contentExtraction.baseUrl, fixture.url)
    assert.ok(page.wordCount >= fixture.minimumWords)
    for (const text of fixture.includes)
      assert.match(page.contentText, new RegExp(text, 'u'))
    for (const text of fixture.excludes)
      assert.doesNotMatch(page.contentText, new RegExp(text, 'u'))
  })
}

for (const metadata of ['body', 'head'] as const) {
  test(`crawler extraction counts streamed article text (metadata in ${metadata})`, async () => {
    const url = 'https://example.com/guides/streamed'
    const page = await extractPage(
      fetched(url, streamedArticleHtml({ canonicalUrl: url, metadata })),
      'crawler',
    )

    // Before streamed segments were resolved, the crawler counted the empty
    // skeleton main and reported 0 words for this page.
    assert.equal(page.wordCount, streamedArticleWords())
    assert.equal(page.crawlerEvidence?.h1Count, 1)
    assert.deepEqual(page.contentExtraction.streamedSegments, {
      resolved: 2,
      skipped: 0,
      truncated: false,
    })
    assert.match(page.contentText, new RegExp(STREAMED_ARTICLE.secondParagraph))
    for (const hidden of [
      STREAMED_ARTICLE.skeletonText,
      STREAMED_ARTICLE.navigationText,
      STREAMED_ARTICLE.footerText,
      STREAMED_ARTICLE.flightPayloadText,
    ]) {
      assert.doesNotMatch(page.contentText, new RegExp(hidden))
    }
  })
}

test('Defuddle extraction reads streamed article segments', async () => {
  const url = 'https://example.com/guides/streamed'
  const page = await extractPage(
    fetched(url, streamedArticleHtml({ canonicalUrl: url, metadata: 'body' })),
  )

  assert.equal(page.contentExtraction.used, 'defuddle')
  assert.match(page.contentText, new RegExp(STREAMED_ARTICLE.firstParagraph))
  assert.match(page.contentText, new RegExp(STREAMED_ARTICLE.secondParagraph))
  assert.doesNotMatch(
    page.contentText,
    new RegExp(STREAMED_ARTICLE.skeletonText),
  )
  assert.ok(page.wordCount >= 40)
})

test('crawler main content prefers the article that holds the H1', async () => {
  const page = await extractPage(
    fetched(
      'https://example.com/post',
      `<!doctype html><html><head><title>Post</title></head><body>
        <nav>Menu words</nav>
        <article><a href="/one">Card one</a></article>
        <article><h1>Real title</h1>
          <p>Real body text words</p>
          <script>var ignored = "script words"</script><style>p { color: red }</style>
        </article>
        <article><a href="/three">Card three</a></article>
      </body></html>`,
    ),
    'crawler',
  )

  assert.equal(page.contentText, 'Real title Real body text words')
  assert.equal(page.wordCount, 6)
})

test('crawler main content uses the body without chrome for card listings', async () => {
  const page = await extractPage(
    fetched(
      'https://example.com/blog',
      `<!doctype html><html><head><title>Blog</title></head><body>
        <header><h2>Blog index</h2></header>
        <nav>Menu words</nav>
        <article><a href="/one">Card one</a></article>
        <article><a href="/two">Card two</a></article>
        <aside>Sidebar words</aside>
        <footer>Footer words</footer>
        <script>self.__next_f.push([1, "payload words"])</script>
      </body></html>`,
    ),
    'crawler',
  )

  assert.equal(page.contentText, 'Blog index Card one Card two')
})

test('crawler main content keeps an explicit main landmark first', async () => {
  const page = await extractPage(
    fetched(
      'https://example.com/landing',
      `<!doctype html><html><head><title>Landing</title></head><body>
        <article><h1>Promo headline</h1><p>Promo body</p></article>
        <div role="main"><p>Landing page body</p><noscript>Enable JavaScript</noscript></div>
      </body></html>`,
    ),
    'crawler',
  )

  assert.equal(page.contentText, 'Landing page body')
})
