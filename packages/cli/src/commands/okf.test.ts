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

async function runSeoResult(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
      maxBuffer: 1024 * 1024,
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

test('OKF JSON validation failures use a failing exit code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-okf-invalid-'))
  try {
    await writeFile(
      join(directory, 'broken.md'),
      '---\ntitle: Missing type\n---\n\n# Broken concept\n',
    )
    const result = await runSeoResult(['okf', 'validate', directory, '--json'])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 1)
    assert.equal(output.valid, false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('OKF validation keeps the generic and SEO export profiles separate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-okf-profile-'))
  try {
    await writeFile(
      join(directory, 'metric.md'),
      '---\ntype: Metric\n---\n\n# Metric\n',
    )

    const generic = await runSeoResult([
      'okf',
      'validate',
      directory,
      '--profile',
      'okf',
      '--json',
    ])
    const genericOutput = JSON.parse(generic.stdout)
    assert.equal(generic.exitCode, 0)
    assert.equal(genericOutput.valid, true)
    assert.equal(genericOutput.profile, 'okf')

    const explained = await runSeoResult([
      'okf',
      'explain',
      directory,
      '--profile',
      'okf',
    ])
    assert.equal(explained.exitCode, 0)
    assert.match(explained.stdout, /Compatibility\s+undeclared/)
    assert.match(explained.stdout, /With sources\s+0/)
    assert.match(explained.stdout, /Generated\s+0/)
    assert.match(explained.stdout, /Stable\s+1/)
    assert.match(explained.stdout, /Freshness unspecified\s+1/)
    assert.match(explained.stdout, /Attested computations\s+0/)

    const strict = await runSeoResult([
      'okf',
      'validate',
      directory,
      '--profile',
      'seo-export',
      '--json',
    ])
    const strictOutput = JSON.parse(strict.stdout)
    assert.equal(strict.exitCode, 1)
    assert.equal(strictOutput.valid, false)
    assert.equal(strictOutput.profile, 'seo-export')

    const invalid = await runSeoResult([
      'okf',
      'validate',
      directory,
      '--profile',
      'custom',
      '--json',
    ])
    const invalidOutput = JSON.parse(invalid.stdout)
    assert.equal(invalid.exitCode, 2)
    assert.equal(invalidOutput.error.code, 'INVALID_INPUT')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('OKF validation reports incomplete attested computation contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-okf-attestation-'))
  try {
    await writeFile(
      join(directory, 'computation.md'),
      '---\ntype: Attested Computation\n---\n\n# Definition\n\nMissing contract fields.\n',
    )

    const validated = await runSeoResult([
      'okf',
      'validate',
      directory,
      '--json',
    ])
    const output = JSON.parse(validated.stdout)
    assert.equal(validated.exitCode, 0)
    assert.equal(output.schemaVersion, 3)
    assert.equal(output.valid, true)
    assert.deepEqual(output.attestation, {
      concepts: 1,
      completeContracts: 0,
      incompleteContracts: 1,
      inlineComputations: 0,
      fileComputations: 0,
    })
    assert.match(
      output.issues
        .map((issue: { message: string }) => issue.message)
        .join(' '),
      /runtime should be a non-empty string/,
    )

    const explained = await runSeoResult(['okf', 'explain', directory])
    assert.equal(explained.exitCode, 0)
    assert.match(explained.stdout, /Attested computations\s+1/)
    assert.match(explained.stdout, /Incomplete attestation contracts\s+1/)
    assert.match(
      explained.stdout,
      /Review 1 incomplete attested computation contract\./,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('OKF rejects invalid concept limits before reading crawl state', async () => {
  for (const value of ['later', '0', '1.5', '5001']) {
    const result = await runSeoResult([
      'okf',
      'export',
      '--max-concepts',
      value,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})
