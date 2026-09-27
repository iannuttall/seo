import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type CheerioAPI, load } from 'cheerio'
import {
  hasNextAppRouterPayload,
  MAX_STREAMED_SEGMENT_INSTRUCTIONS,
  resolveStreamedSegments,
} from './react-streaming.js'
import {
  STREAMED_ARTICLE,
  streamedArticleHtml,
} from './react-streaming.test-fixtures.js'

const parsers: Array<[string, (html: string) => CheerioAPI]> = [
  ['parse5', (html) => load(html)],
  [
    'htmlparser2',
    (html) => load(html, { xml: { xmlMode: false, decodeEntities: true } }),
  ],
]

function text($: CheerioAPI, selector: string): string {
  return $(selector).first().text().replace(/\s+/g, ' ').trim()
}

for (const [name, parse] of parsers) {
  test(`streamed segments replace the Suspense fallback (${name})`, () => {
    const $ = parse(
      streamedArticleHtml({
        canonicalUrl: 'https://example.com/post',
        metadata: 'body',
      }),
    )

    assert.deepEqual(resolveStreamedSegments($), {
      resolved: 2,
      skipped: 0,
      truncated: false,
    })

    const content = text($, '#main-content')
    assert.doesNotMatch(content, new RegExp(STREAMED_ARTICLE.skeletonText))
    assert.doesNotMatch(
      content,
      new RegExp(STREAMED_ARTICLE.nestedSkeletonText),
    )
    assert.equal($('main').length, 0)
    assert.equal($('[hidden]').length, 0)
    assert.equal($('template').length, 0)
    // Order matters: the later segment fills the placeholder between the
    // first paragraph and the related cards, inside the moved boundary.
    assert.ok(
      content.startsWith(
        [
          STREAMED_ARTICLE.heading,
          STREAMED_ARTICLE.firstParagraph,
          STREAMED_ARTICLE.secondParagraph,
          STREAMED_ARTICLE.relatedCards[0],
        ].join(' '),
      ),
    )
    assert.equal($('#main-content h1').length, 1)
  })
}

test('streamed segment resolution leaves unmatched instructions alone', () => {
  const $ = load(`<html><body>
    <div id="main-content"><!--$?--><template id="B:0"></template><p>Fallback</p><!--/$--></div>
    <div hidden id="S:1"><p>Orphan segment</p></div>
    <script>$RC("B:0","S:9");$RS("S:1","P:missing")</script>
  </body></html>`)

  // S:9 never arrived, so only the delivered S:1 counts as skipped.
  assert.deepEqual(resolveStreamedSegments($), {
    resolved: 0,
    skipped: 1,
    truncated: false,
  })
  assert.equal(text($, '#main-content'), 'Fallback')
  assert.equal(text($, '[id="S:1"]'), 'Orphan segment')
})

test('streamed segment resolution stops at the instruction limit', () => {
  const calls = Array.from(
    { length: MAX_STREAMED_SEGMENT_INSTRUCTIONS + 5 },
    (_, index) => `$RS("S:${index}","P:${index}")`,
  ).join(';')
  const $ = load(`<html><body><script>${calls}</script></body></html>`)

  assert.deepEqual(resolveStreamedSegments($), {
    resolved: 0,
    skipped: 0,
    truncated: true,
  })
})

test('rendered HTML with applied streaming scripts is left unchanged', () => {
  // A browser has already run $RC and $RS: segments are gone, scripts remain.
  const html = `<html><body><div id="main-content"><!--$--><article><p>Rendered article</p></article><!--/$--></div>
    <script>$RC("B:0","S:0");$RS("S:1","P:1")</script></body></html>`
  const $ = load(html)

  assert.deepEqual(resolveStreamedSegments($), {
    resolved: 0,
    skipped: 0,
    truncated: false,
  })
  assert.equal($.html(), load(html).html())
})

test('documents without streaming instructions are unchanged', () => {
  const html =
    '<html><head><title>Plain</title></head><body><main><p>Plain page</p></main><div hidden id="S:0">Hidden but not streamed</div></body></html>'
  const $ = load(html)

  assert.deepEqual(resolveStreamedSegments($), {
    resolved: 0,
    skipped: 0,
    truncated: false,
  })
  assert.equal($.html(), load(html).html())
})

test('Next.js App Router payload detection needs inline flight data', () => {
  const next = load(
    streamedArticleHtml({
      canonicalUrl: 'https://example.com/post',
      metadata: 'body',
    }),
  )
  const fizzOnly = load(
    streamedArticleHtml({
      canonicalUrl: 'https://example.com/post',
      metadata: 'body',
      nextPayload: false,
    }),
  )

  assert.equal(hasNextAppRouterPayload(next), true)
  assert.equal(hasNextAppRouterPayload(fizzOnly), false)
  assert.equal(
    hasNextAppRouterPayload(
      load('<script src="/_next/static/chunks/main.js"></script>'),
    ),
    false,
  )
})
