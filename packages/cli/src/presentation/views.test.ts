import assert from 'node:assert/strict'
import test from 'node:test'
import { createTerminalContext, visibleWidth } from './context.js'
import {
  checkSummary,
  renderCatalog,
  renderChecks,
  renderHeading,
} from './views.js'

test('check views show status, evidence, and a fix without relying on color', () => {
  const context = createTerminalContext({ color: false, columns: 60 })
  const checks = [
    {
      label: 'Config directory',
      status: 'pass' as const,
      detail: '/Users/example/.config/seo',
    },
    {
      label: 'Google login',
      status: 'fail' as const,
      detail: 'No Google token found.',
      fix: 'Run `seo auth login`, or configure a service account for CI.',
    },
  ]
  const output = renderChecks(checks, context)
  assert.match(output, /^PASS {2}Config directory/m)
  assert.match(output, /^FAIL {2}Google login/m)
  assert.match(output, /^ {6}Fix {2}Run `seo auth login`/m)
  assert.equal(checkSummary(checks), '1 check passed, 0 warnings, 1 failed.')
  for (const line of output.split('\n')) assert.ok(visibleWidth(line) <= 60)
})

test('catalog views stay scan-friendly at common terminal widths', () => {
  const items = [
    {
      category: 'crawl',
      id: 'agent-readiness',
      name: 'AI agent readiness',
    },
    {
      category: 'crawl',
      id: 'affected-urls',
      name: 'URLs affected by a crawl issue',
    },
    {
      category: 'reporting',
      id: 'monthly-action-plan',
      name: 'Monthly SEO action plan',
    },
  ]
  for (const columns of [40, 60, 80, 120, 160]) {
    const context = createTerminalContext({ color: false, columns })
    const output = renderCatalog(items, context, {
      noun: 'report',
      categoryLabels: { crawl: 'Crawl', reporting: 'Reporting' },
    })
    assert.match(output, /^3 reports across 2 categories\./)
    assert.match(output, /^Crawl \(2\)$/m)
    assert.match(output, /agent-readiness/)
    assert.match(output, /Monthly SEO action plan/)
    for (const line of output.split('\n')) {
      assert.ok(
        visibleWidth(line) <= columns,
        `${visibleWidth(line)} > ${columns}: ${line}`,
      )
    }
  }
})

test('headings keep their summary separate and width-bound', () => {
  const context = createTerminalContext({ color: false, columns: 40 })
  const output = renderHeading(
    'SEO doctor',
    context,
    'Every required local check passed.',
  )
  assert.equal(output, 'SEO doctor\nEvery required local check passed.')
})
