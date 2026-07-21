import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import Database from '../storage/sqlite.js'
import {
  addKeywordsToSet,
  createKeywordSet,
  deleteKeywordSet,
  getKeywordSet,
  KEYWORD_SET_LIMITS,
  KEYWORD_SET_SCHEMA_SQL,
  keywordSetLogicalBytes,
  listKeywordSets,
  removeKeywordsFromSet,
  setKeywordSetRefreshTime,
} from './index.js'
import type { SavedKeywordMetric } from './types.js'

const MARKET = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
  location: { name: 'London,England,United Kingdom' },
  device: 'mobile' as const,
}

const FIRST_TIME = new Date('2026-07-21T10:00:00.000Z')
const SECOND_TIME = new Date('2026-07-21T11:00:00.000Z')
const THIRD_TIME = new Date('2026-07-21T12:00:00.000Z')

function database(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(KEYWORD_SET_SCHEMA_SQL)
  return db
}

function metric(keyword: string): SavedKeywordMetric {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    observedAt: FIRST_TIME.toISOString(),
    metric: {
      keyword,
      monthlySearchVolume: observedValue(320),
      monthlySearches: observedValue([
        { year: 2026, month: 5, searchVolume: 300 },
        { year: 2026, month: 6, searchVolume: 320 },
      ]),
      searchVolumeUpdatedAt: observedValue('2026-06-30'),
      cpcUsd: observedValue(1.25),
      paidCompetition: observedValue(0.42),
      keywordDifficulty: unavailableValue(
        'unavailable',
        'The selected provider did not return difficulty.',
      ),
      intent: observedValue('commercial'),
      resultCount: observedValue(12_000),
    },
  }
}

test('creates and lists provider-neutral keyword sets by project', () => {
  const db = database()
  const set = createKeywordSet(
    {
      projectId: 'example-project',
      name: 'Local service ideas',
      market: MARKET,
      provider: 'dataforseo',
      sourceReport: 'keyword-research',
    },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )

  assert.deepEqual(set, {
    schemaVersion: 1,
    id: 'set-one',
    projectId: 'example-project',
    name: 'Local service ideas',
    market: MARKET,
    provider: 'dataforseo',
    sourceReport: 'keyword-research',
    keywordCount: 0,
    tagCount: 0,
    createdAt: FIRST_TIME.toISOString(),
    updatedAt: FIRST_TIME.toISOString(),
    lastRefreshedAt: null,
  })
  assert.deepEqual(
    listKeywordSets({ projectId: 'example-project' }, { database: db }),
    [set],
  )
  assert.deepEqual(
    listKeywordSets({ projectId: 'another-project' }, { database: db }),
    [],
  )
  assert.ok(keywordSetLogicalBytes(db) > 0)
})

test('rejects duplicate names and rolls back storage-limit failures', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  assert.throws(
    () =>
      createKeywordSet(
        { projectId: 'example-project', name: 'priority', market: MARKET },
        { database: db, id: () => 'set-two', now: () => FIRST_TIME },
      ),
    /already exists/i,
  )
  assert.throws(
    () =>
      createKeywordSet(
        { projectId: 'example-project', name: 'Too large', market: MARKET },
        {
          database: db,
          id: () => 'set-three',
          now: () => FIRST_TIME,
          maxLogicalBytes: 1,
        },
      ),
    /cannot exceed 1 logical bytes/i,
  )
  assert.equal(
    listKeywordSets({ projectId: 'example-project' }, { database: db }).length,
    1,
  )
})

test('adds normalized keywords idempotently with typed metrics, tags, and pages', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  const added = addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'Priority',
      items: [
        {
          keyword: '  Emergency   Plumber ',
          tags: ['Local', 'Service'],
          page: { kind: 'target', url: 'https://example.com/plumbing' },
          latestMetric: metric('emergency plumber'),
        },
        { keyword: 'emergency plumber', tags: ['local'] },
        { keyword: 'Boiler repair', tags: ['Service'] },
      ],
    },
    { database: db, now: () => SECOND_TIME },
  )
  assert.deepEqual(added, {
    setId: 'set-one',
    requested: 3,
    normalized: 2,
    added: 2,
    removed: 0,
    existing: 0,
    updated: 0,
    keywordCount: 2,
  })

  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one' },
    { database: db },
  )
  assert.equal(detail.set.keywordCount, 2)
  assert.equal(detail.set.tagCount, 2)
  assert.equal(detail.set.updatedAt, SECOND_TIME.toISOString())
  assert.deepEqual(
    detail.items.map((item) => item.normalizedKeyword),
    ['boiler repair', 'emergency plumber'],
  )
  assert.deepEqual(detail.items[1]?.tags, ['local', 'service'])
  assert.deepEqual(detail.items[1]?.page, {
    kind: 'target',
    url: 'https://example.com/plumbing',
  })
  assert.equal(
    detail.items[1]?.latestMetric?.metric.monthlySearchVolume.value,
    320,
  )

  const repeated = addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      items: [
        {
          keyword: 'EMERGENCY PLUMBER',
          tags: ['urgent'],
          page: null,
          latestMetric: null,
        },
      ],
    },
    { database: db, now: () => SECOND_TIME },
  )
  assert.deepEqual(repeated, {
    setId: 'set-one',
    requested: 1,
    normalized: 1,
    added: 0,
    removed: 0,
    existing: 1,
    updated: 1,
    keywordCount: 2,
  })
  const updated = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', tag: 'urgent' },
    { database: db },
  )
  assert.equal(updated.pagination.total, 1)
  assert.equal(updated.items[0]?.keyword, 'Emergency Plumber')
  assert.deepEqual(updated.items[0]?.tags, ['local', 'service', 'urgent'])
  assert.equal(updated.items[0]?.page, null)
  assert.equal(updated.items[0]?.latestMetric, null)

  const noChange = addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      items: [
        {
          keyword: 'emergency plumber',
          tags: ['urgent'],
          page: null,
          latestMetric: null,
        },
      ],
    },
    { database: db, now: () => THIRD_TIME },
  )
  assert.equal(noChange.updated, 0)
  assert.equal(
    getKeywordSet(
      { projectId: 'example-project', idOrName: 'set-one' },
      { database: db },
    ).set.updatedAt,
    SECOND_TIME.toISOString(),
  )
})

