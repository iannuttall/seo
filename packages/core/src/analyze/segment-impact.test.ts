import assert from 'node:assert/strict'
import test from 'node:test'
import { compareSegmentRows } from './segment-impact.js'

test('compareSegmentRows ranks segments by absolute click movement', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before: { startDate: '2026-04-01', endDate: '2026-04-28' },
    after: { startDate: '2026-04-29', endDate: '2026-05-26' },
    beforeRows: [
      {
        keys: ['/a'],
        clicks: 100,
        impressions: 1000,
        ctr: 0.1,
        position: 4,
      },
      {
        keys: ['/b'],
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 7,
      },
    ],
    afterRows: [
      {
        keys: ['/a'],
        clicks: 20,
        impressions: 800,
        ctr: 0.025,
        position: 8,
      },
      {
        keys: ['/b'],
        clicks: 35,
        impressions: 200,
        ctr: 0.175,
        position: 5,
      },
    ],
  })

  assert.equal(report.items[0]?.key, '/a')
  assert.equal(report.items[0]?.clickDelta, -80)
  assert.equal(report.items[1]?.key, '/b')
  assert.equal(report.items[1]?.clickDelta, 25)
})
