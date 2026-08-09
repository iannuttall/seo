import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SITEMAP_VALIDATOR_LIMITS,
  validateSitemapByteStream,
  validateSitemapText,
} from './sitemap-validator.ts'

const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'

test('validates a complete URL sitemap without inventing findings', async () => {
  const report =
    await validateSitemapText(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${namespace}">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-08-09</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <image:image xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
      <image:loc>https://example.com/image.jpg</image:loc>
    </image:image>
  </url>
</urlset>`)

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.valid, true)
  assert.equal(report.document.kind, 'urlset')
  assert.equal(report.document.entries, 1)
  assert.equal(report.document.validLocations, 1)
  assert.equal(report.document.lastModifiedValues, 1)
  assert.equal(report.document.changeFrequencyValues, 1)
  assert.equal(report.document.priorityValues, 1)
  assert.deepEqual(report.issues, [])
})

test('retains exact structural and entry findings with line and entry context', async () => {
  const report = await validateSitemapText(`<urlset>
  <url><lastmod>2026-02-30</lastmod></url>
  <url>
    <loc>not a URL</loc>
    <loc>https://example.com/duplicate-field</loc>
    <changefreq>sometimes</changefreq>
    <priority>2</priority>
  </url>
</urlset>`)

  assert.equal(report.valid, false)
  assert.equal(report.dataStatus, 'complete')
  assert.deepEqual(
    report.issues.map((issue) => issue.code),
    [
      'invalid-namespace',
      'missing-location',
      'invalid-lastmod',
      'duplicate-loc',
      'invalid-location',
      'invalid-changefreq',
      'invalid-priority',
    ],
  )
  assert.equal(
    report.issues.every((issue) => issue.line !== undefined),
    true,
  )
  assert.equal(
    report.issues.find((issue) => issue.code === 'invalid-priority')?.entry,
    2,
  )
})

test('validates sitemap indexes and reports repeated child locations', async () => {
  const report = await validateSitemapText(`<sitemapindex xmlns="${namespace}">
  <sitemap><loc>https://example.com/posts.xml</loc></sitemap>
  <sitemap><loc>https://example.com/posts.xml#fragment</loc></sitemap>
</sitemapindex>`)

  assert.equal(report.document.kind, 'sitemapindex')
  assert.equal(report.document.entries, 2)
  assert.equal(report.document.duplicateLocations, 1)
  assert.deepEqual(report.document.childSitemaps, {
    total: 1,
    retained: ['https://example.com/posts.xml'],
    omitted: 0,
  })
  assert.equal(report.issueStats.warnings, 1)
  assert.equal(report.issues[0]?.code, 'duplicate-location')
})

test('bounds retained child sitemap links without losing the index total', async () => {
  const entries = Array.from(
    { length: SITEMAP_VALIDATOR_LIMITS.childSitemaps + 2 },
    (_, index) =>
      `<sitemap><loc>https://example.com/sitemap-${index}.xml</loc></sitemap>`,
  ).join('')
  const report = await validateSitemapText(
    `<sitemapindex xmlns="${namespace}">${entries}</sitemapindex>`,
  )

  assert.equal(
    report.document.childSitemaps.total,
    SITEMAP_VALIDATOR_LIMITS.childSitemaps + 2,
  )
  assert.equal(
    report.document.childSitemaps.retained.length,
    SITEMAP_VALIDATOR_LIMITS.childSitemaps,
  )
  assert.equal(report.document.childSitemaps.omitted, 2)
})

test('rejects locations from more than one hostname', async () => {
  const report = await validateSitemapText(`<urlset xmlns="${namespace}">
  <url><loc>https://example.com/one</loc></url>
  <url><loc>https://www.example.com/two</loc></url>
  <url><loc>https://example.org/three</loc></url>
</urlset>`)

  assert.equal(report.valid, false)
  assert.equal(report.document.singleHost, false)
  assert.equal(report.document.locationHostMismatches, 2)
  const finding = report.issues.find(
    (issue) => issue.code === 'multiple-location-hosts',
  )
  assert.equal(finding?.severity, 'error')
  assert.match(finding?.message ?? '', /one hostname only/u)
  assert.equal(finding?.entry, 2)
})

test('keeps remote origin and sitemap index directory scope as qualified advice', async () => {
  const report = await validateSitemapText(
    `<sitemapindex xmlns="${namespace}">
  <sitemap><loc>http://example.com/public/insecure.xml</loc></sitemap>
  <sitemap><loc>https://example.com/above.xml</loc></sitemap>
  <sitemap><loc>https://example.com/public/child.xml</loc></sitemap>
</sitemapindex>`,
    {
      kind: 'url',
      requestedUrl: 'https://example.com/public/index.xml',
      finalUrl: 'https://example.com/public/index.xml',
    },
  )

  assert.equal(report.valid, true)
  assert.equal(report.document.singleHost, true)
  assert.equal(report.document.sourceOriginMismatches, 1)
  assert.equal(report.document.indexDirectoryScopeMismatches, 1)
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ['source-origin-mismatch', 'advice'],
      ['sitemap-index-directory-scope', 'advice'],
    ],
  )
  assert.match(report.issues[0]?.message ?? '', /cannot observe/u)
  assert.match(report.issues[1]?.message ?? '', /cannot observe/u)
})

