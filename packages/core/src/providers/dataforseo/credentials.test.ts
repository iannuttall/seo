import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { getSeoCliPaths } from '../../paths.js'
import { readConfig, writeConfig } from '../../storage/config.js'
import { setKeyringForTests } from '../../storage/keyring.js'
import { writeProviderSecret } from '../../storage/provider-secrets.js'
import { configSchema } from '../../types.js'
import { ProviderError } from '../errors.js'
import {
  DATAFORSEO_CREDENTIAL_SECRET,
  DATAFORSEO_LOGIN_ENV,
  DATAFORSEO_PASSWORD_ENV,
  deleteDataForSeoCredentials,
  readDataForSeoCredentials,
  writeDataForSeoCredentials,
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

test('environment credentials take precedence without being persisted', async () => {
  process.env[DATAFORSEO_LOGIN_ENV] = ' api-owner@example.test '
  process.env[DATAFORSEO_PASSWORD_ENV] = 'environment-password'

  assert.deepEqual(await readDataForSeoCredentials(), {
    login: 'api-owner@example.test',
    password: 'environment-password',
    source: 'environment',
    migrated: false,
  })
  assert.equal(existsSync(getSeoCliPaths().providerSecretsFile), false)
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

test('credentials use one typed keychain record', async () => {
  writeConfig(configSchema.parse({}))
  assert.equal(
    await writeDataForSeoCredentials({
      login: 'api-owner@example.test',
      password: 'saved-password',
    }),
    'keychain',
  )
  assert.deepEqual(await readDataForSeoCredentials(), {
    login: 'api-owner@example.test',
    password: 'saved-password',
    source: 'keychain',
    migrated: false,
  })
  const raw = keyring.values.get(`seo:provider:${DATAFORSEO_CREDENTIAL_SECRET}`)
  assert.deepEqual(JSON.parse(raw ?? ''), {
    version: 1,
    login: 'api-owner@example.test',
    password: 'saved-password',
  })
})

test('credentials fall back to a private file', async () => {
  keyring.unavailable = true
  writeConfig(configSchema.parse({}))

  assert.equal(
    await writeDataForSeoCredentials({
      login: 'api-owner@example.test',
      password: 'file-password',
    }),
    'file',
  )
  const path = getSeoCliPaths().providerSecretsFile
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /dataForSeoPassword/)
  assert.deepEqual(await readDataForSeoCredentials(), {
    login: 'api-owner@example.test',
    password: 'file-password',
    source: 'file',
    migrated: false,
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

test('invalid saved credentials fail with a reconnect action', async () => {
  writeConfig(configSchema.parse({}))
  await writeProviderSecret(DATAFORSEO_CREDENTIAL_SECRET, '{not-json')

  await assert.rejects(readDataForSeoCredentials(), (error) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.code, 'configuration')
    assert.match(error.message, /disconnect.*connect again/i)
    return true
  })
})

test('disconnect removes saved and legacy credentials', async () => {
  writeConfig(
    configSchema.parse({
      providers: {
        dataForSeoLogin: 'legacy-owner@example.test',
        dataForSeoPassword: 'legacy-password',
      },
    }),
  )
  await writeDataForSeoCredentials({
    login: 'api-owner@example.test',
    password: 'saved-password',
  })

  await deleteDataForSeoCredentials()

  assert.equal(await readDataForSeoCredentials(), undefined)
  assert.equal(readConfig().providers.dataForSeoLogin, undefined)
  assert.equal(readConfig().providers.dataForSeoPassword, undefined)
})
