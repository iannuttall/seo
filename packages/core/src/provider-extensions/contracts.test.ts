import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerPackageManifestSchema } from './contracts.js'

test('provider manifests reject traversal and unsupported entry points', () => {
  assert.deepEqual(
    providerPackageManifestSchema.parse({
      apiVersion: 1,
      providers: ['./dist/index.js'],
    }),
    { apiVersion: 1, providers: ['./dist/index.js'] },
  )
  assert.equal(
    providerPackageManifestSchema.safeParse({
      apiVersion: 1,
      providers: ['../outside.js'],
    }).success,
    false,
  )
  assert.equal(
    providerPackageManifestSchema.safeParse({
      apiVersion: 1,
      providers: ['./src/index.ts'],
    }).success,
    false,
  )
})
