import assert from 'node:assert/strict'
import test from 'node:test'
import { allowLocalTurnstileTest } from './paid-tool-routes.ts'

test('enables the official Turnstile test response only on localhost', () => {
  assert.equal(
    allowLocalTurnstileTest(
      new Request('http://localhost:8787/api/tools/spam-score'),
    ),
    true,
  )
  assert.equal(
    allowLocalTurnstileTest(
      new Request('http://127.0.0.1:8787/api/tools/spam-score'),
    ),
    true,
  )
  assert.equal(
    allowLocalTurnstileTest(
      new Request('https://seoskill.dev/api/tools/spam-score'),
    ),
    false,
  )
})
