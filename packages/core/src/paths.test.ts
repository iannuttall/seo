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

test('uses an XDG-style config directory on macOS', () => {
  const paths = resolveSeoCliPaths({
    platform: 'darwin',
    home: '/Users/example',
    env: {},
  })

  assert.equal(paths.configDir, '/Users/example/.config/seo')
  assert.equal(paths.cacheDir, '/Users/example/Library/Caches/seo')
  assert.equal(paths.logDir, '/Users/example/Library/Logs/seo')
})

test('respects explicit config and XDG overrides', () => {
  const paths = resolveSeoCliPaths({
    platform: 'linux',
    home: '/home/example',
    env: {
      SEO_CONFIG_DIR: '/private/seo-config',
      SEO_CACHE_DIR: '/private/seo-cache',
      SEO_LOG_DIR: '/private/seo-log',
      XDG_CONFIG_HOME: '/ignored',
    },
  })

  assert.equal(paths.configDir, '/private/seo-config')
  assert.equal(paths.cacheDir, '/private/seo-cache')
  assert.equal(paths.logDir, '/private/seo-log')
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
