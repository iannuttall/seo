import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { migrateLegacyMacConfig, resolveSeoCliPaths } from './paths.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

test('uses AppData for config on Windows', () => {
  const paths = resolveSeoCliPaths({
    platform: 'win32',
    home: 'C:\\Users\\example',
    env: {
      APPDATA: 'C:\\Users\\example\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local',
    },
  })

  assert.equal(
    paths.configDir,
    'C:\\Users\\example\\AppData\\Roaming/seo/Config',
  )
  assert.equal(paths.cacheDir, 'C:\\Users\\example\\AppData\\Local/seo/Cache')
})

test('moves the old macOS config directory only when the new directory is absent', () => {
  const home = mkdtempSync(join(tmpdir(), 'seo-paths-'))
  temporaryDirectories.push(home)
  const legacyDir = join(home, 'Library', 'Preferences', 'seo')
  mkdirSync(legacyDir, { recursive: true })
  writeFileSync(join(legacyDir, 'oauth-client.json'), '{"clientId":"id"}')

  migrateLegacyMacConfig({ platform: 'darwin', home, env: {} })

  const currentDir = join(home, '.config', 'seo')
  assert.equal(existsSync(legacyDir), false)
  assert.equal(existsSync(join(currentDir, 'oauth-client.json')), true)
})