test('reports future last modified values as dated advice', async () => {
  const report = await validateSitemapText(`<urlset xmlns="${namespace}">
  <url><loc>https://example.com/</loc><lastmod>9999-01-01</lastmod></url>
</urlset>`)

  assert.equal(report.valid, true)
  assert.equal(report.document.futureLastModifiedValues, 1)
  const finding = report.issues.find((issue) => issue.code === 'future-lastmod')
  assert.equal(finding?.severity, 'advice')
  assert.match(finding?.message ?? '', new RegExp(report.analysisDate, 'u'))
})

test('keeps the 10,000 entry threshold as neutral advice', async () => {
  const entries = Array.from(
    { length: SITEMAP_VALIDATOR_LIMITS.recommendedUrls + 1 },
    (_, index) => `<url><loc>https://example.com/${index}</loc></url>`,
  ).join('')
  const report = await validateSitemapText(
    `<urlset xmlns="${namespace}">${entries}</urlset>`,
  )

  assert.equal(report.valid, true)
  assert.equal(report.document.overRecommendedSize, true)
  assert.equal(report.document.overProtocolUrlLimit, false)
  const advice = report.issues.find(
    (issue) => issue.code === 'large-sitemap-advice',
  )
  assert.equal(advice?.severity, 'advice')
  assert.match(advice?.message ?? '', /working convention/u)
  assert.match(
    advice?.message ?? '',
    /not a search engine requirement or ranking factor/u,
  )
})

test('marks malformed XML and capped issue inventories as partial', async () => {
  const duplicateEntries = Array.from(
    { length: SITEMAP_VALIDATOR_LIMITS.issues + 5 },
    () => '<url><loc>https://example.com/repeated</loc></url>',
  ).join('')
  const capped = await validateSitemapText(
    `<urlset xmlns="${namespace}">${duplicateEntries}</urlset>`,
  )
  assert.equal(capped.dataStatus, 'partial')
  assert.equal(capped.truncation.issueLimitExceeded, true)
  assert.equal(capped.issues.length, SITEMAP_VALIDATOR_LIMITS.issues)
  assert.ok(capped.issueStats.omitted > 0)

  const malformed = await validateSitemapText(
    `<urlset xmlns="${namespace}"><url><loc>https://example.com/</url></urlset>`,
  )
  assert.equal(malformed.dataStatus, 'partial')
  assert.equal(malformed.valid, false)
  assert.equal(
    malformed.issues.some((issue) => issue.code === 'invalid-xml'),
    true,
  )
})

test('decompresses gzip input and retains byte provenance', async () => {
  const content = `<urlset xmlns="${namespace}"><url><loc>https://example.com/</loc></url></urlset>`
  const compressed = await new Response(
    new Blob([content]).stream().pipeThrough(new CompressionStream('gzip')),
  ).bytes()
  const report = await validateSitemapByteStream({
    body: new Blob([compressed]).stream(),
    source: { kind: 'file', name: 'sitemap.xml.gz' },
  })

  assert.equal(report.valid, true)
  assert.equal(report.source.gzip, true)
  assert.equal(report.source.compressedBytes, compressed.byteLength)
  assert.equal(report.source.expandedBytes, Buffer.byteLength(content))
})

test('rejects non-UTF-8 declarations and invalid UTF-8 input', async () => {
  const declared = await validateSitemapText(
    `<?xml version="1.0" encoding="ISO-8859-1"?><urlset xmlns="${namespace}"></urlset>`,
  )
  assert.equal(declared.dataStatus, 'complete')
  assert.equal(declared.valid, false)
  assert.equal(declared.issues[0]?.code, 'invalid-encoding-declaration')

  const invalidBytes = new Uint8Array([
    ...new TextEncoder().encode(`<urlset xmlns="${namespace}">`),
    0xc3,
    0x28,
    ...new TextEncoder().encode('</urlset>'),
  ])
  const invalid = await validateSitemapByteStream({
    body: new Blob([invalidBytes]).stream(),
    source: { kind: 'file', name: 'invalid.xml' },
  })
  assert.equal(invalid.dataStatus, 'partial')
  assert.equal(invalid.valid, false)
  assert.equal(
    invalid.issues.some((issue) => issue.code === 'invalid-encoding'),
    true,
  )
})

test('reports empty optional fields instead of silently accepting them', async () => {
  const report = await validateSitemapText(`<urlset xmlns="${namespace}">
  <url>
    <loc>https://example.com/</loc>
    <lastmod></lastmod>
    <changefreq></changefreq>
    <priority></priority>
  </url>
</urlset>`)

  assert.deepEqual(
    report.issues.map((issue) => issue.code),
    ['invalid-lastmod', 'invalid-changefreq', 'invalid-priority'],
  )
})

test('rejects a sitemap root with no entries', async () => {
  const report = await validateSitemapText(
    `<urlset xmlns="${namespace}"></urlset>`,
  )

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.valid, false)
  assert.equal(report.issues[0]?.code, 'empty-sitemap')
})
