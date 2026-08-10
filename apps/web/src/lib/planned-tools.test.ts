import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeCanonical,
  CANONICAL_CHECKER_LIMITS,
} from './canonical-checker.ts'
import { generateHreflang, HREFLANG_LIMITS } from './hreflang-generator.ts'
import {
  generateSeoReportTemplate,
  SEO_REPORT_SECTIONS,
  SEO_REPORT_TEMPLATE_LIMITS,
} from './seo-report-template.ts'
import {
  generateSerpMetaHtml,
  serpDisplayUrl,
  serpQueryTerms,
  serpWidthStatus,
  truncateSerpText,
} from './serp-preview.ts'

const allSections = SEO_REPORT_SECTIONS.map((section) => section.id)

test('SEO report template includes every selected evidence section in registry order', () => {
  const result = generateSeoReportTemplate({
    siteName: 'Field Journal',
    reportTitle: 'Field Journal monthly SEO report',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    audience: 'client',
    comparison: 'both',
    sections: [...allSections].reverse(),
    format: 'markdown',
  })

  assert.equal(result.includedSections, SEO_REPORT_SECTIONS.length)
  assert.match(result.output, /^# Field Journal monthly SEO report/mu)
  assert.match(result.output, /Reporting period: 2026-07-01 to 2026-07-31/u)
  assert.match(result.output, /Audience: Client/u)
  assert.match(result.output, /Comparison: Previous period and last year/u)
  assert.ok(
    result.output.indexOf('## Executive summary') <
      result.output.indexOf('## Sources, coverage, and caveats'),
  )
  assert.match(result.output, /Source and dates/u)
  assert.match(
    result.output,
    /missing, partial, capped, sampled, and unavailable/u,
  )
  assert.equal(result.filename, 'field-journal-template.md')
  assert.equal(result.capped, false)
})

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

test('SEO report section selection is deduplicated and bounded', () => {
  const sections = Array.from(
    { length: SEO_REPORT_TEMPLATE_LIMITS.sections * 4 },
    () => 'summary' as const,
  )
  const result = generateSeoReportTemplate({
    siteName: '',
    reportTitle: '',
    periodStart: '',
    periodEnd: '',
    audience: 'unknown',
    comparison: 'unknown',
    sections,
    format: 'markdown',
  })

  assert.equal(result.includedSections, 1)
  assert.equal(result.output.match(/^## Executive summary$/gmu)?.length, 1)
  assert.equal(result.filename, 'seo-report-template.md')
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

test('hreflang generator emits a complete Link header', () => {
  const result = generateHreflang(
    [
      { code: 'en', url: 'https://example.com/en' },
      { code: 'de-CH', url: 'https://example.com/ch' },
    ],
    'header',
  )

  assert.match(result.output, /^Link: <https:\/\/example\.com\/en>/u)
  assert.match(result.output, /hreflang="de-CH"/u)
  assert.ok(result.issues.some((issue) => issue.code === 'missing_default'))
  assert.equal(result.filename, 'hreflang-link-header.txt')
})

test('hreflang sitemap repeats the complete alternate set for every URL', () => {
  const result = generateHreflang(
    [
      { code: 'en', url: 'https://example.com/en?a=1&b=2' },
      { code: 'fr', url: 'https://example.com/fr' },
      { code: 'x-default', url: 'https://example.com/' },
    ],
    'sitemap',
  )

  assert.equal(result.output.match(/<url>/gu)?.length, 3)
  assert.equal(result.output.match(/hreflang="en"/gu)?.length, 3)
  assert.match(result.output, /a=1&amp;b=2/u)
  assert.equal(result.filename, 'hreflang-sitemap.xml')
})

test('hreflang supports the localized-page pattern in Google documentation', () => {
  const result = generateHreflang(
    [
      { code: 'en-gb', url: 'https://example.com/en-gb' },
      { code: 'en-us', url: 'https://example.com/en-us' },
      { code: 'en', url: 'https://example.com/en' },
      { code: 'de', url: 'https://example.com/de' },
      { code: 'x-default', url: 'https://example.com/' },
    ],
    'html',
  )

  assert.equal(result.entries.length, 5)
  assert.equal(result.output.match(/rel="alternate"/gu)?.length, 5)
  assert.match(result.output, /hreflang="en-GB"/u)
  assert.match(result.output, /hreflang="en-US"/u)
  assert.match(result.output, /hreflang="x-default"/u)
  assert.deepEqual(result.issues, [])
})

test('hreflang rejects malformed, duplicate, and incomplete rows', () => {
  const result = generateHreflang(
    [
      { code: 'english', url: '/relative' },
      { code: 'en', url: 'https://example.com/en' },
      { code: 'EN', url: 'https://example.com/duplicate' },
    ],
    'html',
  )

  assert.equal(result.output, '')
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_code'))
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_url'))
  assert.ok(result.issues.some((issue) => issue.code === 'duplicate_code'))
})

test('hreflang input acquisition is capped before output expansion', () => {
  const rows = Array.from(
    { length: HREFLANG_LIMITS.entries + 20 },
    (_, index) => ({
      code: index === 0 ? 'en' : index === 1 ? 'fr' : `z${index}`,
      url: `https://example.com/${index}`,
    }),
  )
  const result = generateHreflang(rows, 'html')

  assert.ok(result.issues.some((issue) => issue.code === 'entry_cap'))
  assert.ok(result.entries.length <= HREFLANG_LIMITS.entries)
  assert.ok(result.output.length <= HREFLANG_LIMITS.outputBytes)
})

const tenPixelsPerCharacter = (value: string) => [...value].length * 10

test('SERP widths use the supplied rendered measurement and device budget', () => {
  assert.deepEqual(
    serpWidthStatus('Short title', 'desktop', 'title', tenPixelsPerCharacter),
    {
      characters: 11,
      pixels: 110,
      budget: 600,
      status: 'fits',
    },
  )
  assert.equal(
    serpWidthStatus('x'.repeat(70), 'mobile', 'title', tenPixelsPerCharacter)
      .status,
    'may-truncate',
  )
})

test('SERP text truncation is deterministic and Unicode safe', () => {
  assert.equal(truncateSerpText('abcdef', 50, tenPixelsPerCharacter), 'ab...')
  assert.equal(truncateSerpText('short', 100, tenPixelsPerCharacter), 'short')
  assert.doesNotMatch(
    truncateSerpText(
      'Field notes 🐦 from the coast',
      130,
      tenPixelsPerCharacter,
    ),
    /�/u,
  )
})

test('SERP display URL and query terms are bounded and normalized', () => {
  assert.deepEqual(
    serpDisplayUrl('https://www.example.com/guides/field-notes?ref=1'),
    { site: 'example.com', breadcrumb: 'guides › field notes' },
  )
  assert.deepEqual(serpQueryTerms('Free FREE SEO tool + checker'), [
    'free',
    'seo',
    'tool',
    'checker',
  ])
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

test('canonical checker resolves relative values against the first base URL', () => {
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/products/one',
    baseHref: 'https://cdn.example.com/catalog/',
    candidates: [{ href: 'preferred', inHead: true }],
  })

  assert.equal(result.status, 'valid')
  assert.equal(
    result.candidates[0]?.resolved,
    'https://cdn.example.com/catalog/preferred',
  )
  assert.equal(result.candidates[0]?.relation, 'cross-site')
  assert.ok(result.issues.some((issue) => issue.code === 'relative_canonical'))
  assert.ok(result.issues.some((issue) => issue.code === 'cross_site'))
})

test('canonical checker ignores an invalid base and falls back to the page URL', () => {
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/products/one',
    baseHref: 'javascript:alert(1)',
    candidates: [{ href: '../preferred', inHead: true }],
  })

  assert.equal(result.status, 'valid')
  assert.equal(result.candidates[0]?.resolved, 'https://example.com/preferred')
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_base'))
  assert.ok(result.issues.some((issue) => issue.code === 'relative_canonical'))
})

test('canonical checker reports missing tags as an observation, not an error', () => {
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/unique',
    candidates: [],
  })

  assert.equal(result.status, 'missing')
  assert.equal(result.issues[0]?.level, 'note')
  assert.match(result.issues[0]?.message ?? '', /optional/u)
})

test('canonical checker rejects invalid page and canonical protocols', () => {
  const result = analyzeCanonical({
    pageUrl: 'not a URL',
    candidates: [{ href: 'javascript:alert(1)', inHead: true }],
  })

  assert.equal(result.status, 'invalid')
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_page_url'))
  assert.ok(result.issues.some((issue) => issue.code === 'invalid_canonical'))
})

test('canonical checker reports multiple and misplaced links', () => {
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/current',
    candidates: [
      { href: 'https://example.com/a', inHead: true },
      { href: 'https://example.com/b', inHead: false },
    ],
  })

  assert.equal(result.status, 'multiple')
  assert.ok(result.issues.some((issue) => issue.code === 'multiple'))
  assert.ok(result.issues.some((issue) => issue.code === 'outside_head'))
})

test('canonical candidate and message retention stay bounded', () => {
  const candidates = Array.from(
    { length: CANONICAL_CHECKER_LIMITS.candidates + 100 },
    (_, index) => ({ href: `https://example.com/${index}`, inHead: false }),
  )
  const result = analyzeCanonical({
    pageUrl: 'https://example.com/current',
    candidates,
    inputCapped: true,
  })

  assert.equal(result.candidates.length, CANONICAL_CHECKER_LIMITS.candidates)
  assert.ok(result.issues.length <= CANONICAL_CHECKER_LIMITS.issues)
  assert.equal(result.capped, true)
})
