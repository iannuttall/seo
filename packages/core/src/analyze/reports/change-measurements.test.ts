import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../../errors.js'
import type { ChangeMeasurement, SeoChange } from '../experiments.js'
import {
  measureSavedChanges,
  narrativeDataStatus,
} from './change-measurements.js'

const changes: SeoChange[] = [
  {
    id: 'complete-change',
    site: 'sc-domain:example.com',
    scope: 'page',
    target: 'https://example.com/complete',
    title: 'Complete change',
    changedAt: '2026-05-01',
    createdAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'partial-change',
    site: 'sc-domain:example.com',
    scope: 'page',
    target: 'https://example.com/partial',
    title: 'Partial change',
    changedAt: '2026-05-02',
    createdAt: '2026-05-02T00:00:00.000Z',
  },
  {
    id: 'failed-change',
    site: 'sc-domain:example.com',
    scope: 'page',
    target: 'https://example.com/failed',
    title: 'Failed change',
    changedAt: '2026-05-03',
    createdAt: '2026-05-03T00:00:00.000Z',
  },
]

function measurement(
  change: SeoChange,
  dataStatus: ChangeMeasurement['dataStatus'],
): ChangeMeasurement {
  const sourceWindow = {
    calls: 1,
    rowsFetched: 7,
    returnedRows: 7,
    invalidRows: 0,
    duplicateRows: 0,
  }
  return {
    schemaVersion: 1,
    methodology: 'equal-finalized-calendar-windows-v1',
    dataStatus,
    change,
    window: {
      requestedDays: 7,
      effectiveDays: 7,
      afterWindowTruncated: dataStatus === 'partial',
      gscTimezone: 'America/Los_Angeles',
      availableDateWindow: {
        earliestDate: '2025-01-01',
        latestFinalDate: '2026-05-09',
      },
    },
    source: {
      searchAnalytics: {
        status: dataStatus,
        completeness: 'date-aggregates',
        dimensions: ['date'],
        searchType: 'web',
        dataState: 'final',
        before: sourceWindow,
        after: sourceWindow,
        warnings:
          dataStatus === 'partial'
            ? ['The after window was shorter than requested.']
            : [],
      },
    },
    before: {
      startDate: '2026-04-24',
      endDate: '2026-04-30',
      metrics: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
    },
    after: {
      startDate: '2026-05-01',
      endDate: '2026-05-07',
      metrics: { clicks: 12, impressions: 110, ctr: 0.109, position: 4.8 },
    },
    delta: {
      clicks: 2,
      clickPct: 20,
      impressions: 10,
      impressionPct: 10,
      ctr: 0.009,
      position: -0.2,
    },
    verdict: dataStatus === 'partial' ? 'not-enough-data' : 'positive',
    confidence: dataStatus === 'partial' ? 'low' : 'medium',
    note: 'Before and after comparison.',
    warnings:
      dataStatus === 'partial'
        ? ['The after window was shorter than requested.']
        : [],
    caveats: [],
  }
}

test('measureSavedChanges retains complete, partial, and failed attempts in saved order', async () => {
  const attempts = await measureSavedChanges(changes, {
    measure: async ({ id }) => {
      if (id === 'failed-change') {
        throw new SeoError('PROVIDER_UNAVAILABLE', 'Search Console timed out.')
      }
      const change = changes.find((item) => item.id === id)
      assert.ok(change)
      return measurement(
        change,
        id === 'partial-change' ? 'partial' : 'complete',
      )
    },
  })

  assert.deepEqual(
    attempts.map((attempt) => [
      attempt.change.id,
      attempt.status,
      attempt.dataStatus,
    ]),
    [
      ['complete-change', 'measured', 'complete'],
      ['partial-change', 'measured', 'partial'],
      ['failed-change', 'failed', 'unavailable'],
    ],
  )
  assert.deepEqual(attempts[2], {
    status: 'failed',
    dataStatus: 'unavailable',
    change: changes[2],
    error: {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Search Console timed out.',
      retryable: true,
    },
  })
  assert.equal(narrativeDataStatus('complete', attempts), 'partial')
  assert.equal(narrativeDataStatus('complete', []), 'complete')
  assert.equal(narrativeDataStatus('unavailable', attempts), 'unavailable')
})
