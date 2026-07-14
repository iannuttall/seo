import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDogfoodSummary } from './dogfood-summary.mjs'

function report(status = 'warning') {
  return {
    url: 'https://seoskill.dev/',
    summary: {
      passed: status === 'pass' ? 1 : 0,
      warnings: status === 'warning' ? 1 : 0,
      failed: 0,
      unknown: 0,
      information: 0,
      notApplicable: 3,
    },
    checks: [
      {
        id: 'markdown-coverage',
        status,
        title: 'Markdown coverage',
        action: 'Publish one Markdown alternative for every page.',
      },
    ],
    topActions:
      status === 'pass'
        ? []
        : [
            {
              id: 'markdown-coverage',
              status,
              title: 'Markdown coverage',
              action: 'Publish one Markdown alternative for every page.',
            },
          ],
  }
}

test('renders the current evidence without inventing a score', () => {
  const summary = renderDogfoodSummary(report())

  assert.match(summary, /published evidence, not a composite score/)
  assert.match(summary, /\| Needs review \| 1 \|/)
  assert.match(summary, /No previous audit artifact was available/)
  assert.match(summary, /Publish one Markdown alternative/)
})

test('reports deterministic status changes from the prior run', () => {
  const summary = renderDogfoodSummary(report('pass'), report('warning'))

  assert.match(summary, /`markdown-coverage`: warning to pass/)
  assert.match(summary, /No failed, warning, or unknown checks remain/)
})
