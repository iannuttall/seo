import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDb } from '../storage/database.js'
import {
  planDueIndexUrls,
  selectDueIndexUrls,
} from './monitoring/index-monitor.js'
import { planIndexCoverageFromUrls } from './monitoring/index-plan.js'

function urls(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}/`)
}

test('planIndexCoverageFromUrls suggests folder properties for large buckets', () => {
  const report = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: [
      ...urls('https://example.com/cities/city-', 2000),
      ...urls('https://example.com/blog/post-', 2000),
    ],
    accountProperties: ['sc-domain:example.com'],
    dailyLimit: 2000,
    targetCycleDays: 1,
  })

  assert.equal(report.summary.urlCount, 4000)
  assert.equal(report.properties[0]?.property, 'sc-domain:example.com')
  assert.equal(report.properties[0]?.cycleDays, 2)
  assert.equal(report.suggestions.length, 2)
  assert.equal(report.suggestions[0]?.property, 'https://example.com/cities/')
  assert.match(report.suggestions[0]?.reason ?? '', /separate daily inspection/)
})

test('planIndexCoverageFromUrls maps URLs to existing URL-prefix properties', () => {
  const report = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: [
      ...urls('https://example.com/cities/city-', 2000),
      ...urls('https://example.com/blog/post-', 2000),
    ],
    accountProperties: ['sc-domain:example.com', 'https://example.com/cities/'],
    dailyLimit: 2000,
    targetCycleDays: 1,
  })

  assert.equal(report.summary.properties, 2)
  assert.equal(
    report.properties.find(
      (property) => property.property === 'https://example.com/cities/',
    )?.cycleDays,
    1,
  )
  assert.equal(
    report.suggestions.some(
      (suggestion) => suggestion.property === 'https://example.com/cities/',
    ),
    false,
  )
})

test('selectDueIndexUrls gives each matching property a fair slice', () => {
  const selected = selectDueIndexUrls({
    site: 'sc-domain:example-select.test',
    urls: [
      ...urls('https://example-select.test/cities/city-', 5),
      ...urls('https://example-select.test/blog/post-', 5),
    ],
    accountProperties: [
      'sc-domain:example-select.test',
      'https://example-select.test/cities/',
    ],
    dailyLimit: 3,
    inspectLimit: 4,
  })

  assert.equal(selected.length, 4)
  assert.equal(
    selected.filter(
      (item) => item.property === 'https://example-select.test/cities/',
    ).length,
    2,
  )
  assert.equal(
    selected.filter((item) => item.property === 'sc-domain:example-select.test')
      .length,
    2,
  )
})

test('property reassignment preserves root inspection freshness', () => {
  const root = 'sc-domain:index-reassignment.test'
  const url = 'https://index-reassignment.test/blog/post/'
  const db = getDb()
  try {
    db.prepare(
      `INSERT INTO index_watch_snapshots
      (id, site_url, root_site_url, property_site_url, url, verdict,
       inspection_status, inspected_at)
      VALUES (?, ?, ?, ?, ?, 'PASS', 'succeeded', ?)`,
    ).run(
      'index-reassignment-snapshot',
      root,
      root,
      root,
      url,
      Date.parse('2026-07-09T11:00:00.000Z'),
    )

    const selected = selectDueIndexUrls({
      site: root,
      urls: [url],
      accountProperties: [root, 'https://index-reassignment.test/blog/'],
      dailyLimit: 2_000,
      inspectLimit: 100,
      staleAfterDays: 1,
      now: new Date('2026-07-09T12:00:00.000Z'),
    })

    assert.deepEqual(selected, [])
  } finally {
    db.prepare('DELETE FROM index_watch_snapshots WHERE root_site_url = ?').run(
      root,
    )
  }
})

test('recent failed inspections wait before retrying', () => {
  const root = 'sc-domain:index-retry.test'
  const url = 'https://index-retry.test/page/'
  const db = getDb()
  try {
    db.prepare(
      `INSERT INTO index_watch_snapshots
      (id, site_url, root_site_url, property_site_url, url,
       inspection_status, error_code, inspected_at)
      VALUES (?, ?, ?, ?, ?, 'failed', 'provider_unavailable', ?)`,
    ).run(
      'index-retry-failure',
      root,
      root,
      root,
      url,
      Date.parse('2026-07-09T11:00:00.000Z'),
    )
    const input = {
      site: root,
      urls: [url],
      accountProperties: [root],
      dailyLimit: 2_000,
      inspectLimit: 100,
      failureRetryHours: 24,
    }

    assert.deepEqual(
      selectDueIndexUrls({
        ...input,
        now: new Date('2026-07-09T12:00:00.000Z'),
      }),
      [],
    )
    assert.equal(
      selectDueIndexUrls({
        ...input,
        now: new Date('2026-07-10T12:00:00.000Z'),
      }).length,
      1,
    )
  } finally {
    db.prepare('DELETE FROM index_watch_snapshots WHERE root_site_url = ?').run(
      root,
    )
  }
})

test('due selection reports exclusive inventory states', () => {
  const root = 'sc-domain:index-due-states.test'
  const page = (name: string) => `https://index-due-states.test/${name}/`
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO index_watch_snapshots
    (id, site_url, root_site_url, property_site_url, url, verdict,
     inspection_status, error_code, inspected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  try {
    insert.run(
      'due-never-success',
      root,
      root,
      root,
      page('never-success'),
      null,
      'failed',
      'provider_unavailable',
      Date.parse('2026-07-07T12:00:00.000Z'),
    )
    insert.run(
      'due-retry-wait',
      root,
      root,
      root,
      page('retry-wait'),
      null,
      'failed',
      'provider_unavailable',
      Date.parse('2026-07-09T11:00:00.000Z'),
    )
    insert.run(
      'due-fresh',
      root,
      root,
      root,
      page('fresh'),
      'PASS',
      'succeeded',
      null,
      Date.parse('2026-07-09T11:00:00.000Z'),
    )
    insert.run(
      'due-stale',
      root,
      root,
      root,
      page('stale'),
      'PASS',
      'succeeded',
      null,
      Date.parse('2026-07-07T12:00:00.000Z'),
    )

    const selection = planDueIndexUrls({
      site: root,
      urls: [
        page('never-attempted'),
        page('never-success'),
        page('retry-wait'),
        page('fresh'),
        page('stale'),
      ],
      accountProperties: [root],
      dailyLimit: 2_000,
      inspectLimit: 2,
      staleAfterDays: 1,
      failureRetryHours: 24,
      now: new Date('2026-07-09T12:00:00.000Z'),
    })

    assert.deepEqual(selection.summary, {
      neverAttempted: 1,
      neverSucceeded: 1,
      retryWaiting: 1,
      fresh: 1,
      stale: 1,
      due: 3,
      unselectedDue: 1,
    })
    assert.deepEqual(
      selection.selected.map((item) => item.dueReason),
      ['never-attempted', 'never-succeeded'],
    )
  } finally {
    db.prepare('DELETE FROM index_watch_snapshots WHERE root_site_url = ?').run(
      root,
    )
  }
})

test('index allocation uses owned subdomain properties and ignores lookalikes', () => {
  const report = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: ['https://docs.example.com/guide/', 'https://example.com/blog/post/'],
    accountProperties: [
      'sc-domain:docs.example.com',
      'https://notexample.com/example.com/',
    ],
  })

  assert.equal(
    report.properties.find(
      (property) => property.property === 'sc-domain:docs.example.com',
    )?.urlCount,
    1,
  )
  assert.equal(
    report.properties.some((property) =>
      property.property.includes('notexample.com'),
    ),
    false,
  )
  const invalid = planIndexCoverageFromUrls({
    site: 'sc-domain:example.com',
    urls: ['https://outside.test/page/'],
    accountProperties: ['sc-domain:example.com'],
  })
  assert.equal(invalid.summary.urlCount, 0)
  assert.match(invalid.warnings[0] ?? '', /outside the Search Console property/)
})
