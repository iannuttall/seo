import assert from 'node:assert/strict'
import test from 'node:test'
import { stripVTControlCharacters } from 'node:util'
import {
  createTerminalContext,
  resolveTerminalColumns,
  visibleWidth,
} from './context.js'
import { renderCallout, renderKeyValues, renderTable } from './render.js'

test('terminal columns use explicit, stream, environment, then fallback values', () => {
  assert.equal(resolveTerminalColumns({ columns: 120 }), 120)
  assert.equal(resolveTerminalColumns({ streamColumns: 100 }), 100)
  assert.equal(resolveTerminalColumns({ env: { COLUMNS: '60' } }), 60)
  assert.equal(resolveTerminalColumns({ env: {} }), 80)
  assert.equal(resolveTerminalColumns({ columns: 10 }), 40)
  assert.equal(resolveTerminalColumns({ columns: 500 }), 200)
})

test('non-interactive and NO_COLOR contexts never emit ANSI', () => {
  const context = createTerminalContext({
    color: false,
    columns: 80,
    env: { NO_COLOR: '1' },
    isTTY: false,
  })
  const output = renderTable(
    ['Check', 'Status'],
    [['Config directory', 'pass']],
    context,
  )
  assert.equal(output.includes('\u001B'), false)
  assert.equal(
    createTerminalContext({ env: { NO_COLOR: '' }, isTTY: true }).hasColor,
    false,
  )
})

test('key values wrap without exceeding the terminal width', () => {
  for (const columns of [40, 60, 80, 120, 160]) {
    const context = createTerminalContext({ color: false, columns })
    const output = renderKeyValues(
      [
        [
          'Google credentials',
          'BYO client configured at /Users/example/.config/seo/client.json',
        ],
        ['Status', 'ok'],
      ],
      context,
    )
    for (const line of output.split('\n')) {
      assert.ok(
        visibleWidth(line) <= columns,
        `${visibleWidth(line)} > ${columns}: ${line}`,
      )
    }
  }
})

test('wide prose tables become readable stacked records', () => {
  const context = createTerminalContext({ color: false, columns: 80 })
  const output = renderTable(
    ['ID', 'Category', 'Name', 'Description'],
    [
      [
        'agent-readiness',
        'crawl',
        'AI agent readiness',
        'Check whether a content site gives agents clean, stable, machine-readable pages and discovery files.',
      ],
    ],
    context,
  )
  assert.match(output, /^ID\s+agent-readiness/m)
  assert.match(output, /^Description\s+Check whether/m)
  for (const line of output.split('\n')) {
    assert.ok(visibleWidth(line) <= 80, `${visibleWidth(line)} > 80: ${line}`)
  }
})

test('short scalar tables stay compact', () => {
  const context = createTerminalContext({ color: false, columns: 80 })
  const output = renderTable(
    ['Check', 'Status', 'Detail'],
    [
      ['Config directory', 'pass', '/Users/example/.config/seo'],
      ['OAuth file', 'pass', '/Users/example/.config/seo/oauth.json'],
    ],
    context,
  )
  assert.match(output, /^Check\s+Status\s+Detail/m)
  assert.equal(output.includes('01'), false)
  for (const line of output.split('\n')) {
    assert.ok(visibleWidth(line) <= 80, `${visibleWidth(line)} > 80: ${line}`)
  }
})

test('callouts are deterministic and width-bound', () => {
  const context = createTerminalContext({ color: false, columns: 60 })
  const first = renderCallout(
    {
      title: 'Useful?',
      body: 'A GitHub star helps other people find SEO Skill.',
      command: 'https://github.com/iannuttall/seo',
    },
    context,
  )
  const second = renderCallout(
    {
      title: 'Useful?',
      body: 'A GitHub star helps other people find SEO Skill.',
      command: 'https://github.com/iannuttall/seo',
    },
    context,
  )
  assert.equal(first, second)
  assert.equal(stripVTControlCharacters(first), first)
  for (const line of first.split('\n')) assert.ok(visibleWidth(line) <= 60)
})
