import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClientProfile } from '@seo/core'
import { nextAvailableProjectId } from './project-target.js'

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
