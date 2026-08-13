import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  providerPackageManifestSchema,
  providerRegistrationSchema,
} from './contracts.js'

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

test('action-only providers can extend the agent without a core capability', () => {
  const provider = {
    id: 'fixture',
    displayName: 'Fixture',
    description: 'Add fixture data.',
    kinds: ['other'],
    connection: {
      fields: [],
      async verify() {},
    },
    capabilities: [],
    actions: [
      {
        id: 'inspect-domain',
        description: 'Inspect one domain.',
        inputSchema: {
          type: 'object',
          properties: { domain: { type: 'string' } },
          required: ['domain'],
        },
        outputSchema: { type: 'object' },
        async run() {
          return {}
        },
      },
    ],
  }
  assert.equal(providerRegistrationSchema.safeParse(provider).success, true)
  assert.equal(
    providerRegistrationSchema.safeParse({
      ...provider,
      actions: [],
    }).success,
    false,
  )
})

test('provider actions need supported JSON schemas with object inputs', () => {
  const action = {
    id: 'inspect-domain',
    description: 'Inspect one domain.',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    async run() {
      return {}
    },
  }
  const provider = {
    id: 'fixture',
    displayName: 'Fixture',
    description: 'Add fixture data.',
    kinds: ['other'],
    connection: {
      fields: [{ id: 'apiKey', label: 'API key', kind: 'secret' }],
      async verify() {},
    },
    capabilities: [],
    actions: [action],
  }
  assert.equal(providerRegistrationSchema.safeParse(provider).success, true)
  assert.equal(
    providerRegistrationSchema.safeParse({
      ...provider,
      actions: [{ ...action, inputSchema: { type: 'string' } }],
    }).success,
    false,
  )
  assert.equal(
    providerRegistrationSchema.safeParse({
      ...provider,
      actions: [{ ...action, outputSchema: { type: 'unknown' } }],
    }).success,
    false,
  )
})
