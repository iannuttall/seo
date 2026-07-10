import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getSeoCliPaths } from '../paths.js'
import { configSchema } from '../types.js'
import { readConfig, writeConfig } from './config.js'

let configDir: string
let previousConfigDir: string | undefined

function mode(path: string): number {
  return statSync(path).mode & 0o777
}

before(() => {
  previousConfigDir = process.env.SEO_CONFIG_DIR
  configDir = mkdtempSync(join(tmpdir(), 'seo-config-permissions-'))
  process.env.SEO_CONFIG_DIR = configDir
})

after(() => {
  rmSync(configDir, { recursive: true, force: true })
  if (previousConfigDir === undefined) {
    delete process.env.SEO_CONFIG_DIR
  } else {
    process.env.SEO_CONFIG_DIR = previousConfigDir
  }
})

test('config files stay private on write and read', () => {
  writeConfig(configSchema.parse({ providers: { semrushApiKey: 'secret' } }))

  const configFile = getSeoCliPaths().configFile
  assert.equal(mode(configFile), 0o600)

  chmodSync(configFile, 0o644)
  assert.equal(readConfig().providers.semrushApiKey, 'secret')
  assert.equal(mode(configFile), 0o600)
})
