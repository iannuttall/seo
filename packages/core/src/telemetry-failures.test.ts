import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyTelemetryFailure } from './telemetry-failures.js'

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
