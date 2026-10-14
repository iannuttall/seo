import assert from 'node:assert/strict'
import { test } from 'node:test'
import { events, isoWeek, reportFor } from './telemetry.ts'

test('tool calls count as the CLI report ids', () => {
  assert.equal(reportFor('seo_report', {}), 'search-performance-overview')
  assert.equal(
    reportFor('seo_report', { section: 'low-ctr' }),
    'ctr-underperformers',
  )
  assert.equal(reportFor('seo_research', { action: 'serp' }), 'serp-results')
  assert.equal(reportFor('seo_sites', {}), null)
  assert.equal(reportFor('seo_data', {}), null)
})

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

test('iso weeks match the CLI cohort format', () => {
  assert.equal(isoWeek(new Date('2026-01-01T12:00:00Z')), '2026-W01')
  assert.equal(isoWeek(new Date('2027-01-01T12:00:00Z')), '2026-W53')
})
