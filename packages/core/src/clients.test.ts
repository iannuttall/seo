import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import {
  analyticsConnection,
  bingWebmasterSiteUrl,
  deleteClient,
  getClient,
  removeClientAnalyticsConnection,
  saveClient,
  setClientAnalyticsConnection,
  setClientBingSite,
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

test('deleting one project keeps the default site another project still uses', () => {
  saveClient({
    id: 'first',
    name: 'First',
    siteUrl: 'sc-domain:example.com',
    isDefault: true,
  })
  saveClient({
    id: 'second',
    name: 'Second',
    siteUrl: 'sc-domain:example.com',
  })

  assert.equal(deleteClient('first'), true)

  const config = readConfig()
  assert.equal(config.defaultSite, 'sc-domain:example.com')
  assert.equal(config.clients.length, 1)
})

test('saving a Bing site preserves the rest of the project profile', () => {
  saveClient({
    id: 'example',
    name: 'Example',
    siteUrl: 'sc-domain:example.com',
    startUrl: 'https://example.com/',
    analytics: { google: { propertyId: '123' } },
  })

  const client = setClientBingSite('example', 'https://example.com/')
  assert.equal(bingWebmasterSiteUrl(client), 'https://example.com/')
  assert.equal(client.startUrl, 'https://example.com/')
  assert.equal(client.analytics.google?.propertyId, '123')
  assert.equal(
    bingWebmasterSiteUrl(getClient('example')),
    'https://example.com/',
  )
})

test('Clicky can be selected as the project analytics connection', () => {
  const client = saveClient({
    id: 'clicky-example',
    name: 'Clicky Example',
    siteUrl: 'sc-domain:example.com',
    analytics: {
      selected: 'clicky',
      clicky: { siteId: '123' },
      google: { propertyId: '456' },
    },
  })

  assert.deepEqual(analyticsConnection(client), {
    provider: 'clicky',
    siteId: '123',
  })
})

test('an installed provider can be selected without changing the profile schema again', () => {
  const client = saveClient({
    id: 'fathom-example',
    name: 'Fathom Example',
    siteUrl: 'sc-domain:example.com',
    analytics: {
      selected: 'extension:fathom',
      extensions: {
        fathom: { account: { siteId: 'ABCDEFG' } },
      },
      google: { propertyId: '456' },
    },
  })

  assert.deepEqual(analyticsConnection(client), {
    provider: 'extension',
    providerId: 'fathom',
    account: { siteId: 'ABCDEFG' },
  })
})

test('attaching and detaching an installed provider preserves Google Analytics', () => {
  saveClient({
    id: 'extension-update',
    name: 'Extension update',
    siteUrl: 'sc-domain:example.com',
    analytics: { google: { propertyId: '123' } },
  })
  const attached = setClientAnalyticsConnection('extension-update', {
    provider: 'extension',
    providerId: 'fathom',
    account: { siteId: 'ABCDEFG' },
  })
  assert.equal(attached.analytics.selected, 'extension:fathom')
  assert.deepEqual(attached.analytics.extensions, {
    fathom: { account: { siteId: 'ABCDEFG' } },
  })

  const detached = removeClientAnalyticsConnection(
    'extension-update',
    'extension:fathom',
  )
  assert.deepEqual(detached.analytics, {
    selected: 'google',
    google: { propertyId: '123' },
  })
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
    searchEngines: { bing: { siteUrl: 'https://example.com/' } },
    reportDay: 12,
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
  assert.equal(updated.searchEngines?.bing?.siteUrl, 'https://example.com/')
  assert.equal(updated.reportDay, 12)
  assert.equal(updated.technicalWeekday, 3)
  assert.equal(updated.isDefault, true)
})

test('attaching Clicky selects it without dropping other project data', () => {
  saveClient({
    id: 'example',
    name: 'Example',
    siteUrl: 'sc-domain:example.com',
    startUrl: 'https://example.com/',
    analytics: { google: { propertyId: '123' } },
    searchEngines: { bing: { siteUrl: 'https://example.com/' } },
  })

  const updated = setClientAnalyticsConnection('example', {
    provider: 'clicky',
    siteId: '456',
  })

  assert.deepEqual(updated.analytics, {
    selected: 'clicky',
    google: { propertyId: '123' },
    clicky: { siteId: '456' },
  })
  assert.equal(updated.siteUrl, 'sc-domain:example.com')
  assert.equal(updated.startUrl, 'https://example.com/')
  assert.equal(updated.searchEngines?.bing?.siteUrl, 'https://example.com/')
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
