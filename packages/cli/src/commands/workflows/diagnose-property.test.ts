import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportFollowups } from './diagnose-property.js'

function reportFixture(): Parameters<typeof reportFollowups>[0] {
  return {
    site: 'sc-domain:example.com',
    output: {
      narrative: {
        diagnosis: {
          skippedSections: [],
          decay: { rangeDays: 90, summary: { eligibleRows: 0 } },
          cannibalization: { items: [] },
          quickWins: { summary: { eligibleRows: 0 } },
          strikingDistance: { summary: { eligibleRows: 0 } },
          segments: { page: { items: [] } },
        },
      },
    },
  } as unknown as Parameters<typeof reportFollowups>[0]
}

test('report follow-ups preserve the selected project profile', () => {
  const followups = reportFollowups(reportFixture(), {
    projectId: 'client project',
  })

  assert.ok(followups.length > 0)
  assert.ok(
    followups.every((item) =>
      item.command.includes("--project 'client project'"),
    ),
  )
  assert.ok(followups.every((item) => !item.command.includes('--site')))
})

test('report follow-ups use the site without a project profile', () => {
  const followups = reportFollowups(reportFixture())

  assert.ok(followups.length > 0)
  assert.ok(
    followups.every((item) =>
      item.command.includes('--site sc-domain:example.com'),
    ),
  )
  assert.ok(followups.every((item) => !item.command.includes('--project')))
  assert.match(followups[0]?.command ?? '', /--days 90/)
})

test('report follow-ups do not request a crawl that just ran', () => {
  const followups = reportFollowups(reportFixture(), {
    crawlStartUrl: 'https://example.com/',
    technicalBaselineStatus: 'created',
  })

  assert.ok(
    followups.every((item) => !item.command.startsWith('seo crawl --url')),
  )
})

test('technical-only report follow-ups do not require a Search Console property', () => {
  const followups = reportFollowups(reportFixture(), {
    crawlStartUrl: 'https://example.com/',
    technicalBaselineStatus: 'created',
    searchDataAvailable: false,
  })

  assert.deepEqual(
    followups.map((item) => item.command),
    ['seo audit-page --url https://example.com/', 'seo start'],
  )
})

test('technical-only report asks for a crawl before a page follow-up', () => {
  const followups = reportFollowups(reportFixture(), {
    crawlStartUrl: 'https://example.com/',
    technicalBaselineStatus: 'skipped',
    searchDataAvailable: false,
  })

  assert.deepEqual(
    followups.map((item) => item.command),
    [
      'seo crawl --url https://example.com/ --health',
      'seo crawl --url https://example.com/ --save',
      'seo start',
    ],
  )
})
