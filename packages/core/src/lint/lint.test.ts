import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runLint } from '../commands/lint.js'
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

test('a file too big to read is counted, so the totals never read as clean', async () => {
  const result = await runLint({ paths: ['big.html', 'post.md'] }, async () => [
    { path: 'big.html', skipped: 'It has 540,000 characters.' },
    { path: 'post.md', text: 'Notes on example.com and its sitemap.' },
  ])
  const data = result.data as Record<string, unknown>
  assert.deepEqual(
    [data.errors, data.warnings, data.checked, data.skipped],
    [0, 0, 1, 1],
  )
  assert.match(result.text, /1 not checked/)
  assert.match(result.text, /Not an all-clear/)
})

// Text checked with the meta preset was read as Markdown, so even a
// "title:" line got no length check, and the width Google cuts by was
// missing.
test('the meta preset checks each labelled line of text, with its width', async () => {
  const title =
    'The complete beginner guide to checking backlinks with free tools in 2026'
  const out = await runLint({
    text: `title: ${title}\n${title}`,
    preset: 'meta',
    metaKind: 'title',
  })
  const findings = (
    out.data as {
      files: { findings: { rule: string; line: number; message: string }[] }[]
    }
  ).files[0]?.findings.filter((finding) => finding.rule === 'title-length')
  assert.deepEqual(
    findings?.map(({ line, message }) => ({ line, message })),
    [1, 2].map((line) => ({
      line,
      message:
        'The title is 73 characters, about 654 pixels wide. Aim for 30 to 60 characters; Google shows about 600 pixels of a title on desktop.',
    })),
  )
})
