import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from 'citty'
import {
  defaultTrueBooleanArg,
  renderingModeArg,
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

test('rendering modes keep --js as the on alias', () => {
  assert.equal(renderingModeArg({}), 'auto')
  assert.equal(renderingModeArg({ rendering: 'off' }), 'off')
  assert.equal(renderingModeArg({ rendering: 'on' }), 'on')
  assert.equal(renderingModeArg({ js: true }), 'on')
  assert.throws(
    () => renderingModeArg({ rendering: 'off', js: true }),
    /Use either --js or --rendering on/,
  )
  assert.throws(
    () => renderingModeArg({ rendering: 'sometimes' }),
    /--rendering must be auto, on, or off/,
  )
})
