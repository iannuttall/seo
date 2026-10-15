import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCanonical } from './canonical-checker.ts'
import { generateHreflang } from './hreflang-generator.ts'
import { generateSeoReportTemplate } from './seo-report-template.ts'
import { generateSerpMetaHtml } from './serp-preview.ts'

test('SEO report HTML escapes user content and never invents values', () => {
  const result = generateSeoReportTemplate({
    siteName: '<Field & Co>',
    reportTitle: 'SEO "report" <draft>',
    periodStart: '',
    periodEnd: '',
    audience: 'owner',
    comparison: 'none',
    sections: ['summary', 'actions'],
    format: 'html',
  })

  assert.match(
    result.output,
    /<title>SEO &quot;report&quot; &lt;draft&gt;<\/title>/u,
  )
  assert.match(result.output, /&lt;Field &amp; Co&gt;/u)
  assert.match(result.output, /\[Add reporting period\]/u)
  assert.doesNotMatch(result.output, /<Field/u)
  assert.equal(result.includedSections, 2)
  assert.equal(result.filename, 'field-co-template.html')
})

test('hreflang generator emits reciprocal HTML tags and canonicalizes codes', () => {
  const result = generateHreflang(
    [
      { code: 'en-gb', url: 'https://example.com/uk#top' },
      { code: 'FR', url: 'https://example.com/fr' },
      { code: 'x-default', url: 'https://example.com/language' },
    ],
    'html',
  )

  assert.deepEqual(result.entries, [
    { code: 'en-GB', url: 'https://example.com/uk' },
    { code: 'fr', url: 'https://example.com/fr' },
    { code: 'x-default', url: 'https://example.com/language' },
  ])
  assert.match(result.output, /hreflang="en-GB"/u)
  assert.match(result.output, /hreflang="x-default"/u)
  assert.equal(result.issues.length, 0)
})

test('SERP meta HTML escapes injected attributes and tags', () => {
  const output = generateSerpMetaHtml({
    siteName: 'Field',
    url: 'https://example.com',
    title: 'Field <notes> & birds',
    description: 'A "useful" guide <script>alert(1)</script>',
    query: '',
    device: 'desktop',
    addition: 'none',
  })

  assert.match(output, /<title>Field &lt;notes&gt; &amp; birds<\/title>/u)
  assert.match(output, /content="A &quot;useful&quot; guide &lt;script&gt;/u)
  assert.doesNotMatch(output, /<script>/u)
})

test('canonical checker distinguishes a valid self-reference', () => {
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/field#top',
    candidates: [{ href: 'https://example.com/field#section', inHead: true }],
  })

  assert.equal(result.status, 'valid')
  assert.equal(result.candidates[0]?.resolved, 'https://example.com/field')
  assert.equal(result.candidates[0]?.relation, 'self')
  assert.equal(
    result.suggestedTag,
    '<link rel="canonical" href="https://example.com/field">',
  )
  assert.equal(result.issues.length, 0)
})
