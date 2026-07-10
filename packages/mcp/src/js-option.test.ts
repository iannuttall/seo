import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveJsOption } from './input-schemas.js'

test('resolveJsOption preserves explicit booleans with an auto default', () => {
  assert.equal(resolveJsOption(true, 'auto'), true)
  assert.equal(resolveJsOption(false, 'auto'), false)
  assert.equal(resolveJsOption(undefined, 'auto'), 'auto')
})

test('resolveJsOption preserves explicit booleans with no default', () => {
  assert.equal(resolveJsOption(true, undefined), true)
  assert.equal(resolveJsOption(false, undefined), false)
  assert.equal(resolveJsOption(undefined, undefined), undefined)
})
