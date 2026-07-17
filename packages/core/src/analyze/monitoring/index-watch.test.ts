import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '../../errors.js'
import { UrlInspectionQuotaError } from '../../gsc/client/inspection-quota.js'
import { getDb } from '../../storage/database.js'
import {
  INDEX_WATCH_ATTEMPT_RETENTION,
  type IndexWatchDependencies,
  type IndexWatchStore,
  indexWatch,
  latestIndexWatchSummary,
  pruneIndexWatchSnapshots,
} from './index-watch.js'
import type { IndexWatchItem, IndexWatchPrevious } from './types.js'

function memoryStore(previous?: IndexWatchPrevious) {
  const inserted: IndexWatchItem[] = []
  const store: IndexWatchStore = {
    latest: () => previous,
    insert: (item) => inserted.push(item),
  }
  return { inserted, store }
}

function dependencies(input: {
  inspect: IndexWatchDependencies['inspectUrl']
  previous?: IndexWatchPrevious
}) {
  const memory = memoryStore(input.previous)
  return {
    memory,
    dependencies: {
      inspectUrl: input.inspect,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
      store: memory.store,
    } satisfies IndexWatchDependencies,
  }
}

function pass() {
  return {
    inspectionResult: {
      indexStatusResult: {
        verdict: 'PASS',
        indexingState: 'INDEXING_ALLOWED',
        robotsTxtState: 'ALLOWED',
        pageFetchState: 'SUCCESSFUL',
      },
    },
  }
}

test('indexWatch continues after a URL-specific provider failure', async () => {
  let calls = 0
  const context = dependencies({
    inspect: async () => {
      calls += 1
      if (calls === 2) {
        throw new SeoError('PROVIDER_UNAVAILABLE', 'Temporary provider error.')
      }
      return pass()
    },
  })
  const report = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: [
        'https://example.com/one',
        'https://example.com/two',
        'https://example.com/three',
      ],
    },
    context.dependencies,
  )

  assert.equal(calls, 3)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.attempted, 3)
  assert.equal(report.summary.inspected, 2)
  assert.equal(report.summary.failed, 1)
  assert.equal(report.summary.currentIssues, 0)
  assert.equal(context.memory.inserted.length, 3)
  assert.equal(report.items[1]?.inspectionStatus, 'failed')
  assert.equal(report.items[1]?.currentIssue, false)
})

test('indexWatch stops a property after 429 without persisting deferred URLs', async () => {
  let calls = 0
  const context = dependencies({
    inspect: async () => {
      calls += 1
      throw new SeoError('RATE_LIMITED', 'Quota exhausted.')
    },
  })
  const report = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: [
        'https://example.com/one',
        'https://example.com/two',
        'https://example.com/three',
      ],
    },
    context.dependencies,
  )

  assert.equal(calls, 1)
  assert.equal(report.summary.attempted, 1)
  assert.equal(report.summary.quotaBlocked, 1)
  assert.equal(report.summary.deferred, 2)
  assert.equal(context.memory.inserted.length, 1)
  assert.equal(report.items[1]?.requestSent, false)
})

test('local quota denial is blocked without counting a sent request', async () => {
  const context = dependencies({
    inspect: async () => {
      throw new UrlInspectionQuotaError({
        property: 'sc-domain:example.com',
        resetAt: '2026-07-10T00:00:00.000Z',
        used: 2_000,
        limit: 2_000,
      })
    },
  })
  const report = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/one', 'https://example.com/two'],
    },
    context.dependencies,
  )

  assert.equal(report.summary.attempted, 0)
  assert.equal(report.summary.quotaBlocked, 1)
  assert.equal(report.summary.deferred, 1)
  assert.equal(report.items[0]?.requestSent, false)
  assert.equal(report.items[0]?.retryAt, '2026-07-10T00:00:00.000Z')
  assert.equal(context.memory.inserted.length, 1)
})

test('indexWatch keeps authentication and property access failures fatal', async () => {
  for (const code of [
    'AUTH_EXPIRED',
    'ACCESS_DENIED',
    'PROPERTY_NOT_FOUND',
  ] as const) {
    const context = dependencies({
      inspect: async () => {
        throw new SeoError(code, code)
      },
    })
    await assert.rejects(
      indexWatch(
        {
          site: 'sc-domain:example.com',
          urls: ['https://example.com/one'],
        },
        context.dependencies,
      ),
      (error: unknown) => error instanceof SeoError && error.code === code,
    )
    assert.equal(context.memory.inserted.length, 0)
  }
})

test('multi-property mode stops one inaccessible property without repeated calls', async () => {
  let calls = 0
  const context = dependencies({
    inspect: async () => {
      calls += 1
      throw new SeoError('ACCESS_DENIED', 'No property access.')
    },
  })
  const report = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: [
        'https://example.com/one',
        'https://example.com/two',
        'https://example.com/three',
      ],
      continueOnPropertyError: true,
    },
    context.dependencies,
  )

  assert.equal(calls, 1)
  assert.equal(report.summary.failed, 1)
  assert.equal(report.summary.deferred, 2)
  assert.equal(context.memory.inserted.length, 1)
})

