import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type OrganicPages, weighByKeyEvents } from './analytics-site.js'

const ga = (capped: boolean): OrganicPages => ({
  property: '123',
  propertyName: 'Shop web',
  host: 'shop.example',
  capped,
  pages: new Map([
    ['/blog/guide', { sessions: 900, keyEvents: 2 }],
    ['/compare', { sessions: 120, keyEvents: 14 }],
    ['/features', { sessions: 300, keyEvents: 0 }],
  ]),
})

// Rows in the section's own order: most impressions first.
const items = () => [
  { url: 'https://shop.example/pricing', impressions: 3000 },
  { url: 'https://shop.example/blog/guide', impressions: 2600 },
  { url: 'https://shop.example/features/', impressions: 2200 },
  { url: 'https://www.shop.example/compare', impressions: 1800 },
  { url: 'https://blog.shop.example/compare', impressions: 1700 },
]

const keyed = (report: Record<string, unknown>) =>
  (report.items as Record<string, unknown>[]).map((item) => [
    item.url,
    item.keyEvents,
    item.organicSessions,
  ])

test('pages that converted come first, and a page Google Analytics did not list is zero only when every page was read', () => {
  const full = { items: items() }
  const note = weighByKeyEvents(full, ga(false))
  assert.deepEqual(keyed(full), [
    // www and trailing slashes match the landing page path.
    ['https://www.shop.example/compare', 14, 120],
    ['https://shop.example/blog/guide', 2, 900],
    // Not listed while every page was read: zero.
    ['https://shop.example/pricing', 0, 0],
    ['https://shop.example/features/', 0, 300],
    // Another host than the web stream's: unknown.
    ['https://blog.shop.example/compare', null, null],
  ])
  assert.match(note, /^Pages that converted come first: 2 pages/)

  const capped = { items: items() }
  weighByKeyEvents(capped, ga(true))
  assert.deepEqual(keyed(capped)[2], [
    'https://shop.example/pricing',
    null,
    null,
  ])

  const failed = { items: items() }
  assert.match(
    weighByKeyEvents(failed, 'Google Analytics: no matching property.'),
    /^Not ranked/,
  )
  assert.deepEqual(failed.items, items())
})
