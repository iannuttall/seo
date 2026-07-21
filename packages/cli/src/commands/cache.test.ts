import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

test('cache clear rejects an unknown provider before opening the database', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cache-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cache-cli-cache-'))
  try {
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [cliPath, 'cache', 'clear', '--provider', 'dataforseoo'],
        {
          env: {
            ...process.env,
            SEO_CONFIG_DIR: configDir,
            SEO_CACHE_DIR: cacheDir,
            CI: '1',
            NO_UPDATE_NOTIFIER: '1',
          },
        },
      ),
      (error) => {
        const result = error as { code?: number; stderr?: string }
        assert.notEqual(result.code, 0)
        assert.match(result.stderr ?? '', /--provider must be one of/i)
        return true
      },
    )
    await assert.rejects(access(join(cacheDir, 'cache.db')))
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
