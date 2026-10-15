import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldMetric, parseCruxFieldData } from './performance-analysis.js'

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
