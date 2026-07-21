import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addKeywordsToSet,
  createKeywordSet,
  KEYWORD_SET_SCHEMA_SQL,
} from '../keyword-sets/index.js'
import Database from '../storage/sqlite.js'
import { RANK_TRACKING_SCHEMA_SQL } from './schema.js'
import {
  activeRankTrackingRun,
  failRankTrackingTask,
  getRankTrackingRun,
  getOrCreateRankTrackingConfiguration,
  priorComparableRankTrackingRun,
  rankObservations,
  rankTrackingLogicalBytes,
  rankTrackingTasks,
  saveRankObservation,
  startRankTrackingRun,
  targetMatchesDomain,
} from './store.js'
import type { RankObservation } from './types.js'

const MARKET = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
  location: { name: 'London,England,United Kingdom' },
  device: 'mobile' as const,
}

function testDatabase(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(KEYWORD_SET_SCHEMA_SQL)
  db.exec(RANK_TRACKING_SCHEMA_SQL)
  return db
}

function ids(prefix = 'id') {
  let next = 0
  return () => `${prefix}-${++next}`
}

function setupSet(db: Database.Database) {
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
      items: [
        { keyword: 'Alpha service' },
        { keyword: 'Beta service', tags: ['local'] },
      ],
    },
    { database: db },
  )
  return set
}

function configuration(db: Database.Database) {
  setupSet(db)
  return getOrCreateRankTrackingConfiguration(
    {
      projectId: 'project-1',
      keywordSetId: 'set-1',
      targetDomain: 'example.test',
      market: MARKET,
      devices: ['desktop', 'mobile'],
      provider: 'dataforseo',
      collectionMethod: 'queued',
      cadence: 'weekly',
      depth: 50,
      keywordLimit: 100,
    },
    {
      database: db,
      id: () => 'config-1',
      now: () => new Date('2026-07-21T09:00:00.000Z'),
    },
  )
}

function observation(
  task: ReturnType<typeof rankTrackingTasks>[number],
  position: number | null,
): RankObservation {
  return {
    taskId: task.id,
    runId: task.runId,
    keyword: task.displayKeyword,
    normalizedKeyword: task.normalizedKeyword,
    device: task.device,
    state: position === null ? 'not_observed_within_depth' : 'observed',
    organicPosition: position,
    absolutePosition: position === null ? null : position + 2,
    rankingUrl:
      position === null
        ? null
        : `https://example.test/${task.normalizedKeyword}`,
    observedFeatures: ['organic'],
    checkedAt: '2026-07-21T09:05:00.000Z',
    provider: 'dataforseo',
    providerTaskId: task.providerTaskId,
    requestedDepth: 50,
    returnedRows: 50,
    retainedRows: 50,
    invalidRows: 0,
    completeness: 'complete',
    estimatedCostMicros: 600,
    actualCostMicros: 600,
    warnings: [],
  }
}

test('keeps exact target-domain matching away from lookalike hosts', () => {
  assert.equal(targetMatchesDomain('example.test', 'example.test'), true)
  assert.equal(targetMatchesDomain('example.test', 'www.example.test'), true)
  assert.equal(targetMatchesDomain('example.test', 'notexample.test'), false)
  assert.equal(targetMatchesDomain('www.example.test', 'example.test'), false)
})

