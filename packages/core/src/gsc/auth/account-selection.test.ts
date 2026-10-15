import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { saveClient } from '../../clients.js'
import { selectGoogleAccounts } from './account-context.js'
import { searchConsoleAccountForSite } from './account-selection.js'

let configDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'seo-google-account-selection-'))
  previousConfigDir = process.env.SEO_CONFIG_DIR
  process.env.SEO_CONFIG_DIR = configDir
})

afterEach(() => {
  selectGoogleAccounts(undefined)
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  rmSync(configDir, { recursive: true, force: true })
})

test('rejects ambiguous resource matching across project accounts', () => {
  for (const account of ['first@example.com', 'second@example.com']) {
    saveClient({
      id: account.split('@')[0],
      name: account,
      siteUrl: 'sc-domain:example.com',
      googleAccounts: { searchConsole: account },
    })
  }

  assert.throws(
    () => searchConsoleAccountForSite('sc-domain:example.com'),
    /different Google accounts/,
  )
})

test('a selected project account resolves an otherwise ambiguous resource', () => {
  for (const account of ['first@example.com', 'second@example.com']) {
    saveClient({
      id: account.split('@')[0],
      name: account,
      siteUrl: 'sc-domain:example.com',
      googleAccounts: { searchConsole: account },
    })
  }
  selectGoogleAccounts({ searchConsole: 'second@example.com' })

  assert.equal(
    searchConsoleAccountForSite('sc-domain:example.com'),
    'second@example.com',
  )
})
