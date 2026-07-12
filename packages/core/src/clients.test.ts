import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { deleteClient, saveClient } from './clients.js'
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