test('creates stable provider-neutral configurations and immutable task runs', () => {
  const db = testDatabase()
  const config = configuration(db)
  const same = getOrCreateRankTrackingConfiguration(
    {
      projectId: 'project-1',
      keywordSetId: 'set-1',
      targetDomain: 'https://example.test/path',
      market: MARKET,
      devices: ['mobile', 'desktop'],
      provider: 'dataforseo',
      collectionMethod: 'queued',
      cadence: 'weekly',
      depth: 50,
      keywordLimit: 100,
    },
    { database: db },
  )
  assert.equal(same.id, config.id)
  assert.deepEqual(config.market, {
    searchEngine: 'google',
    countryCode: 'GB',
    languageCode: 'en',
    location: { name: 'London,England,United Kingdom' },
  })

  const run = startRankTrackingRun(
    {
      configuration: config,
      keywords: [
        { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
        { keyword: 'Beta service', normalizedKeyword: 'beta service' },
      ],
    },
    { database: db, id: ids('run') },
  )
  assert.equal(run.taskCount, 4)
  assert.equal(rankTrackingTasks(run.id, undefined, { database: db }).length, 4)
  assert.equal(activeRankTrackingRun(config.id, { database: db })?.id, run.id)

  const resumed = startRankTrackingRun(
    {
      configuration: config,
      keywords: [{ keyword: 'Changed', normalizedKeyword: 'changed' }],
    },
    { database: db, id: ids('other') },
  )
  assert.equal(resumed.id, run.id)
  assert.equal(resumed.taskCount, 4)
})

test('stores explicit observed and not-observed states and finds prior runs', () => {
  const db = testDatabase()
  const config = configuration(db)
  const makeIds = ids('history')
  const first = startRankTrackingRun(
    {
      configuration: config,
      keywords: [
        { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
      ],
      scheduledFor: new Date('2026-07-21T09:00:00.000Z'),
    },
    { database: db, id: makeIds },
  )
  for (const [index, task] of rankTrackingTasks(first.id, undefined, {
    database: db,
  }).entries()) {
    saveRankObservation(observation(task, index === 0 ? 4 : null), {
      database: db,
    })
  }
  assert.equal(activeRankTrackingRun(config.id, { database: db }), null)
  assert.deepEqual(
    rankObservations(first.id, { database: db }).map((item) => item.state),
    ['observed', 'not_observed_within_depth'],
  )

  const second = startRankTrackingRun(
    {
      configuration: config,
      keywords: [
        { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
      ],
      scheduledFor: new Date('2026-07-28T09:00:00.000Z'),
    },
    { database: db, id: makeIds },
  )
  assert.equal(
    priorComparableRankTrackingRun(config.id, second.id, { database: db })?.id,
    first.id,
  )
})

test('a terminal partial run records completion and does not block the next run', () => {
  const db = testDatabase()
  const config = configuration(db)
  const makeIds = ids('partial')
  const first = startRankTrackingRun(
    {
      configuration: config,
      keywords: [
        { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
      ],
      scheduledFor: new Date('2026-07-21T09:00:00.000Z'),
    },
    { database: db, id: makeIds },
  )
  const [completed, failed] = rankTrackingTasks(first.id, undefined, {
    database: db,
  })
  assert.ok(completed)
  assert.ok(failed)
  saveRankObservation(observation(completed, 4), { database: db })
  failRankTrackingTask(
    { taskId: failed.id, code: 'REMOTE', message: 'Fixture failure.' },
    { database: db },
  )
  const terminal = getRankTrackingRun(first.id, { database: db })
  assert.equal(terminal.state, 'partial')
  assert.ok(terminal.completedAt)
  assert.equal(activeRankTrackingRun(config.id, { database: db }), null)

  const second = startRankTrackingRun(
    {
      configuration: config,
      keywords: [
        { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
      ],
      scheduledFor: new Date('2026-07-28T09:00:00.000Z'),
    },
    { database: db, id: makeIds },
  )
  assert.notEqual(second.id, first.id)
})

test('bounds retained history and reports deterministic logical storage', () => {
  const db = testDatabase()
  const config = configuration(db)
  const makeIds = ids('retention')
  for (let index = 0; index < 91; index += 1) {
    const run = startRankTrackingRun(
      {
        configuration: config,
        keywords: [
          { keyword: 'Alpha service', normalizedKeyword: 'alpha service' },
        ],
        scheduledFor: new Date(Date.UTC(2026, 0, index + 1)),
      },
      { database: db, id: makeIds },
    )
    const tasks = rankTrackingTasks(run.id, undefined, { database: db })
    assert.equal(tasks.length, 2)
    for (const task of tasks) {
      saveRankObservation(observation(task, 5), { database: db })
    }
  }
  const count = db
    .prepare(
      'SELECT COUNT(*) AS count FROM rank_tracking_runs WHERE config_id = ?',
    )
    .get(config.id) as { count: number }
  assert.equal(count.count, 90)
  assert.ok(rankTrackingLogicalBytes(db) > 0)
})
