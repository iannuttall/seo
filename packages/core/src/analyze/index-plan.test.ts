import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planIndexCoverageFromUrls } from './monitoring/index-plan.js'

function urls(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}/`)
}

test('planIndexCoverageFromUrls suggests folder properties for large buckets', () => {
  const report = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: [
      ...urls('https://example.com/cities/city-', 2000),
      ...urls('https://example.com/blog/post-', 2000),
    ],
    accountProperties: ['sc-domain:example.com'],
    dailyLimit: 2000,
    targetCycleDays: 1,
  })

  assert.equal(report.summary.urlCount, 4000)
  assert.equal(report.properties[0]?.property, 'sc-domain:example.com')
  assert.equal(report.properties[0]?.cycleDays, 2)
  assert.equal(report.suggestions.length, 2)
  assert.equal(report.suggestions[0]?.property, 'https://example.com/cities/')
  assert.match(report.suggestions[0]?.reason ?? '', /separate daily inspection/)
})

test('planIndexCoverageFromUrls maps URLs to existing URL-prefix properties', () => {
  const report = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: [
      ...urls('https://example.com/cities/city-', 2000),
      ...urls('https://example.com/blog/post-', 2000),
    ],
    accountProperties: ['sc-domain:example.com', 'https://example.com/cities/'],
    dailyLimit: 2000,
    targetCycleDays: 1,
  })

  assert.equal(report.summary.properties, 2)
  assert.equal(
    report.properties.find(
      (property) => property.property === 'https://example.com/cities/',
    )?.cycleDays,
    1,
  )
  assert.equal(
    report.suggestions.some(
      (suggestion) => suggestion.property === 'https://example.com/cities/',
    ),
    false,
  )
})
