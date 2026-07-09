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
          decay: { summary: { rows: 0 } },
          cannibalization: { items: [] },
          quickWins: { summary: { rows: 0 } },
          strikingDistance: { summary: { opportunities: 0 } },
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
})
