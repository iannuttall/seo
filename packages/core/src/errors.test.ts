import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSkippableReportError,
  SeoError,
  seoErrorEnvelope,
  toSeoError,
} from './errors.js'

test('toSeoError classifies authentication failures', () => {
  const error = toSeoError(
    new Error('Not logged in. Run `seo auth login` first.'),
  )

  assert.equal(error.code, 'AUTH_REQUIRED')
  assert.equal(error.exitCode, 3)
  assert.equal(error.retryable, false)
})

test('report fallbacks only allow declared section failures', () => {
  assert.equal(
    isSkippableReportError(
      new SeoError('INSUFFICIENT_DATA', 'Not enough daily rows.'),
    ),
    true,
  )
  assert.equal(
    isSkippableReportError(
      new SeoError(
        'OPTIONAL_PROVIDER_UNAVAILABLE',
        'Search status is unavailable.',
      ),
    ),
    true,
  )
  assert.equal(
    isSkippableReportError(
      new SeoError('AUTH_REQUIRED', 'Run `seo auth login`.'),
    ),
    false,
  )
  assert.equal(isSkippableReportError(new Error('Unexpected failure.')), false)
})

test('seoErrorEnvelope returns a stable agent error contract', () => {
  assert.deepEqual(
    seoErrorEnvelope(new SeoError('RATE_LIMITED', 'Try again later.')),
    {
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Try again later.',
        retryable: true,
      },
    },
  )
})
