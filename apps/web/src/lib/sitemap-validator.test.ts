import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SITEMAP_VALIDATOR_LIMITS,
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
