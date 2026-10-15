import assert from 'node:assert/strict'
import { test } from 'node:test'
import { events } from './telemetry.ts'

test('events carry no site, URL or input values', () => {
  const sent = events({
    tool: 'seo_page',
    args: { url: 'https://example.com/secret' },
    userAgent: 'claude-code/2.0',
    failure: 'NO_ACCESS',
    now: new Date('2026-10-14T00:00:00Z'),
  })
  assert.deepEqual(
    sent.map((event) => event.event),
    ['audit_start', 'audit_failed'],
  )
  assert.equal(sent[1]?.failureReason, 'property_not_found')
  assert.equal(sent[1]?.agent, 'claude-code')
  assert.equal(sent[1]?.cohort, '2026-W42')
  assert.ok(!JSON.stringify(sent).includes('example.com'))
})
