import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string }> {
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
    return { exitCode: 0, stdout: result.stdout }
  } catch (error) {
    const result = error as { code?: number; stdout?: string }
    return { exitCode: result.code ?? 1, stdout: result.stdout ?? '' }
  }
}

test('auth whoami prints a readable account summary', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-whoami-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-whoami-cache-'))
  const expiresAt = Date.now() + 3_600_000
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    await writeFile(
      join(configDir, 'tokens.json'),
      JSON.stringify({
        provider: 'google',
        account_email: 'user@example.com',
        scope: [
          'openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/webmasters.readonly',
          'https://www.googleapis.com/auth/analytics.readonly',
        ].join(' '),
        token_type: 'Bearer',
        access_token: 'stored-access-token',
        refresh_token: 'stored-refresh-token',
        expires_at: expiresAt,
        obtained_at: Date.now(),
        client_source: 'byo',
      }),
    )

    const whoami = await runSeo(['auth', 'whoami'], env)
    assert.equal(whoami.exitCode, 0)
    assert.match(whoami.stdout, /Account\s+user@example\.com/)
    assert.match(whoami.stdout, /Search Console\s+Read only/)
    assert.match(whoami.stdout, /Google Analytics\s+Read only/)
    assert.match(whoami.stdout, /OAuth app\s+Local OAuth config/)
    assert.doesNotMatch(whoami.stdout, / · /)
    assert.doesNotMatch(whoami.stdout, /BYO client/)

    const json = await runSeo(['auth', 'whoami', '--json'], env)
    assert.equal(json.exitCode, 0)
    assert.deepEqual(JSON.parse(json.stdout), {
      mode: 'oauth',
      account: 'user@example.com',
      scopes: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/analytics.readonly',
      ],
      clientSource: 'byo',
      expiresAt,
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
