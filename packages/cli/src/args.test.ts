import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from 'citty'
import { defaultTrueBooleanArg } from './args.js'

const args = {
  'verify-content': defaultTrueBooleanArg(
    'Verify page content.',
    'Skip page content verification.',
  ),
  project: { type: 'string' as const },
}

test('default-true flags support Citty negation', () => {
  assert.equal(parseArgs([], args)['verify-content'], true)
  assert.equal(
    parseArgs(['--no-verify-content'], args)['verify-content'],
    false,
  )
})

test('string flags preserve hyphen-prefixed values', () => {
  assert.equal(parseArgs(['--project', '-staging'], args).project, '-staging')
})
