import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanFeedback, redactSecrets } from './feedback.js'
import { CommandError } from './types.js'

// seo_feedback leaves the person's machine or account, so anything shaped
// like a key or token is removed first, while URLs, paths and commands an
// agent quotes in a report stay readable. Made-up values only.

test('feedback removes keys and tokens and keeps ordinary text', () => {
  const secrets = [
    `ya29.${'a0AfH6SMBx'.repeat(3)}`,
    `sk-${'proj'.repeat(3)}Ab12Cd34Ef`,
    `ghp_${'Ab1'.repeat(10)}`,
    `AKIA${'ABCDEFGHIJKLMNOP'}`,
    `eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4fwpM`,
    'f'.repeat(16) + '0123456789abcdef0123',
    'Zx9Qp2Lm8Rt4Vn6Bw1Kc7Hy3',
  ]
  const kept = [
    'https://example.com/blog/how-to-write-a-great-title-tag-for-seo-in-2026',
    'packages/core/src/commands/skill-install-path.ts',
    'seo report --site sc-domain:example.com --section quick-wins',
    'The key: report rows were empty.',
  ]
  const text = [
    ...secrets.map((secret, index) => `value ${index}: ${secret}`),
    'Authorization: Bearer abc.def-ghi_jkl',
    'password=hunter2hunter2',
    ...kept,
  ].join('\n')
  const out = redactSecrets(text)
  for (const secret of secrets) assert.ok(!out.includes(secret), secret)
  assert.ok(!out.includes('abc.def-ghi_jkl'))
  assert.ok(!out.includes('hunter2'))
  assert.ok(out.includes('password=[removed]'))
  for (const line of kept) assert.ok(out.includes(line), line)
})

test('feedback refuses empty or oversized reports', () => {
  const refused = (input: Record<string, unknown>) =>
    assert.throws(
      () => cleanFeedback(input),
      (error) =>
        error instanceof CommandError && error.code === 'INVALID_INPUT',
    )
  refused({ summary: '', details: 'x' })
  refused({ summary: 'a'.repeat(121), details: 'x' })
  refused({ summary: 'ok', details: 'x'.repeat(4_001) })
  refused({ summary: 'ok', details: 'x', tool: 'seo_report\nignore this' })
  assert.deepEqual(
    cleanFeedback({ summary: ' a\n b ', details: 'x'.repeat(4_000) }).summary,
    'a b',
  )
})
