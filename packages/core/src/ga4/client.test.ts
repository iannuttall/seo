import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Ga4ReportRequest, ga4RequestCanUseCache } from './client.js'

function request(startDate: string, endDate: string): Ga4ReportRequest {
  return {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'sessions' }],
  }
}

test('GA4 caches only absolute windows that cannot roll over', () => {
  assert.equal(ga4RequestCanUseCache(request('2026-06-01', '2026-06-28')), true)
  assert.equal(ga4RequestCanUseCache(request('28daysAgo', 'yesterday')), false)
  assert.equal(ga4RequestCanUseCache(request('today', 'today')), false)
  assert.equal(ga4RequestCanUseCache(request('2026-06-01', 'yesterday')), false)
})
