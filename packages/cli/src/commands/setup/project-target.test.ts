import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClientProfile } from '@seo/core'
import {
  chooseSetupProjectTarget,
  nextAvailableProjectId,
  setupProjectOptions,
} from './project-target.js'

function project(input: {
  id: string
  name: string
  siteUrl: string
}): ClientProfile {
  return {
    ...input,
    watchUrls: [],
    brandTerms: [],
    analytics: {},
    createdAt: 1,
    updatedAt: 1,
  }
}

const existing = project({
  id: 'existing',
  name: 'Existing site',
  siteUrl: 'sc-domain:existing.example',
})

test('setup lists create, every existing project, and profile-free use', () => {
  assert.deepEqual(setupProjectOptions([existing]), [
    {
      value: '__create_project__',
      label: 'Create a new project',
      hint: 'Save a separate site and its data sources',
    },
    {
      value: 'existing',
      label: 'Update Existing site',
      hint: 'existing, sc-domain:existing.example',
    },
    {
      value: '__skip_project__',
      label: 'Continue without a project profile',
      hint: 'Pass --site or --url when you run reports',
    },
  ])
})

test('an explicit existing id updates only that project', async () => {
  const target = await chooseSetupProjectTarget({
    clients: [existing],
    interactive: false,
    requestedId: 'existing',
  })
  assert.equal(target.mode, 'update')
  if (target.mode === 'update') assert.equal(target.client.id, 'existing')
})

test('an explicit new id creates a separate project', async () => {
  assert.deepEqual(
    await chooseSetupProjectTarget({
      clients: [existing],
      interactive: false,
      requestedId: 'new-site',
    }),
    { mode: 'create', requestedId: 'new-site' },
  )
})

test('a requested id that normalizes to an existing id updates it', async () => {
  const target = await chooseSetupProjectTarget({
    clients: [existing],
    interactive: false,
    requestedId: 'Existing!',
  })
  assert.equal(target.mode, 'update')
  if (target.mode === 'update') assert.equal(target.client.id, 'existing')
})

test('interactive setup updates only the project selected by the user', async () => {
  const target = await chooseSetupProjectTarget({
    clients: [existing],
    interactive: true,
    prompt: async () => 'existing',
  })
  assert.equal(target.mode, 'update')
  if (target.mode === 'update') {
    assert.equal(target.client.siteUrl, 'sc-domain:existing.example')
  }
})

test('interactive setup can explicitly create a separate project', async () => {
  assert.deepEqual(
    await chooseSetupProjectTarget({
      clients: [existing],
      interactive: true,
      prompt: async () => '__create_project__',
    }),
    { mode: 'create' },
  )
})

test('new projects never overwrite a colliding derived id', () => {
  const clients = [
    existing,
    project({
      id: 'existing-2',
      name: 'Existing copy',
      siteUrl: 'sc-domain:copy.example',
    }),
  ]
  assert.equal(nextAvailableProjectId('Existing', clients), 'existing-3')
})
