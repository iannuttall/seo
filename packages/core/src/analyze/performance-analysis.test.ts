import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fieldMetric,
  labMetric,
  parseCruxFieldData,
  performanceActions,
} from './performance-analysis.js'

test('field metrics use exact Core Web Vitals thresholds', () => {
  assert.equal(
    fieldMetric('LCP', { percentiles: { p75: 2_500 } })?.rating,
    'good',
  )
  assert.equal(
    fieldMetric('LCP', { percentiles: { p75: 4_000 } })?.rating,
    'needs-work',
  )
  assert.equal(
    fieldMetric('LCP', { percentiles: { p75: 4_001 } })?.rating,
    'poor',
  )
  assert.equal(
    fieldMetric('INP', { percentiles: { p75: '200' } })?.rating,
    'good',
  )
  assert.equal(
    fieldMetric('CLS', { percentiles: { p75: '0.25' } })?.rating,
    'needs-work',
  )
  assert.equal(fieldMetric('CLS', { percentiles: { p75: -1 } }), undefined)
})

test('lab metric ratings use the Lighthouse strategy-specific score', () => {
  assert.equal(
    labMetric({
      audit: { numericValue: 1_300, score: 0.4 },
      rating: () => 'good',
    })?.rating,
    'poor',
  )
})

test('CrUX parsing reports scope, form factor, dates, and incomplete metrics', () => {
  const fieldData = parseCruxFieldData({
    requestedFormFactor: 'PHONE',
    record: {
      key: { origin: 'https://example.com', formFactor: 'PHONE' },
      collectionPeriod: {
        firstDate: { year: 2026, month: 6, day: 1 },
        lastDate: { year: 2026, month: 6, day: 28 },
      },
      metrics: {
        largest_contentful_paint: { percentiles: { p75: 2_600 } },
        cumulative_layout_shift: { percentiles: { p75: 0.05 } },
      },
    },
  })

  assert.equal(fieldData.scope, 'origin')
  assert.equal(fieldData.formFactor, 'PHONE')
  assert.equal(fieldData.collectionPeriod?.lastDate, '2026-06-28')
  assert.equal(fieldData.assessment.status, 'incomplete')
  assert.deepEqual(fieldData.assessment.missingMetrics, ['INP'])
})

test('field evidence takes precedence over lab proxies in actions', () => {
  const fieldData = parseCruxFieldData({
    requestedFormFactor: 'PHONE',
    record: {
      key: { url: 'https://example.com/' },
      metrics: {
        largest_contentful_paint: { percentiles: { p75: 4_100 } },
        interaction_to_next_paint: { percentiles: { p75: 550 } },
        cumulative_layout_shift: { percentiles: { p75: 0.3 } },
      },
    },
  })
  const actions = performanceActions({
    fieldData,
    metrics: {
      largestContentfulPaint: { value: 1_000 },
      totalBlockingTime: { value: 10 },
      cumulativeLayoutShift: { value: 0.01 },
    },
  })

  assert.deepEqual(
    actions.map((action) => action.title),
    [
      'Improve the largest visible content',
      'Improve interaction responsiveness',
      'Reduce layout shifts',
    ],
  )
  assert.equal(
    actions.every((action) => action.plainEnglish.includes('CrUX')),
    true,
  )
})

test('non-2xx fallback evidence blocks performance conclusions', () => {
  const actions = performanceActions({
    fallbackEvidence: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/missing',
      httpStatus: 404,
      blocked: false,
      redirectCount: 1,
    },
    metrics: {
      fallbackFetchDuration: { value: 50, source: 'fetch-fallback' },
    },
  })

  assert.deepEqual(
    actions.map((action) => action.title),
    ['Fix the page response first'],
  )
})

test('material Lighthouse insights prevent a false all-clear action', () => {
  const actions = performanceActions({
    metrics: {
      largestContentfulPaint: {
        value: 1_000,
        rating: 'good',
        source: 'lighthouse-lab',
      },
    },
    labDataStatus: {
      provider: 'lighthouse',
      status: 'available',
      reason: 'test',
    },
    labInsights: [
      {
        id: 'render-blocking-insight',
        title: 'Render blocking requests',
        estimatedSavingsMs: 420,
        evidence: [],
      },
    ],
  })

  assert.deepEqual(
    actions.map((action) => action.title),
    ['Review Lighthouse insight: Render blocking requests'],
  )
})
