import assert from 'node:assert/strict'
import test from 'node:test'
import { type GapRow, shortlist } from './audit/competitors.ts'

const row = (
  fields: Partial<GapRow> & Pick<GapRow, 'competitor' | 'keyword'>,
): GapRow => ({
  position: 4,
  url: `https://${fields.competitor}/${fields.keyword.replaceAll(' ', '-')}`,
  search_volume: 1000,
  cpc: 2,
  intent: 'commercial',
  ...fields,
})

test('shortlist keeps only keywords proven by two competitors, worth money and not named before', () => {
  const rows: GapRow[] = [
    // Two competitors in the top 10, commercial: kept (strength 2,000).
    row({ competitor: 'a.example', keyword: 'crm for plumbers' }),
    row({ competitor: 'b.example', keyword: 'crm for plumbers', position: 10 }),
    // The second competitor is 11th, so only one proves it.
    row({ competitor: 'a.example', keyword: 'plumbing invoices' }),
    row({
      competitor: 'b.example',
      keyword: 'plumbing invoices',
      position: 11,
    }),
    // Informational and not a tool: no money gate.
    row({
      competitor: 'a.example',
      keyword: 'what is a crm',
      intent: 'informational',
    }),
    row({
      competitor: 'b.example',
      keyword: 'what is a crm',
      intent: 'informational',
    }),
    // A stronger keyword (strength 12,000), so it comes first.
    row({
      competitor: 'a.example',
      keyword: 'field service software',
      search_volume: 2000,
      cpc: 6,
    }),
    row({
      competitor: 'b.example',
      keyword: 'field service software',
      search_volume: 2000,
      cpc: 6,
    }),
    // Named before at strength 1,500: 2,100 is under 1.5 times, so it stays out.
    row({
      competitor: 'a.example',
      keyword: 'plumber scheduling app',
      cpc: 2.1,
    }),
    row({
      competitor: 'b.example',
      keyword: 'plumber scheduling app',
      cpc: 2.1,
    }),
    // A free tool page on a.example that ranks for three paying keywords:
    // an informational tool keyword passes on the cluster.
    ...[
      'job cost calculator',
      'labour cost calculator',
      'plumbing quote calculator',
    ].map((keyword) =>
      row({
        competitor: 'a.example',
        keyword,
        intent: 'informational',
        url: 'https://a.example/tools/cost-calculator',
      }),
    ),
    row({
      competitor: 'b.example',
      keyword: 'job cost calculator',
      intent: 'informational',
    }),
    // A tool keyword whose best tool page ranks for only two paying keywords.
    ...['pipe size chart', 'pipe size calculator'].map((keyword) =>
      row({
        competitor: 'a.example',
        keyword,
        intent: 'informational',
        url: 'https://a.example/pipe-size-calculator',
      }),
    ),
    row({
      competitor: 'b.example',
      keyword: 'pipe size calculator',
      intent: 'informational',
      url: 'https://b.example/pipes',
    }),
  ]
  const found = shortlist(
    rows,
    new Map([['plumber scheduling app', 1500]]),
    new Set(),
  )
  assert.deepEqual(
    found.map((item) => [item.keyword, item.kind, item.strength, item.cluster]),
    [
      ['field service software', 'page', 12000, 0],
      ['crm for plumbers', 'page', 2000, 0],
      ['job cost calculator', 'tool', 2000, 3],
    ],
  )
  assert.deepEqual(
    found[1]?.competitors.map((c) => [c.domain, c.position]),
    [
      ['a.example', 4],
      ['b.example', 10],
    ],
  )
  // 1.5 times the strength it was named at brings it back.
  const back = shortlist(
    rows,
    new Map([['plumber scheduling app', 1400]]),
    new Set(['crm for plumbers']),
  )
  assert.deepEqual(
    back.map((item) => item.keyword),
    ['field service software', 'plumber scheduling app', 'job cost calculator'],
  )
})
