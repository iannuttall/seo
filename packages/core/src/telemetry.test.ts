import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  buildTelemetryPayload,
  detectTelemetryAgent,
  getTelemetryStatus,
  initializeTelemetry,
  isoWeek,
  setTelemetryEnabled,
  TELEMETRY_NOTICE,
  type TelemetryOptions,
  type TelemetryPayload,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
  trackTelemetrySetupComplete,
} from './telemetry.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function fixture(input: { env?: NodeJS.ProcessEnv; now?: Date } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'seo-telemetry-'))
  directories.push(directory)
  const stateFile = join(directory, 'telemetry.json')
  const payloads: TelemetryPayload[] = []
  const notices: string[] = []
  const options: TelemetryOptions = {
    agent: 'codex',
    env: input.env ?? {},
    fetch: async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 204 })
    },
    nodeVersion: 'v22.19.0',
    notice: (message) => notices.push(message),
    now: input.now ?? new Date('2026-07-16T09:12:00Z'),
    processArch: 'arm64',
    processPlatform: 'darwin',
    stateFile,
    version: '0.2.5',
  }
  return { notices, options, payloads, stateFile }
}

test('ISO cohorts use week-level UTC dates', () => {
  assert.equal(isoWeek(new Date('2026-07-16T09:12:00Z')), '2026-W29')
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53')
})

test('first run writes private local state, prints notice, and sends once', () => {
  const run = fixture()
  initializeTelemetry(run.options)
  initializeTelemetry(run.options)

  assert.deepEqual(run.notices, [TELEMETRY_NOTICE])
  assert.deepEqual(
    run.payloads.map((payload) => payload.event),
    ['first_run'],
  )
  assert.deepEqual(JSON.parse(readFileSync(run.stateFile, 'utf8')), {
    telemetryEnabled: true,
    firstRunAt: '2026-07-16T09:12:00.000Z',
    cohort: '2026-W29',
    sentMilestones: ['first_run'],
  })
  assert.equal(statSync(run.stateFile).mode & 0o777, 0o600)
})

test('every disable mechanism results in zero network calls', () => {
  for (const env of [
    { DO_NOT_TRACK: '1' },
    { SEOSKILL_TELEMETRY_DISABLED: '1' },
    { SEO_TELEMETRY_DISABLED: '1' },
    { CI: 'true' },
    { GITHUB_ACTIONS: '1' },
  ]) {
    const run = fixture({ env })
    const status = initializeTelemetry(run.options)
    assert.equal(status.enabled, false)
    assert.equal(run.payloads.length, 0)
    assert.equal(run.notices.length, 0)
  }

  const run = fixture()
  setTelemetryEnabled(false, run.options)
  initializeTelemetry(run.options)
  trackTelemetryReportStart('site-crawl', run.options)
  assert.equal(run.payloads.length, 0)
  assert.equal(getTelemetryStatus(run.options).reason, 'local_setting')
})

test('retention and completion milestones fire exactly once', () => {
  const run = fixture()
  initializeTelemetry(run.options)
  trackTelemetrySetupComplete(run.options)
  trackTelemetrySetupComplete(run.options)
  trackTelemetryReportStart('site-crawl', run.options)
  trackTelemetryReportComplete('site-crawl', run.options)
  trackTelemetryReportComplete('site-crawl', run.options)

  const later = {
    ...run.options,
    now: new Date('2026-08-16T09:12:00Z'),
  }
  initializeTelemetry(later)
  initializeTelemetry(later)

  assert.deepEqual(
    run.payloads.map((payload) => payload.event),
    [
      'first_run',
      'setup_complete',
      'audit_start',
      'audit_complete',
      'first_audit_complete',
      'audit_complete',
      'active_d1',
      'active_d7',
      'active_d30',
    ],
  )
})

test('payloads contain only the public schema fields', () => {
  const run = fixture()
  const state = {
    telemetryEnabled: true,
    firstRunAt: '2026-07-16T09:12:00.000Z',
    cohort: '2026-W29',
    sentMilestones: [],
  } as const
  const payload = buildTelemetryPayload(
    'audit_failed',
    { ...state, sentMilestones: [] },
    { errorCategory: 'network', report: 'site-crawl' },
    run.options,
  )

  assert.deepEqual(payload, {
    event: 'audit_failed',
    version: '0.2.5',
    agent: 'codex',
    os: 'darwin',
    arch: 'arm64',
    node: '22',
    cohort: '2026-W29',
    schema: 1,
    errorCategory: 'network',
    report: 'site-crawl',
  })
})

test('unknown report strings never reach the transport', () => {
  const run = fixture()
  initializeTelemetry(run.options)
  run.payloads.length = 0
  trackTelemetryReportStart('https://private.example/report', run.options)
  trackTelemetryReportComplete('/Users/example/private.json', run.options)
  trackTelemetryReportFailed('unknown-report', 'unknown', run.options)
  assert.equal(run.payloads.length, 0)
})

test('sender failures never escape into the command', () => {
  const run = fixture()
  run.options.fetch = () => {
    throw new Error('fixture transport failure')
  }
  assert.doesNotThrow(() => initializeTelemetry(run.options))
  assert.doesNotThrow(() =>
    trackTelemetryReportFailed('site-crawl', 'network', run.options),
  )
})

test('sender dispatch does not wait for a pending request', () => {
  const run = fixture()
  run.options.fetch = () => new Promise(() => undefined)
  const startedAt = performance.now()
  initializeTelemetry(run.options)
  assert.ok(performance.now() - startedAt < 500)
})

test('agent detection uses MCP names before coarse environment signals', () => {
  assert.equal(
    detectTelemetryAgent({ clientName: 'Claude Desktop' }),
    'claude-code',
  )
  assert.equal(detectTelemetryAgent({ clientName: 'cursor-v2' }), 'cursor')
  assert.equal(detectTelemetryAgent({ clientName: 'codex-mcp' }), 'codex')
  assert.equal(detectTelemetryAgent({ clientName: 'other-client' }), 'unknown')
  assert.equal(
    detectTelemetryAgent({ env: { CODEX_HOME: '/tmp/codex' } }),
    'codex',
  )
  assert.equal(detectTelemetryAgent({ env: {} }), 'cli')
})