test('indexWatch validates, bounds, and deduplicates before provider calls', async () => {
  let calls = 0
  const context = dependencies({
    inspect: async () => {
      calls += 1
      return pass()
    },
  })
  const duplicateReport = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/one', 'https://example.com/one'],
    },
    context.dependencies,
  )
  assert.equal(duplicateReport.summary.requested, 2)
  assert.equal(duplicateReport.summary.unique, 1)
  assert.equal(calls, 1)

  await assert.rejects(
    indexWatch(
      {
        site: 'sc-domain:example.com',
        urls: ['https://not-example.test/'],
      },
      context.dependencies,
    ),
    /outside the Search Console property/,
  )
  assert.equal(calls, 1)
})

test('successful inspection compares with the latest successful state', async () => {
  const context = dependencies({
    previous: {
      inspectedAt: '2026-07-01T12:00:00.000Z',
      verdict: 'FAIL',
      pageFetchState: 'SERVER_ERROR',
    },
    inspect: async () => pass(),
  })
  const report = await indexWatch(
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/one'],
    },
    context.dependencies,
  )

  assert.equal(report.items[0]?.changeKind, 'recovery')
  assert.equal(report.summary.recoveries, 1)
})

test('latest summary rolls prefix properties into the root deterministically', () => {
  const root = 'sc-domain:index-summary-rollup.test'
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO index_watch_snapshots
    (id, site_url, root_site_url, property_site_url, url, verdict,
     inspection_status, inspected_at)
    VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?)`,
  )
  const timestamp = Date.parse('2026-07-09T12:00:00.000Z')
  try {
    insert.run(
      'index-summary-a',
      'https://index-summary-rollup.test/blog/',
      root,
      'https://index-summary-rollup.test/blog/',
      'https://index-summary-rollup.test/blog/one',
      'FAIL',
      timestamp,
    )
    insert.run(
      'index-summary-z',
      'https://index-summary-rollup.test/blog/',
      root,
      'https://index-summary-rollup.test/blog/',
      'https://index-summary-rollup.test/blog/one',
      'PASS',
      timestamp,
    )
    insert.run(
      'index-summary-other',
      'https://index-summary-rollup.test/shop/',
      root,
      'https://index-summary-rollup.test/shop/',
      'https://index-summary-rollup.test/shop/two',
      'NEUTRAL',
      timestamp + 1,
    )
    insert.run(
      'index-summary-reassigned',
      'sc-domain:index-summary-rollup.test',
      root,
      'sc-domain:index-summary-rollup.test',
      'https://index-summary-rollup.test/blog/one',
      'PASS',
      timestamp + 2,
    )
    db.prepare(
      `INSERT INTO index_watch_snapshots
      (id, site_url, root_site_url, property_site_url, url,
       inspection_status, error_code, inspected_at)
      VALUES (?, ?, ?, ?, ?, 'failed', 'provider_unavailable', ?)`,
    ).run(
      'index-summary-latest-failure',
      'https://index-summary-rollup.test/shop/',
      root,
      'https://index-summary-rollup.test/shop/',
      'https://index-summary-rollup.test/shop/two',
      timestamp + 3,
    )

    const summary = latestIndexWatchSummary(root)
    assert.equal(summary.inspectedUrls, 2)
    assert.equal(summary.nonPass, 1)
    assert.equal(summary.currentIssues, 1)
    assert.equal(summary.failed, 1)
  } finally {
    db.prepare('DELETE FROM index_watch_snapshots WHERE root_site_url = ?').run(
      root,
    )
  }
})

test('index watch bounds attempts while preserving the latest success', () => {
  const root = 'sc-domain:index-retention.test'
  const url = 'https://index-retention.test/page'
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO index_watch_snapshots
    (id, site_url, root_site_url, property_site_url, url, verdict,
     inspection_status, error_code, inspected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  try {
    insert.run(
      'index-retention-success',
      root,
      root,
      root,
      url,
      'PASS',
      'succeeded',
      null,
      1,
    )
    for (let index = 0; index < INDEX_WATCH_ATTEMPT_RETENTION + 4; index += 1) {
      insert.run(
        `index-retention-failure-${index}`,
        root,
        root,
        root,
        url,
        null,
        'failed',
        'provider_unavailable',
        index + 2,
      )
    }

    assert.equal(pruneIndexWatchSnapshots(root, url, db), 4)
    const rows = db
      .prepare(
        'SELECT id FROM index_watch_snapshots WHERE root_site_url = ? AND url = ?',
      )
      .all(root, url) as Array<{ id: string }>
    assert.equal(rows.length, INDEX_WATCH_ATTEMPT_RETENTION + 1)
    assert.ok(rows.some((row) => row.id === 'index-retention-success'))

    const summary = latestIndexWatchSummary(root)
    assert.equal(summary.failed, 1)
    assert.equal(summary.nonPass, 0)
  } finally {
    db.prepare('DELETE FROM index_watch_snapshots WHERE root_site_url = ?').run(
      root,
    )
  }
})
