import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  invalidRequiredSecretNames,
  parseEnv,
  setEnvValue,
} from './tool-secret-file.mjs'

const appRoot = resolve(import.meta.dirname, '..')

test('production secret files parse quoted and unquoted values', () => {
  const values = parseEnv('PLAIN=value\nQUOTED="value with spaces"\n')
  assert.equal(values.get('PLAIN'), 'value')
  assert.equal(values.get('QUOTED'), 'value with spaces')
})

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

test('the production template covers every required secret with placeholders', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(appRoot, 'env-manifest.json'), 'utf8'),
  )
  const values = parseEnv(
    readFileSync(resolve(appRoot, '.dev.vars.production.example'), 'utf8'),
  )

  assert.deepEqual([...values.keys()], manifest.requiredRemote)
  assert.deepEqual(
    invalidRequiredSecretNames(values, manifest.requiredRemote),
    manifest.requiredRemote,
  )
})
