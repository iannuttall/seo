import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LinkRecoverReport } from './monitoring/link-recover.js'
import {
  getRepeatedLinkRecoverUrls,
  insertLinkRecoverRun,
  latestLinkRecoverSummary,
} from './monitoring/link-recover-store.js'

function report(site: string, url: string): LinkRecoverReport {
  return {
    site,
    generatedAt: new Date().toISOString(),
    range: {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      days: 31,
    },
    summary: {
      checked: 1,
      recoverable: 1,
      high: 1,
      medium: 0,
      low: 0,
      clicksAtRisk: 10,
      impressionsAtRisk: 500,
    },
    items: [
      {
        url,
        finalUrl: url,
        clicks: 10,
        impressions: 500,
        position: 4,
        issue: 'final-4xx',
        issues: ['final-4xx'],
        severity: 'high',
        trace: {
          summary: {
            hops: 0,
            finalStatus: 404,
            finalIndexable: false,
            issues: ['final-4xx'],
          },
          chain: [],
          warnings: [],
        },
        recommendation: {
          principle: 'Search-value URLs should not resolve to dead pages.',
          evidenceRef: url,
          action: 'Add a 301 redirect.',
          effort: 'S',
          confidence: 'high',
        },
      },
    ],
    warnings: [],
  }
}

test('link recovery store tracks repeated URLs across runs', () => {
  const site = `sc-domain:store-${Date.now()}.example`
  const url = `https://${site.slice('sc-domain:'.length)}/old/`

  insertLinkRecoverRun(report(site, url))
  insertLinkRecoverRun(report(site, url))

  const repeated = getRepeatedLinkRecoverUrls(site)
  const latest = latestLinkRecoverSummary(site)

  assert.equal(repeated[0]?.url, url)
  assert.equal(repeated[0]?.seenCount, 2)
  assert.equal(latest?.repeatedUrls, 1)
  assert.equal(latest?.repeatedTopUrl, url)
})
