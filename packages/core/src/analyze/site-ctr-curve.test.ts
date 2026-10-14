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

test('both CTR reports rank heuristic query flags after unflagged rows', () => {
  const site = 'sc-domain:inference.sh'
  const rows = [
    ...siteRows().map((item) => ({
      ...item,
      keys: [
        item.keys[0] ?? '',
        (item.keys[1] ?? '').replace('example.com', 'inference.sh'),
      ],
    })),
    row('skills sh', 'https://inference.sh/skills', 0, 90_000, 2),
    row('pruna', 'https://inference.sh/pruna', 0, 80_000, 6),
    row('flux image api', 'https://inference.sh/flux', 0, 3000, 2),
    row('flux lora api', 'https://inference.sh/lora', 0, 3000, 6),
  ]
  const lowCtr = analyzeCtrUnderperformersFromRows({ rows, site })
  const quickWins = analyzeQuickWinsFromRows({ rows, site })

  assert.equal(lowCtr.items.at(-1)?.query, 'skills sh')
  assert.deepEqual(lowCtr.items.at(-1)?.queryFlags, ['navigational-other'])
  assert.equal(lowCtr.selection.navigationalOtherRows, 1)
  assert.equal(quickWins.items.at(-1)?.query, 'pruna')
  assert.equal(quickWins.selection.flaggedRows, 1)
  assert.deepEqual(quickWins.items[0]?.queryFlags, [])
  assert.equal(quickWins.brand.source, 'search-console-navigational')
})
