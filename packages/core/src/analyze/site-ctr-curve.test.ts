import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import { analyzeCtrUnderperformersFromRows } from './ctr-underperformers-analysis.js'
import { analyzeQuickWinsFromRows } from './site-diagnostics/quick-wins-analysis.js'

function row(
  query: string,
  url: string,
  clicks: number,
  impressions: number,
  position: number,
): GscRow {
  return {
    keys: [query, url],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position,
  }
}

function siteRows(): GscRow[] {
  const rows: GscRow[] = []
  for (const position of [1, 2, 3, 5, 8]) {
    for (let index = 0; index < 6; index++) {
      rows.push(
        row(
          `peer topic ${position} ${index}`,
          `https://example.com/p${position}-${index}`,
          Math.round(1000 * (0.3 / position) * (1 + index / 10)),
          1000,
          position,
        ),
      )
    }
  }
  rows.push(
    row('top result guide', 'https://example.com/top', 5, 4000, 1.4),
    row('top result guide', 'https://example.com/top#faq', 1, 1000, 1.8),
    row('near top guide', 'https://example.com/near', 2, 5000, 7.8),
  )
  return rows
}

test('quick-wins and ctr-underperformers share one curve and split page one', () => {
  const rows = siteRows()
  const site = 'sc-domain:example.com'
  const quickWins = analyzeQuickWinsFromRows({ rows, site })
  const lowCtr = analyzeCtrUnderperformersFromRows({ rows, site })

  assert.deepEqual(quickWins.benchmarkByPosition, lowCtr.benchmarkByPosition)
  assert.equal(
    quickWins.selection.benchmarkRows,
    lowCtr.selection.benchmarkRows,
  )
  assert.ok(quickWins.items.every((item) => item.position >= 4))
  assert.ok(lowCtr.items.every((item) => item.position < 4))

  const quickKeys = new Set(quickWins.items.map((i) => `${i.query} ${i.url}`))
  assert.ok(lowCtr.items.every((i) => !quickKeys.has(`${i.query} ${i.url}`)))
  assert.ok(quickKeys.has('near top guide https://example.com/near'))

  const top = lowCtr.items.find((item) => item.query === 'top result guide')
  assert.ok(top)
  assert.equal(top.url, 'https://example.com/top')
  assert.equal(top.impressions, 5000)
  assert.equal(lowCtr.selection.fragmentRows, 1)
  assert.equal(quickWins.selection.fragmentRows, 1)
  assert.equal(lowCtr.selection.outsideCandidatePositionRows > 0, true)
})
