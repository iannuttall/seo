import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addKeywordsToSet,
  createKeywordSet,
  KEYWORD_SET_SCHEMA_SQL,
} from '../keyword-sets/index.js'
import type {
  ProviderEvidence,
  SerpSnapshot,
  SerpSnapshotRequest,
} from '../providers/contracts.js'
import { RANK_TRACKING_SCHEMA_SQL } from '../rank-tracking/schema.js'
import type { RankTrackingCollector } from '../rank-tracking/types.js'
import Database from '../storage/sqlite.js'
import { rankTrackingReport } from './rank-tracking.js'

const MARKET = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
  location: { name: 'London,England,United Kingdom' },
  device: 'desktop' as const,
}

function database(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(KEYWORD_SET_SCHEMA_SQL)
  db.exec(RANK_TRACKING_SCHEMA_SQL)
  return db
}

function ids() {
  let next = 0
  return () => `fixture-${++next}`
}

function setupKeywords(db: Database.Database, keywords: string[]) {
  const set = createKeywordSet(
    {
      projectId: 'project-1',
      name: 'Tracked terms',
      market: MARKET,
      provider: 'dataforseo',
    },
    { database: db, id: () => 'set-1' },
  )
  addKeywordsToSet(
    {
      projectId: 'project-1',
      idOrName: set.id,
      items: keywords.map((keyword) => ({ keyword })),
    },
    { database: db },
  )
}

function evidence(
  request: SerpSnapshotRequest,
  position: number | null,
  path = 'ranking-page',
): ProviderEvidence<SerpSnapshot> {
  const checkedAt = '2026-07-21T10:00:00.000Z'
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'serp-snapshot',
    data: {
      keyword: request.keyword.toLowerCase(),
      effectiveKeyword: request.keyword.toLowerCase(),
      searchEngineDomain: 'google.co.uk',
      checkedAt,
      checkUrl: null,
      resultCount: 100,
      pagesCount: 2,
      features: ['organic', 'people_also_ask'],
      organicResults:
        position === null
          ? [
              {
                rankGroup: 1,
                rankAbsolute: 1,
                page: 1,
                domain: 'competitor.test',
                url: 'https://competitor.test/page',
                title: null,
                description: null,
                isFeaturedSnippet: null,
              },
            ]
          : [
              {
                rankGroup: position,
                rankAbsolute: position + 2,
                page: Math.ceil(position / 10),
                domain: 'www.example.test',
                url: `https://www.example.test/${path}`,
                title: null,
                description: null,
                isFeaturedSnippet: false,
              },
            ],
      localPack: {
        present: false,
        returnedRows: 0,
        retainedRows: 0,
        invalidRows: 0,
        results: [],
      },
    },
    observedAt: checkedAt,
    market: request.market,
    coverage: {
      requestedRows: request.depth,
      returnedRows: request.depth,
      retainedRows: position === null ? 1 : 1,
      invalidRows: 0,
      providerTotalRows: 100,
      completeness: 'complete',
      nextCursor: null,
    },
    cache: { status: 'bypass', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 2_000,
      actualMicros: 2_000,
      taskIds: [`task-${request.keyword}`],
    },
    request: {
      operation: 'serp-snapshot',
      endpoint: 'fixture',
      limit: request.depth,
      filters: {},
      sort: ['rankGroup:ascending'],
    },
    warnings: [],
  }
}

test('compares exact ranks without blending market or Search Console semantics', async () => {
  const db = database()
  setupKeywords(db, ['Alpha', 'Beta', 'Gamma', 'Delta'])
  let phase: 1 | 2 = 1
  let now = new Date('2026-07-21T10:00:00.000Z')
  const positions = {
    1: { alpha: 10, beta: 5, gamma: null, delta: 8 },
    2: { alpha: 6, beta: 9, gamma: 4, delta: null },
  } as const
  const collector: RankTrackingCollector = {
    provider: 'dataforseo',
    live: async (request) =>
      evidence(
        request,
        positions[phase][
          request.keyword.toLowerCase() as keyof (typeof positions)[1]
        ],
        phase === 2 && request.keyword.toLowerCase() === 'alpha'
          ? 'new-page'
          : 'ranking-page',
      ),
  }
  const dependencies = {
    database: db,
    id: ids(),
    now: () => now,
    collector,
  }
  const input = {
    projectId: 'project-1',
    set: 'set-1',
    targetDomain: 'example.test',
    collectionMethod: 'live' as const,
    cadence: 'manual' as const,
    depth: 20,
    keywordLimit: 4,
    outputLimit: 10,
  }
  const first = await rankTrackingReport(input, dependencies)
  assert.equal(first.dataStatus, 'complete')
  assert.equal(first.summary.observed, 3)
  assert.equal(first.summary.notObservedWithinDepth, 1)
  assert.equal(first.comparison.priorRunId, null)

  phase = 2
  now = new Date('2026-07-22T10:00:00.000Z')
  const second = await rankTrackingReport(input, dependencies)
  assert.equal(second.dataStatus, 'complete')
  assert.equal(second.summary.improved, 1)
  assert.equal(second.summary.declined, 1)
  assert.equal(second.summary.new, 1)
  assert.equal(second.summary.lost, 1)
  assert.equal(second.summary.rankingUrlChanges, 1)
  assert.equal(second.comparison.comparableItems, 4)
  assert.deepEqual(
    second.items.map((item) => item.change),
    ['lost', 'declined', 'new', 'improved'],
  )
  assert.match(second.caveats[0] ?? '', /not proof/iu)
  assert.match(second.caveats[1] ?? '', /average position/iu)
})

test('recovers an interrupted queued post by provider tag without duplicating spend', async () => {
  const db = database()
  setupKeywords(db, ['Alpha'])
  let acceptedTaskKey: string | null = null
  let invocation = 0
  let postCalls = 0
  const collector: RankTrackingCollector = {
    provider: 'dataforseo',
    live: async () => {
      throw new Error('live collection should not run')
    },
    post: async ({ tasks }) => {
      postCalls += 1
      acceptedTaskKey = tasks[0]?.taskKey ?? null
      throw new Error('connection ended after the provider accepted the task')
    },
    ready: async () => {
      invocation += 1
      return invocation === 1 || !acceptedTaskKey
        ? []
        : [{ providerTaskId: 'remote-task-1', taskKey: acceptedTaskKey }]
    },
    collect: async ({ request }) => ({
      ...evidence(request, 7),
      cost: {
        currency: 'USD' as const,
        estimatedMicros: 0,
        actualMicros: 0,
        taskIds: ['remote-task-1'],
      },
    }),
  }
  const dependencies = {
    database: db,
    id: ids(),
    now: () => new Date('2026-07-21T10:00:00.000Z'),
    collector,
  }
  const input = {
    projectId: 'project-1',
    set: 'set-1',
    targetDomain: 'example.test',
    collectionMethod: 'queued' as const,
    cadence: 'manual' as const,
    depth: 20,
    keywordLimit: 1,
  }
  const pending = await rankTrackingReport(input, dependencies)
  assert.equal(pending.dataStatus, 'pending')
  assert.equal(pending.summary.pendingSnapshots, 1)
  assert.equal(postCalls, 1)
  assert.match(pending.operationalWarnings[0] ?? '', /recovery/iu)

  const complete = await rankTrackingReport(input, dependencies)
  assert.equal(complete.dataStatus, 'complete')
  assert.equal(complete.summary.observed, 1)
  assert.equal(complete.summary.pendingSnapshots, 0)
  assert.equal(postCalls, 1)
  assert.equal(complete.run?.actualCostMicros, null)
})
