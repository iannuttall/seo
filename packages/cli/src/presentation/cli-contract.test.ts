import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify, stripVTControlCharacters } from 'node:util'
import { visibleWidth } from './context.js'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
        ...env,
      },
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    })
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout }
  } catch (error) {
    const result = error as {
      code?: number
      stderr?: string
      stdout?: string
    }
    return {
      exitCode: result.code ?? 1,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    }
  }
}

test('root help is deterministic and width-bound without color', async () => {
  for (const columns of [40, 60, 80, 120, 160]) {
    const first = await runCli(['help'], {
      COLUMNS: String(columns),
      NO_COLOR: '',
    })
    const second = await runCli(['help'], {
      COLUMNS: String(columns),
      NO_COLOR: '',
    })
    assert.equal(first.exitCode, 0)
    assert.equal(first.stderr, '')
    assert.equal(first.stdout, second.stdout)
    assert.equal(stripVTControlCharacters(first.stdout), first.stdout)
    for (const line of first.stdout.split('\n')) {
      assert.ok(
        visibleWidth(line) <= columns,
        `${visibleWidth(line)} > ${columns}: ${line}`,
      )
    }
  }
})

test('JSON output stays parseable and undecorated', async () => {
  const result = await runCli(['reports', 'list', '--json'], {
    COLUMNS: '40',
    NO_COLOR: '',
  })
  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.equal(stripVTControlCharacters(result.stdout), result.stdout)
  const parsed = JSON.parse(result.stdout) as { reports: unknown[] }
  assert.ok(parsed.reports.length > 0)
})

test('human catalogs share the width and color contract', async () => {
  for (const columns of [40, 80, 160]) {
    for (const args of [['reports', 'list'], ['rules'], ['skill', 'list']]) {
      const result = await runCli(args, {
        COLUMNS: String(columns),
        NO_COLOR: '',
      })
      assert.equal(result.exitCode, 0, args.join(' '))
      assert.equal(result.stderr, '', args.join(' '))
      assert.equal(stripVTControlCharacters(result.stdout), result.stdout)
      for (const line of result.stdout.split('\n')) {
        assert.ok(
          visibleWidth(line) <= columns,
          `${args.join(' ')}: ${visibleWidth(line)} > ${columns}: ${line}`,
        )
      }
    }
  }
})

test('human errors use stderr and a failing exit code', async () => {
  const result = await runCli(['definitely-not-a-command'], {
    NO_COLOR: '',
  })
  assert.equal(result.exitCode, 2)
  assert.equal(result.stdout, '')
  assert.equal(
    result.stderr,
    'Error: Unknown command definitely-not-a-command\n',
  )
  assert.equal(stripVTControlCharacters(result.stderr), result.stderr)
})
