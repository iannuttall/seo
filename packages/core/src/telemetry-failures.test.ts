import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from './errors.js'
import { classifyTelemetryFailure } from './telemetry-failures.js'

test('product errors map to fixed failure classifications', () => {
  const cases = [
    ['ACCESS_DENIED', 'auth', 'access_denied'],
    ['AUTH_CONFIG_REQUIRED', 'auth', 'auth_config_required'],
    ['AUTH_EXPIRED', 'auth', 'auth_expired'],
    ['AUTH_REQUIRED', 'auth', 'auth_required'],
    ['INSUFFICIENT_DATA', 'data', 'insufficient_data'],
    ['INVALID_INPUT', 'config', 'invalid_input'],
    [
      'OPTIONAL_PROVIDER_UNAVAILABLE',
      'network',
      'optional_provider_unavailable',
    ],
    ['PROPERTY_NOT_FOUND', 'config', 'property_not_found'],
    ['PROVIDER_UNAVAILABLE', 'network', 'provider_unavailable'],
    ['RATE_LIMITED', 'network', 'rate_limited'],
    ['INTERNAL_ERROR', 'internal', 'internal_error'],
  ] as const

  for (const [code, errorCategory, failureReason] of cases) {
    assert.deepEqual(
      classifyTelemetryFailure(new SeoError(code, 'Private message')),
      { errorCategory, failureReason },
    )
  }
})

test('other database states keep distinct fixed reasons', () => {
  const cases = [
    ['SQLITE_CONSTRAINT_FOREIGNKEY', 'database_constraint'],
    ['SQLITE_BUSY_SNAPSHOT', 'database_locked'],
    ['SQLITE_CORRUPT_INDEX', 'database_corrupt'],
    ['SQLITE_READONLY_DBMOVED', 'database_read_only'],
  ] as const

  for (const [code, failureReason] of cases) {
    assert.deepEqual(
      classifyTelemetryFailure(Object.assign(new Error('private'), { code })),
      { errorCategory: 'database', failureReason },
    )
  }
})

test('database errors retain only an allowlisted constraint context', () => {
  assert.deepEqual(
    classifyTelemetryFailure(
      Object.assign(
        new Error(
          'UNIQUE constraint failed: crawl_pages.run_id, crawl_pages.url',
        ),
        { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' },
      ),
    ),
    {
      errorCategory: 'database',
      failureReason: 'database_unique_constraint',
      failureContext: 'crawl_pages_run_id_url',
    },
  )
  assert.deepEqual(
    classifyTelemetryFailure(
      Object.assign(
        new Error('UNIQUE constraint failed: private_table.private_column'),
        { code: 'SQLITE_CONSTRAINT_UNIQUE' },
      ),
    ),
    {
      errorCategory: 'database',
      failureReason: 'database_unique_constraint',
    },
  )
})

test('native filesystem and network errors map without their messages', () => {
  const cases = [
    ['EACCES', 'filesystem', 'filesystem_permission'],
    ['ENOENT', 'filesystem', 'filesystem_not_found'],
    ['ENOSPC', 'filesystem', 'filesystem_full'],
    ['SQLITE_FULL', 'filesystem', 'filesystem_full'],
    ['ENOTFOUND', 'network', 'network_dns'],
    ['ETIMEDOUT', 'network', 'network_timeout'],
    ['ECONNRESET', 'network', 'network_connection'],
    ['CERT_HAS_EXPIRED', 'network', 'network_tls'],
  ] as const

  for (const [code, errorCategory, failureReason] of cases) {
    assert.deepEqual(
      classifyTelemetryFailure(
        Object.assign(new Error('/Users/private/client.json'), { code }),
      ),
      { errorCategory, failureReason },
    )
  }
})

test('nested errors and CLI parser failures keep their fixed reasons', () => {
  assert.deepEqual(
    classifyTelemetryFailure({
      error: { code: 'AUTH_REQUIRED', message: 'Private account detail' },
    }),
    { errorCategory: 'auth', failureReason: 'auth_required' },
  )
  assert.deepEqual(
    classifyTelemetryFailure(
      Object.assign(new Error('Unknown flag --private'), { name: 'CLIError' }),
    ),
    { errorCategory: 'config', failureReason: 'invalid_input' },
  )
  assert.deepEqual(
    classifyTelemetryFailure(
      Object.assign(new Error('Private timeout detail'), {
        name: 'AbortError',
      }),
    ),
    { errorCategory: 'crawl_timeout', failureReason: 'crawl_timeout' },
  )
})

test('classification is bounded and cannot throw on hostile error objects', () => {
  const hostile = Object.create(null, {
    code: {
      get() {
        throw new Error('private getter failure')
      },
    },
  })
  hostile.cause = hostile

  assert.deepEqual(classifyTelemetryFailure(hostile), {
    errorCategory: 'unknown',
    failureReason: 'unknown',
  })
})
