import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTerminalContext, visibleWidth } from './context.js'
import { renderSemanticReport } from './report.js'

const view = {
  title: 'Site crawl',
  target: 'https://example.com/',
  status: 'warning' as const,
  summary:
    'Two checks need review before this report can support an all-clear.',
  metrics: [
    { label: 'Passed', value: 8, status: 'pass' as const },
    { label: 'Review', value: 2, status: 'warning' as const },
  ],
  sections: [
    {
      title: 'Response health',
      diagnostics: [
        {
          status: 'warning' as const,
          title: 'Unknown URLs return a successful response',
          explanation:
            'Two known-nonexistent paths returned successful responses.',
          evidence: ['https://example.com/missing'],
          fix: 'Return 404 or 410 for missing URLs.',
        },
      ],
    },
  ],
}

test('semantic reports keep hierarchy and evidence at narrow widths', () => {
  const output = renderSemanticReport(
    view,
    createTerminalContext({ columns: 40, color: false, isTTY: false }),
  )
  assert.match(output, /^Site crawl\nhttps:\/\/example\.com\//u)
  assert.match(output, /WARN {2}Two checks need review/u)
  assert.match(output, /\[WARN\].*Unknown URLs/u)
  assert.match(
    output,
    /Evidence[\s\S]*https:\/\/example\.com\/[\s\n ]*missing/u,
  )
  assert.match(output, /Fix[\s\S]*Return 404 or 410/u)
  for (const line of output.split('\n')) {
    assert.ok(visibleWidth(line) <= 40, `${visibleWidth(line)} > 40: ${line}`)
  }
})

test('semantic reports honour color and NO_COLOR contexts', () => {
  const colored = renderSemanticReport(
    view,
    createTerminalContext({ columns: 80, color: true, isTTY: true }),
  )
  const plain = renderSemanticReport(
    view,
    createTerminalContext({
      columns: 80,
      env: { NO_COLOR: '1' },
      isTTY: true,
    }),
  )
  assert.ok(colored.includes('\u001b['))
  assert.ok(!plain.includes('\u001b['))
})