test('filters and paginates in stable keyword order', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      items: [
        { keyword: 'Zulu', tags: ['cluster-a'] },
        { keyword: 'Alpha', tags: ['cluster-a'] },
        { keyword: 'Middle', tags: ['cluster-b'] },
      ],
    },
    { database: db, now: () => SECOND_TIME },
  )
  const page = getKeywordSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      tag: 'CLUSTER-A',
      limit: 1,
    },
    { database: db },
  )
  assert.deepEqual(
    page.items.map((item) => item.keyword),
    ['Alpha'],
  )
  assert.deepEqual(page.pagination, {
    offset: 0,
    limit: 1,
    returned: 1,
    total: 2,
    nextOffset: 1,
  })
})

test('removes keywords idempotently and cascades set deletion', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      items: [
        { keyword: 'Alpha', tags: ['one'] },
        { keyword: 'Beta', tags: ['two'] },
      ],
    },
    { database: db, now: () => FIRST_TIME },
  )
  assert.deepEqual(
    removeKeywordsFromSet(
      {
        projectId: 'example-project',
        idOrName: 'set-one',
        keywords: ['alpha', 'missing', 'ALPHA'],
      },
      { database: db, now: () => SECOND_TIME },
    ),
    {
      setId: 'set-one',
      requested: 3,
      normalized: 2,
      added: 0,
      removed: 1,
      existing: 1,
      updated: 0,
      keywordCount: 1,
    },
  )
  assert.equal(
    deleteKeywordSet(
      { projectId: 'example-project', idOrName: 'Priority' },
      { database: db },
    ),
    true,
  )
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS count FROM keyword_set_items').get() as {
        count: number
      }
    ).count,
    0,
  )
  assert.equal(
    (
      db.prepare('SELECT COUNT(*) AS count FROM keyword_set_tags').get() as {
        count: number
      }
    ).count,
    0,
  )
})

test('records refresh time without replacing observed metric dates', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  const set = setKeywordSetRefreshTime(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      refreshedAt: '2026-07-20T09:30:00.000Z',
    },
    { database: db, now: () => SECOND_TIME },
  )
  assert.equal(set.lastRefreshedAt, '2026-07-20T09:30:00.000Z')
  assert.equal(set.updatedAt, SECOND_TIME.toISOString())
})

test('rejects malformed, oversized, and mismatched mutations before storage', () => {
  const db = database()
  createKeywordSet(
    { projectId: 'example-project', name: 'Priority', market: MARKET },
    { database: db, id: () => 'set-one', now: () => FIRST_TIME },
  )
  assert.throws(
    () =>
      addKeywordsToSet(
        {
          projectId: 'example-project',
          idOrName: 'set-one',
          items: [{ keyword: 'alpha', latestMetric: metric('beta') }],
        },
        { database: db },
      ),
    /same keyword/i,
  )
  assert.throws(
    () =>
      addKeywordsToSet(
        {
          projectId: 'example-project',
          idOrName: 'set-one',
          items: [
            {
              keyword: 'alpha',
              page: { kind: 'target', url: 'file:///tmp/a' },
            },
          ],
        },
        { database: db },
      ),
    /HTTP or HTTPS/i,
  )
  assert.throws(
    () =>
      addKeywordsToSet(
        {
          projectId: 'example-project',
          idOrName: 'set-one',
          items: Array.from(
            { length: KEYWORD_SET_LIMITS.mutationKeywords + 1 },
            (_, index) => ({ keyword: `keyword ${index}` }),
          ),
        },
        { database: db },
      ),
    /per operation/i,
  )
  assert.equal(
    getKeywordSet(
      { projectId: 'example-project', idOrName: 'set-one' },
      { database: db },
    ).pagination.total,
    0,
  )
})
