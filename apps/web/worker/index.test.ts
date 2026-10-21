import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TELEMETRY_AGENTS as CLIENT_AGENTS,
  TELEMETRY_ERROR_CATEGORIES as CLIENT_ERROR_CATEGORIES,
  TELEMETRY_EVENTS as CLIENT_EVENTS,
  TELEMETRY_FAILURE_CONTEXTS as CLIENT_FAILURE_CONTEXTS,
  TELEMETRY_FAILURE_REASONS as CLIENT_FAILURE_REASONS,
  TELEMETRY_OPERATIONS as CLIENT_OPERATIONS,
  TELEMETRY_SCHEMA_VERSION as CLIENT_SCHEMA_VERSION,
} from '@seo/core'
import {
  app,
  handleTelemetryIngest,
  TELEMETRY_AGENTS,
  TELEMETRY_ERROR_CATEGORIES,
  TELEMETRY_EVENTS,
  TELEMETRY_FAILURE_CONTEXTS,
  TELEMETRY_FAILURE_REASONS,
  TELEMETRY_OPERATIONS,
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

const validFailurePayload = {
  ...validPayload,
  event: 'audit_failed',
  schema: 2,
  errorCategory: 'database',
  failureReason: 'database_unique_constraint',
  failureContext: 'crawl_pages_run_id_url',
}

test('schema 2 sender and receiver allowlists stay identical', () => {
  assert.equal(CLIENT_SCHEMA_VERSION, 2)
  assert.deepEqual(CLIENT_AGENTS, TELEMETRY_AGENTS)
  assert.deepEqual(CLIENT_EVENTS, TELEMETRY_EVENTS)
  assert.deepEqual(CLIENT_ERROR_CATEGORIES, TELEMETRY_ERROR_CATEGORIES)
  assert.deepEqual(CLIENT_FAILURE_REASONS, TELEMETRY_FAILURE_REASONS)
  assert.deepEqual(CLIENT_FAILURE_CONTEXTS, TELEMETRY_FAILURE_CONTEXTS)
  assert.deepEqual(CLIENT_OPERATIONS, TELEMETRY_OPERATIONS)
})

test('ingest schema accepts only fixed anonymous fields', () => {
  assert.equal(validateTelemetryPayload(validPayload), true)
  assert.equal(validateTelemetryPayload({ ...validPayload, schema: 2 }), true)
  assert.equal(
    validateTelemetryPayload({
      ...validPayload,
      schema: 2,
      os: 'hosted',
      arch: 'hosted',
      node: '0',
    }),
    true,
  )
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
  assert.equal(validateTelemetryPayload(validFailurePayload), true)
  assert.equal(
    validateTelemetryPayload({
      ...validFailurePayload,
      event: 'command_failed',
      report: undefined,
      operation: 'auth',
    }),
    true,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validFailurePayload,
      message: 'UNIQUE constraint failed: private table and values',
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validFailurePayload,
      failureReason: undefined,
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validFailurePayload,
      failureReason: 'internal_error',
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validFailurePayload,
      event: 'command_failed',
      report: undefined,
      operation: 'private-project-name',
    }),
    false,
  )
  assert.equal(
    validateTelemetryPayload({
      ...validPayload,
      event: 'audit_failed',
      errorCategory: 'database',
    }),
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
    '2026-07-16',
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
    null,
    null,
    null,
  ])
})

test('schema 2 ingest writes fixed failure classifications without raw errors', async () => {
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
    body: JSON.stringify(validFailurePayload),
  })

  const response = await handleTelemetryIngest(
    request,
    env,
    new Date('2026-08-09T12:00:00Z'),
  )

  assert.equal(response.status, 204)
  assert.deepEqual(statements[0]?.values, [
    '2026-08',
    '2026-08-09',
    'audit_failed',
    '0.2.5',
    'codex',
    'darwin',
    'arm64',
    '22',
    '2026-W29',
    2,
    'database',
    'site-crawl',
    'database_unique_constraint',
    'crawl_pages_run_id_url',
    null,
  ])
})

test('Hono preserves API method errors, API 404s, and static asset fallback', async () => {
  const assetRequests: string[] = []
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        assetRequests.push(request.url)
        return new Response('static asset')
      },
    },
  }
  const context = { waitUntil() {} }

  const telemetry = await app.fetch(
    new Request('https://seoskill.dev/api/t'),
    env as never,
    context as never,
  )
  const stats = await app.fetch(
    new Request('https://seoskill.dev/api/stats', { method: 'POST' }),
    env as never,
    context as never,
  )
  const toolRoutes = [
    'llms-txt',
    'sitemap-extractor',
    'sitemap-validator',
    'robots-txt',
    'serp-preview',
    'favicon-checker',
    'domain-age',
    'open-graph',
    'spam-score',
    'domain-rating',
    'website-traffic',
  ]
  const toolResponses = await Promise.all(
    toolRoutes.map((route) =>
      app.fetch(
        new Request(`https://seoskill.dev/api/tools/${route}`),
        env as never,
        context as never,
      ),
    ),
  )
  const missing = await app.fetch(
    new Request('https://seoskill.dev/api/missing'),
    env as never,
    context as never,
  )
  const asset = await app.fetch(
    new Request('https://seoskill.dev/tools'),
    env as never,
    context as never,
  )

  assert.equal(telemetry.status, 405)
  assert.equal(stats.status, 405)
  assert.deepEqual(
    toolResponses.map((response) => response.status),
    toolRoutes.map(() => 405),
  )
  assert.equal(missing.status, 404)
  assert.equal(await asset.text(), 'static asset')
  assert.deepEqual(assetRequests, ['https://seoskill.dev/tools'])
})
