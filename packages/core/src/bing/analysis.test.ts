import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeBingCrawl,
  analyzeBingDimensions,
  analyzeBingTraffic,
} from './analysis.js'
import type { BingDimensionRow, BingTrafficRow } from './client.js'

test('Bing traffic analysis compares complete calendar periods', () => {
  const rows: BingTrafficRow[] = []
  const start = Date.parse('2026-05-01T00:00:00Z')
  for (let day = 0; day < 56; day += 1) {
    rows.push({
      date: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
      clicks: day < 28 ? 10 : 15,
      impressions: 100,
    })
  }
  const result = analyzeBingTraffic(rows)
  assert.equal(result?.previous.clicks, 280)
  assert.equal(result?.current.clicks, 420)
  assert.equal(result?.changes.clicksPercent, 50)
  assert.equal(result?.changes.ctrPercentagePoints, 5)
  assert.equal(result?.current.missingDays, 0)
})

test('Bing crawl analysis compares the latest snapshot with the prior boundary', () => {
  const result = analyzeBingCrawl([
    { date: '2026-06-01', crawlErrors: 5, code4xx: 3 },
    { date: '2026-06-29', crawlErrors: 25, code4xx: 13 },
  ])
  assert.equal(result?.previous?.date, '2026-06-01')
  assert.deepEqual(result?.changes.crawlErrors, {
    previous: 5,
    current: 25,
    absolute: 20,
    percent: 400,
  })
})

function weeklyRow(
  date: string,
  value: string,
  clicks: number,
  impressions: number,
  position: number,
): BingDimensionRow {
  return {
    date,
    value,
    clicks,
    impressions,
    avgImpressionPosition: position,
  }
}

test('Bing dimension analysis compares matched entries without treating missing rows as zero', () => {
  const dates = [
    '2026-07-17',
    '2026-07-10',
    '2026-07-03',
    '2026-06-26',
    '2026-06-19',
    '2026-06-12',
    '2026-06-05',
    '2026-05-29',
  ]
  const rows = dates.flatMap((date, index) => [
    weeklyRow(date, 'matched', index < 4 ? 10 : 5, 100, 8),
    weeklyRow(date, index < 4 ? 'current only' : 'previous only', 1, 50, 12),
  ])
  const result = analyzeBingDimensions(rows.reverse(), 'query')
  assert.equal(result.coverage.matchedDimensions, 1)
  assert.equal(result.coverage.comparableDimensions, 1)
  assert.equal(result.coverage.currentOnlyDimensions, 1)
  assert.equal(result.coverage.previousOnlyDimensions, 1)
  assert.equal(result.movements.length, 1)
  assert.equal(result.movements[0]?.value, 'matched')
  assert.equal(result.movements[0]?.changes.clicks, 20)
  assert.deepEqual(
    result.opportunities.map((row) => row.value),
    ['matched', 'current only'],
  )
})

test('Bing dimension movements exclude entries missing from any weekly top list', () => {
  const rows = [
    weeklyRow('2026-07-17', 'sparse', 10, 100, 8),
    weeklyRow('2026-07-17', 'stable', 10, 100, 8),
    weeklyRow('2026-07-10', 'stable', 10, 100, 8),
    weeklyRow('2026-07-03', 'stable', 10, 100, 8),
    weeklyRow('2026-06-26', 'stable', 10, 100, 8),
    weeklyRow('2026-06-19', 'stable', 10, 100, 8),
    weeklyRow('2026-06-12', 'stable', 5, 100, 8),
    weeklyRow('2026-06-05', 'stable', 5, 100, 8),
    weeklyRow('2026-05-29', 'stable', 5, 100, 8),
    weeklyRow('2026-06-12', 'sparse', 20, 100, 8),
  ]
  const result = analyzeBingDimensions(rows, 'query')
  assert.equal(result.coverage.matchedDimensions, 2)
  assert.equal(result.coverage.comparableDimensions, 1)
  assert.equal(result.coverage.incompleteMatchedDimensions, 1)
  assert.deepEqual(
    result.movements.map((movement) => movement.value),
    ['stable'],
  )
})

test('Bing dimension analysis is deterministic and output bounded', () => {
  const rows: BingDimensionRow[] = []
  for (let week = 0; week < 8; week += 1) {
    const date = new Date(
      Date.parse('2026-07-17T00:00:00Z') - week * 7 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10)
    for (let value = 24; value >= 0; value -= 1) {
      rows.push(
        weeklyRow(date, `query ${String(value).padStart(2, '0')}`, 2, 30, 7),
      )
    }
  }
  const result = analyzeBingDimensions(rows, 'query')
  assert.equal(result.movements.length, 10)
  assert.equal(result.opportunities.length, 10)
  assert.equal(result.movements[0]?.value, 'query 00')
  assert.equal(JSON.stringify(result).length < 25_000, true)
})
