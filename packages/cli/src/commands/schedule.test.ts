import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankTrackingCronLine } from './schedule.js'

test('rank tracking cron uses the existing report runner with bounded local params', () => {
  const line = rankTrackingCronLine({
    projectId: 'project-1',
    set: 'local priorities',
    targetDomain: 'example.test',
    tag: 'service',
    devices: ['desktop', 'mobile'],
    depth: 50,
    keywordLimit: 100,
    provider: 'dataforseo',
    cadence: 'weekly',
    hour: 9,
    minute: 15,
    weekday: 2,
    day: 1,
  })
  assert.equal(line.name, 'rank-tracking')
  assert.equal(line.cron, '15 9 * * *')
  assert.match(line.command, /^seo reports run rank-tracking /u)
  assert.match(line.command, /collectionMethod/u)
  assert.match(line.command, /queued/u)
  assert.match(line.command, /--json$/u)
})

test('rank tracking cron rejects mixed or unbounded schedule input', () => {
  const base = {
    projectId: 'project-1',
    set: 'priority',
    targetDomain: 'example.test',
    hour: 9,
    minute: 0,
    weekday: 1,
    day: 1,
  }
  assert.throws(
    () => rankTrackingCronLine({ ...base, cadence: 'manual' }),
    /daily, weekly, or monthly/u,
  )
  assert.throws(
    () => rankTrackingCronLine({ ...base, devices: ['tablet'] }),
    /desktop, mobile/u,
  )
  assert.throws(
    () => rankTrackingCronLine({ ...base, keywordLimit: 1_001 }),
    /1 to 1000/u,
  )
})
