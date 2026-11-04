import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { lintText } from './index.js'
import type { LintFormat, LintPreset } from './types.js'

// The labelled corpus: each tell must fire one of its expected rules (or
// review lenses, when review is true), and no human control may get an
// error. Guards recall and false positives together, so tuning one rule
// cannot quietly break the other side.

type Case = {
  id: string
  text: string
  expect: string[] | null
  review?: boolean
  format?: LintFormat
  preset?: LintPreset
}

const { cases } = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/lint/cases.json', import.meta.url),
    'utf8',
  ),
) as { cases: Case[] }

test('every tell in the corpus is caught by its expected rule', () => {
  const missed: string[] = []
  for (const item of cases.filter((entry) => entry.expect)) {
    const result = lintText(item.text, {
      format: item.format ?? 'md',
      preset: item.preset,
    })
    const fired = new Set([
      ...result.findings.map((finding) => finding.rule),
      ...(item.review ? result.review.map((entry) => entry.lens) : []),
    ])
    if (!item.expect?.some((rule) => fired.has(rule))) {
      missed.push(`${item.id}: ${item.text} (got ${[...fired].join(', ')})`)
    }
  }
  assert.ok(cases.filter((entry) => entry.expect).length >= 150)
  assert.deepEqual(missed, [])
})

test('no human control in the corpus gets an error', () => {
  const flagged: string[] = []
  for (const item of cases.filter((entry) => !entry.expect)) {
    const result = lintText(item.text, {
      format: item.format ?? 'md',
      preset: item.preset,
    })
    for (const finding of result.findings) {
      if (finding.level === 'error') {
        flagged.push(`${item.id}: ${finding.rule} "${finding.excerpt}"`)
      }
    }
  }
  assert.ok(cases.filter((entry) => !entry.expect).length >= 150)
  assert.deepEqual(flagged, [])
})

test('findings point at the source line and column through markup', () => {
  const source = [
    '---',
    'title: Grow a dictation app with search traffic',
    '---',
    '',
    'import { Chart } from "./chart"',
    '',
    '<Chart',
    '  caption="Same essay, two titles. The second one ranks."',
    '/>',
    '',
    'Run `seo lint` first. The fix is in the template, not in 600 posts.',
  ].join('\n')
  const result = lintText(source, { format: 'mdx' })
  const at = (rule: string) =>
    result.findings
      .filter((finding) => finding.rule === rule)
      .map((finding) => [finding.line, finding.column, finding.excerpt])
  assert.deepEqual(at('pithy-fragment'), [[8, 12, 'Same essay, two titles.']])
  assert.deepEqual(at('contrast-reframe'), [
    [11, 23, 'The fix is in the template, not in 600 posts.'],
  ])
})
