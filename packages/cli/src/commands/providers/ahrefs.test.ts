import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../../index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      timeout: 10_000,
    })
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      exitCode: result.code ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  }
}

test('Ahrefs status uses the environment API key without exposing it', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-ahrefs-cli-cache-'))
  try {
    const result = await runSeo(['providers', 'ahrefs', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_AHREFS_API_KEY: 'environment-api-key',
    })
    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout), {
      connected: true,
      apiVersion: 3,
      credentialSource: 'environment',
      liveCheck: { status: 'not-requested' },
    })
    assert.doesNotMatch(result.stdout, /environment-api-key/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
