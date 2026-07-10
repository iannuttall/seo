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
const sourceSkills = fileURLToPath(
  new URL('../../../../skills', import.meta.url),
)

async function runSeo(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
        SEO_SKILLS_DIR: sourceSkills,
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

test('skills list and path expose packaged skill metadata', async () => {
  const listed = await runSeo(['skills', 'list', '--json'])
  assert.equal(listed.exitCode, 0)
  assert.equal(listed.stderr, '')
  const skills = JSON.parse(listed.stdout).skills as Array<{
    name: string
    description: string
    path: string
  }>
  assert.ok(skills.length >= 10)
  assert.deepEqual(
    skills.map((skill) => skill.name),
    [...skills.map((skill) => skill.name)].sort(),
  )
  assert.ok(skills.every((skill) => skill.description.length > 40))

  const path = await runSeo(['skills', 'path', 'performance', '--json'])
  assert.equal(JSON.parse(path.stdout).path, join(sourceSkills, 'performance'))
})

test('skills install copies one skill and preserves existing files by default', async () => {
  const destination = await mkdtemp(join(tmpdir(), 'seo-skills-'))
  try {
    const installed = await runSeo([
      'skills',
      'install',
      'performance',
      '--dir',
      destination,
      '--json',
    ])
    assert.equal(installed.exitCode, 0)
    assert.equal(installed.stderr, '')
    assert.deepEqual(JSON.parse(installed.stdout), {
      destination,
      results: [
        {
          name: 'performance',
          path: join(destination, 'performance'),
          changed: true,
        },
      ],
    })
    assert.match(
      await readFile(join(destination, 'performance', 'SKILL.md'), 'utf8'),
      /^---\nname: performance\n/,
    )

    const repeated = await runSeo([
      'skills',
      'install',
      'performance',
      '--dir',
      destination,
      '--json',
    ])
    assert.equal(JSON.parse(repeated.stdout).results[0].changed, false)
  } finally {
    await rm(destination, { recursive: true, force: true })
  }
})

test('skills install never prompts in JSON or CI mode', async () => {
  const missingTarget = await runSeo(['skills', 'install', '--json'])
  assert.equal(missingTarget.exitCode, 2)
  assert.equal(missingTarget.stderr, '')
  assert.equal(JSON.parse(missingTarget.stdout).error.code, 'INVALID_INPUT')

  const unknown = await runSeo([
    'skills',
    'install',
    'not-a-skill',
    '--target',
    'agents',
    '--json',
  ])
  assert.equal(unknown.exitCode, 2)
  assert.equal(
    JSON.parse(unknown.stdout).error.message,
    'Unknown skill: not-a-skill.',
  )
})
