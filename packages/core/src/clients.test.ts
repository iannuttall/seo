import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import {
  deleteClient,
  removeClientAnalyticsConnection,
  saveClient,
  updateClient,
} from './clients.js'
import { readConfig } from './storage/config.js'

let configDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'seo-clients-test-'))
  previousConfigDir = process.env.SEO_CONFIG_DIR
  process.env.SEO_CONFIG_DIR = configDir
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env.SEO_CONFIG_DIR
  } else {
    process.env.SEO_CONFIG_DIR = previousConfigDir
  }
  rmSync(configDir, { recursive: true, force: true })
})

test('deleting the default project clears the orphaned default site', () => {
  saveClient({
    id: 'example',
    name: 'Example',
    siteUrl: 'sc-domain:example.com',
    isDefault: true,
  })
  assert.equal(readConfig().defaultSite, 'sc-domain:example.com')

  assert.equal(deleteClient('example'), true)

  const config = readConfig()
  assert.equal(config.defaultSite, undefined)
  assert.equal(config.clients.length, 0)
})

test('removing Google Analytics also removes its saved account', () => {
  saveClient({
    id: 'remove-google-analytics',
    name: 'Remove Google Analytics',
    siteUrl: 'sc-domain:example.com',
    googleAccounts: {
      searchConsole: 'search@example.com',
      googleAnalytics: 'analytics@example.com',
    },
    analytics: {
      selected: 'google',
      google: { propertyId: '123' },
    },
  })

  const client = removeClientAnalyticsConnection(
    'remove-google-analytics',
    'google',
  )

  assert.deepEqual(client.googleAccounts, {
    searchConsole: 'search@example.com',
  })
  assert.equal(client.analytics.google, undefined)
})

test('updating one project field preserves every omitted field', () => {
  saveClient({
    id: 'example',
    name: 'Example',
    siteUrl: 'sc-domain:example.com',
    startUrl: 'https://example.com/',
    watchUrls: ['https://example.com/pricing'],
    brandTerms: ['example'],
    analytics: { google: { propertyId: '123' } },
    technicalWeekday: 3,
    isDefault: true,
  })

  const updated = updateClient('example', { name: 'Example site' })

  assert.equal(updated.name, 'Example site')
  assert.equal(updated.siteUrl, 'sc-domain:example.com')
  assert.equal(updated.startUrl, 'https://example.com/')
  assert.deepEqual(updated.watchUrls, ['https://example.com/pricing'])
  assert.deepEqual(updated.brandTerms, ['example'])
  assert.equal(updated.analytics.google?.propertyId, '123')
  assert.equal(updated.technicalWeekday, 3)
  assert.equal(updated.isDefault, true)
})

test('detaching Clicky preserves Google Analytics and selects it again', () => {
  saveClient({
    id: 'example',
    name: 'Example',
    siteUrl: 'sc-domain:example.com',
    analytics: {
      selected: 'clicky',
      google: { propertyId: '123' },
      clicky: { siteId: '456' },
    },
  })

  const updated = removeClientAnalyticsConnection('example', 'clicky')

  assert.deepEqual(updated.analytics, {
    selected: 'google',
    google: { propertyId: '123' },
  })
})
