import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateStats,
  handleTelemetryIngest,
  validateTelemetryPayload,
} from './index.ts'

const validPayload = {
  event: 'audit_complete',
  version: '0.2.5',
  agent: 'codex',
  os: 'darwin',
  arch: 'arm64',
  node: '22',
  cohort: '2026-W29',
  schema: 1,
  report: 'site-crawl',
}

test('ingest schema accepts only fixed anonymous fields', () => {
  assert.equal(validateTelemetryPayload(validPayload), true)
  assert.equal(
    validateTelemetryPayload({
      ...validPayload,
      url: 'https://private.example',
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validPayload,
      report: 'https://private.example/report',
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validPayload,
      event: 'first_run',
      report: undefined,
    }),
    true,
  )
  assert.equal(
    validateTelemetryPayload({ ...validPayload, event: 'audit_failed' }),
    false,
  )
})

test('ingest writes only the documented anonymous fields to D1', async () => {
  const statements: Array<{ query: string; values: unknown[] }> = []
  const env = {
    TELEMETRY_DB: {
      prepare(query: string) {
        const statement = {
          values: [] as unknown[],
          bind(...values: unknown[]) {
            this.values = values
            return this
          },
          async run() {
            statements.push({ query, values: this.values })
          },
        }
        return statement
      },
    },
  } satisfies Parameters<typeof handleTelemetryIngest>[1]
  const request = new Request('https://seoskill.dev/api/t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validPayload),
  })

  const response = await handleTelemetryIngest(
    request,
    env,
    new Date('2026-07-16T12:00:00Z'),
  )
  assert.equal(response.status, 204)
  assert.equal(statements.length, 1)
  assert.match(statements[0]?.query ?? '', /^INSERT INTO telemetry_events/)
  assert.deepEqual(statements[0]?.values, [
    '2026-07',
    'audit_complete',
    '0.2.5',
    'codex',
    'darwin',
    'arm64',
    '22',
    '2026-W29',
    1,
    null,
    'site-crawl',
  ])
})

test('stats aggregate installs, reports, agents, and complete d7 cohorts', () => {
  const stats = aggregateStats(
    {
      events: [
        { event: 'first_run', count: 10, first_month: '2026-06' },
        { event: 'setup_complete', count: 8 },
        { event: 'first_audit_complete', count: 6 },
        { event: 'audit_start', count: 22 },
        { event: 'audit_complete', count: 20 },
        { event: 'audit_failed', count: 2 },
      ],
      month: [{ count: 7 }],
      agents: [
        { event: 'first_run', agent: 'codex', count: 6 },
        { event: 'first_run', agent: 'claude-code', count: 4 },
        { event: 'audit_start', agent: 'codex', count: 16 },
        { event: 'audit_start', agent: 'claude-code', count: 6 },
      ],
      cohorts: [
        { event: 'first_run', cohort: '2026-W25', count: 10 },
        { event: 'active_d7', cohort: '2026-W25', count: 4 },
      ],
      reports: [
        { report: 'site-crawl', count: 12 },
        { report: 'quick-wins', count: 8 },
      ],
    },
    new Date('2026-07-16T12:00:00Z'),
  )

  assert.equal(stats.totals.firstAuditConversionPercent, 60)
  assert.deepEqual(stats.window, {
    kind: 'all_time',
    firstMonth: '2026-06',
    currentMonth: '2026-07',
  })
  assert.equal(stats.totals.auditsStarted, 22)
  assert.equal(stats.totals.auditsThisMonth, 7)
  assert.deepEqual(stats.agents.installs[0], {
    agent: 'codex',
    count: 6,
    percent: 60,
  })
  assert.deepEqual(stats.retentionD7[0], {
    cohort: '2026-W25',
    installs: 10,
    retained: 4,
    percent: 40,
    complete: true,
  })
  assert.deepEqual(stats.reports.slice(0, 2), [
    { report: 'site-crawl', count: 12 },
    { report: 'quick-wins', count: 8 },
  ])
})
