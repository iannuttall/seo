import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from 'citty'
import {
  defaultTrueBooleanArg,
  strictFetchRateArg,
  strictNumberArg,
} from './args.js'

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

test('strict numeric flags reject invalid values instead of using defaults', () => {
  assert.equal(strictNumberArg('28', '--days'), 28)
  assert.equal(strictNumberArg(undefined, '--days'), undefined)
  assert.throws(
    () => strictNumberArg('later', '--days'),
    /--days must be a number/,
  )
  assert.throws(
    () => strictFetchRateArg({ 'fetch-concurrency': 'many' }),
    /--fetch-concurrency must be a number/,
  )
})
