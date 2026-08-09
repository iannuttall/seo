import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '@seo/core'
import { buildErrorFeedbackUrl, telemetryOperation } from './error-feedback.js'

test('failure feedback contains fixed diagnostics and no raw error details', () => {
  const privateMessage =
    'UNIQUE constraint failed: crawl_pages.run_id, crawl_pages.url for https://private.example'
  const url = buildErrorFeedbackUrl({
    args: ['technical-watch', '--project', 'private-client'],
    error: Object.assign(new Error(privateMessage), {
      code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
    }),
    nodeVersion: 'v22.19.0',
    processArch: 'arm64',
    processPlatform: 'darwin',
    report: 'technical-watch',
    version: '0.2.31',
  })

  assert.ok(url)
  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://github.com')
  assert.equal(parsed.pathname, '/iannuttall/seo/issues/new')
  assert.equal(parsed.searchParams.get('template'), 'bug.yml')
  assert.equal(
    parsed.searchParams.get('title'),
    'bug: seo technical-watch failed',
  )
  assert.equal(parsed.searchParams.get('version'), '0.2.31')
  assert.equal(parsed.searchParams.get('runtime'), 'Node 22 on darwin (arm64)')
  assert.equal(
    parsed.searchParams.get('diagnostics'),
    'INTERNAL_ERROR | database | database_unique_constraint | crawl_pages_run_id_url',
  )
  assert.equal(url.includes('private.example'), false)
  assert.equal(url.includes('private-client'), false)
  assert.equal(url.includes('crawl_pages.run_id'), false)
})

test('expected user and provider failures do not suggest filing a bug', () => {
  for (const error of [
    new SeoError('INVALID_INPUT', 'Pass a URL.'),
    new SeoError('AUTH_REQUIRED', 'Sign in.'),
    new SeoError('RATE_LIMITED', 'Try later.'),
  ]) {
    assert.equal(buildErrorFeedbackUrl({ args: ['auth'], error }), undefined)
  }
})

test('command telemetry accepts only fixed top-level operations', () => {
  assert.equal(telemetryOperation(['auth', 'status']), 'auth')
  assert.equal(telemetryOperation(['private-project-name']), undefined)
  assert.equal(telemetryOperation([]), undefined)
})
