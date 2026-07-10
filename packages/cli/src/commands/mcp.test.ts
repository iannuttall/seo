import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

test('mcp install requires an explicit target outside an interactive terminal', async () => {
  const home = await mkdtemp(join(tmpdir(), 'seo-mcp-home-'))

  try {
    const terminalResult = await runSeo(['mcp', 'install'], { HOME: home })

    assert.equal(terminalResult.exitCode, 2)
    assert.equal(terminalResult.stdout, '')
    assert.equal(
      terminalResult.stderr,
      'Error: Choose an MCP client with --claude-desktop, --claude-code, --codex, --cursor, or --all.\n',
    )

    const jsonResult = await runSeo(['mcp', 'install', '--json'], {
      HOME: home,
    })

    assert.equal(jsonResult.exitCode, 2)
    assert.equal(jsonResult.stderr, '')
    assert.deepEqual(JSON.parse(jsonResult.stdout), {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message:
          'Choose an MCP client with --claude-desktop, --claude-code, --codex, --cursor, or --all.',
        retryable: false,
      },
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('mcp install and uninstall return clean JSON without prompting', async () => {
  const home = await mkdtemp(join(tmpdir(), 'seo-mcp-home-'))
  const configDir = join(home, 'seo-config')
  const env = { HOME: home, SEO_CONFIG_DIR: configDir }
  const configPath = join(home, '.claude.json')

  try {
    const installed = await runSeo(
      ['mcp', 'install', '--claude-code', '--json'],
      env,
    )
    assert.equal(installed.exitCode, 0)
    assert.equal(installed.stderr, '')
    assert.deepEqual(JSON.parse(installed.stdout), {
      operation: 'install',
      results: [{ client: 'claude-code', path: configPath, changed: true }],
    })

    const config = JSON.parse(await readFile(configPath, 'utf8'))
    assert.deepEqual(config.mcpServers.seo, {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'seo', 'mcp', 'serve'],
      env: { SEO_CONFIG_DIR: configDir },
    })

    const repeated = await runSeo(
      ['mcp', 'install', '--claude-code', '--json'],
      env,
    )
    assert.deepEqual(JSON.parse(repeated.stdout), {
      operation: 'install',
      results: [{ client: 'claude-code', path: configPath, changed: false }],
    })

    const uninstalled = await runSeo(
      ['mcp', 'install', '--claude-code', '--uninstall', '--json'],
      env,
    )
    assert.equal(uninstalled.exitCode, 0)
    assert.equal(uninstalled.stderr, '')
    assert.deepEqual(JSON.parse(uninstalled.stdout), {
      operation: 'uninstall',
      results: [{ client: 'claude-code', path: configPath, changed: true }],
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('mcp install accepts multiple explicit client flags', async () => {
  const home = await mkdtemp(join(tmpdir(), 'seo-mcp-home-'))

  try {
    const result = await runSeo(
      ['mcp', 'install', '--cursor', '--claude-code', '--json'],
      { HOME: home },
    )

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, '')
    const output = JSON.parse(result.stdout)
    assert.deepEqual(
      output.results.map((entry: { client: string }) => entry.client),
      ['claude-code', 'cursor'],
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
