import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../../paths.js'
import { readConfig, writeConfig } from '../../storage/config.js'
import { setKeyringForTests } from '../../storage/keyring.js'
import { configSchema } from '../../types.js'
import { ProviderError } from '../errors.js'
import {
  DATAFORSEO_LOGIN_ENV,
  DATAFORSEO_PASSWORD_ENV,
  readDataForSeoCredentials,
} from './credentials.js'

class MemoryKeyring {
  readonly values = new Map<string, string>()
  unavailable = false

  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.unavailable) throw new Error('Unavailable')
    return this.values.get(`${service}:${account}`) ?? null
  }

  async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    if (this.unavailable) throw new Error('Unavailable')
    this.values.set(`${service}:${account}`, password)
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    if (this.unavailable) throw new Error('Unavailable')
    return this.values.delete(`${service}:${account}`)
  }
}

const configDir = mkdtempSync(join(tmpdir(), 'seo-dataforseo-credentials-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousLogin = process.env[DATAFORSEO_LOGIN_ENV]
const previousPassword = process.env[DATAFORSEO_PASSWORD_ENV]
const keyring = new MemoryKeyring()

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  delete process.env[DATAFORSEO_LOGIN_ENV]
  delete process.env[DATAFORSEO_PASSWORD_ENV]
  rmSync(configDir, { recursive: true, force: true })
  keyring.values.clear()
  keyring.unavailable = false
  setKeyringForTests(keyring)
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousLogin === undefined) delete process.env[DATAFORSEO_LOGIN_ENV]
  else process.env[DATAFORSEO_LOGIN_ENV] = previousLogin
  if (previousPassword === undefined)
    delete process.env[DATAFORSEO_PASSWORD_ENV]
  else process.env[DATAFORSEO_PASSWORD_ENV] = previousPassword
  setKeyringForTests()
})

test('partial environment credentials fail without falling through', async () => {
  process.env[DATAFORSEO_LOGIN_ENV] = 'api-owner@example.test'

  await assert.rejects(readDataForSeoCredentials(), (error) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.code, 'configuration')
    assert.match(error.message, /set both SEO_DATAFORSEO_LOGIN and/i)
    return true
  })
})

test('legacy config credentials migrate only after the secret is saved', async () => {
  writeConfig(
    configSchema.parse({
      providers: {
        dataForSeoLogin: 'legacy-owner@example.test',
        dataForSeoPassword: 'legacy-password',
      },
    }),
  )

  assert.deepEqual(await readDataForSeoCredentials(), {
    login: 'legacy-owner@example.test',
    password: 'legacy-password',
    source: 'keychain',
    migrated: true,
  })
  assert.equal(readConfig().providers.dataForSeoLogin, undefined)
  assert.equal(readConfig().providers.dataForSeoPassword, undefined)
  assert.equal(
    readFileSync(getSeoCliPaths().configFile, 'utf8').includes(
      'legacy-password',
    ),
    false,
  )
})
