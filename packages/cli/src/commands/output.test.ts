import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTerminalContext, visibleWidth } from '../presentation/context.js'
import { renderSemanticReport } from '../presentation/report.js'
import { actionDetailsView, reportSummaryView } from './output.js'

test('report summaries preserve target, status, and metrics', () => {
  const view = reportSummaryView({
    title: 'Page audit',
    target: 'https://example.com/long/path',
    status: 'warning',
    summary: 'One issue needs review.',
    metrics: [{ label: 'Issues', value: 1, status: 'warning' }],
  })

  assert.equal(view.target, 'https://example.com/long/path')
  assert.equal(view.status, 'warning')
  assert.deepEqual(view.metrics, [
    { label: 'Issues', value: 1, status: 'warning' },
  ])
})

test('action details use wrapped semantic diagnostics', () => {
  const view = actionDetailsView('Top actions', [
    {
      label: 'Fix the canonical',
      context: 'The observed canonical points to another URL.',
      action:
        'Set the canonical to the preferred indexable URL and fetch the page again.',
    },
  ])
  assert.ok(view)

  const output = renderSemanticReport(
    view,
    createTerminalContext({ columns: 44, color: false, isTTY: false }),
  )
  assert.match(output, /\[INFO\].*Fix the canonical/u)
  assert.match(output, /Evidence|observed canonical/u)
  assert.match(output, /Fix[\s\S]*preferred indexable URL/u)
  for (const line of output.split('\n')) {
    assert.ok(visibleWidth(line) <= 44, `${visibleWidth(line)} > 44: ${line}`)
  }
})

test('action details skip empty action sets', () => {
  assert.equal(actionDetailsView('Top actions', []), undefined)
})
