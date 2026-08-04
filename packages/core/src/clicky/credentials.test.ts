import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { writeConfig } from '../storage/config.js'
import { setKeyringForTests } from '../storage/keyring.js'
import { configSchema } from '../types.js'
import {
  deleteClickySiteKey,
  readClickySiteKey,
  writeClickySiteKey,
} from './credentials.js'

class MemoryKeyring {
  readonly values = new Map<string, string>()

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(`${service}:${account}`) ?? null
  }

  async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    this.values.set(`${service}:${account}`, password)
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(`${service}:${account}`)
  }
}

const configDir = mkdtempSync(join(tmpdir(), 'seo-clicky-credentials-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const keyring = new MemoryKeyring()

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  rmSync(configDir, { recursive: true, force: true })
  keyring.values.clear()
  setKeyringForTests(keyring)
  writeConfig(configSchema.parse({}))
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  setKeyringForTests()
})

test('Clicky sitekeys are stored separately by site ID', async () => {
  await writeClickySiteKey('123', 'abc123abc123')
  await writeClickySiteKey('456', 'def456def456')

  assert.equal((await readClickySiteKey('123'))?.siteKey, 'abc123abc123')
  assert.equal((await readClickySiteKey('456'))?.siteKey, 'def456def456')

  await deleteClickySiteKey('123')
  assert.equal(await readClickySiteKey('123'), undefined)
  assert.equal((await readClickySiteKey('456'))?.siteKey, 'def456def456')
})

test('Clicky environment sitekey takes precedence without being saved', async () => {
  await writeClickySiteKey('123', 'abc123abc123')
  const credential = await readClickySiteKey('123', {
    env: { SEO_CLICKY_SITEKEY: 'env123env123' },
  })
  assert.deepEqual(credential, {
    siteKey: 'env123env123',
    source: 'environment',
  })
  assert.equal((await readClickySiteKey('123'))?.siteKey, 'abc123abc123')
})
