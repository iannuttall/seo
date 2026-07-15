import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyticsDelta,
  googleAnalyticsLandingPageFilterForChange,
  summarizeGoogleAnalyticsRows,
} from './analytics.js'

test('googleAnalyticsLandingPageFilterForChange maps page URLs to Google Analytics paths', () => {
  const filter = googleAnalyticsLandingPageFilterForChange({
    id: 'change',
    site: 'sc-domain:example.com',
    scope: 'page',
    target: 'https://example.com/posts/test?x=1',
    title: 'Title test',
    changedAt: '2026-06-01',
    createdAt: '2026-06-01T00:00:00.000Z',
  })

  assert.deepEqual(filter, {
    filter: {
      fieldName: 'landingPagePlusQueryString',
      stringFilter: {
        matchType: 'EXACT',
        value: '/posts/test?x=1',
        caseSensitive: false,
      },
    },
  })
})

test('googleAnalyticsLandingPageFilterForChange supports page content groups', () => {
  const filter = googleAnalyticsLandingPageFilterForChange(
    {
      id: 'change',
      site: 'sc-domain:example.com',
      scope: 'group',
      target: 'group-1',
      title: 'Group test',
      changedAt: '2026-06-01',
      createdAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'group-1',
      site: 'sc-domain:example.com',
      name: 'Blog',
      dimension: 'page',
      matchType: 'contains',
      pattern: '/blog/',
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  )

  assert.equal(
    (filter as { filter?: { stringFilter?: { value?: string } } }).filter
      ?.stringFilter?.value,
    '/blog/',
  )
})

test('summarizeGoogleAnalyticsRows and analyticsDelta aggregate test metrics', () => {
  const before = summarizeGoogleAnalyticsRows([
    {
      sessions: '10',
      engagedSessions: '6',
      conversions: '1',
      totalRevenue: '20',
    },
  ])
  const after = summarizeGoogleAnalyticsRows([
    {
      sessions: '15',
      engagedSessions: '9',
      conversions: '3',
      totalRevenue: '50',
    },
  ])

  assert.deepEqual(before, {
    sessions: 10,
    engagedSessions: 6,
    conversions: 1,
    totalRevenue: 20,
  })
  assert.deepEqual(analyticsDelta({ before, after }), {
    sessions: 5,
    sessionPct: 50,
    engagedSessions: 3,
    engagedSessionPct: 50,
    conversions: 2,
    conversionPct: 200,
    totalRevenue: 30,
    revenuePct: 150,
  })
})
