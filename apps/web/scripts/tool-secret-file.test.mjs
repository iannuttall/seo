import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invalidRequiredSecretNames,
  parseEnv,
  setEnvValue,
} from './tool-secret-file.mjs'

test('required secret validation rejects missing values and placeholders', () => {
  const values = parseEnv('READY=secret\nPLACEHOLDER=replace-with-value\n')
  assert.deepEqual(
    invalidRequiredSecretNames(values, ['READY', 'PLACEHOLDER', 'ABSENT']),
    ['PLACEHOLDER', 'ABSENT'],
  )
})

test('setting a secret replaces its value without exposing it elsewhere', () => {
  const source = '# comment\nTOKEN=replace-with-token\nOTHER=keep\n'
  assert.equal(
    setEnvValue(source, 'TOKEN', 'value with spaces'),
    '# comment\nTOKEN="value with spaces"\nOTHER=keep\n',
  )
})
