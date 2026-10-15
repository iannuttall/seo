import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type CheerioAPI, load } from 'cheerio'
import {
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
