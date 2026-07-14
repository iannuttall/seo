import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
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

test('skills list and path expose the packaged seo skill', async () => {
  const listed = await runSeo(['skill', 'list', '--json'])
  assert.equal(listed.exitCode, 0)
  assert.equal(listed.stderr, '')
  const skills = JSON.parse(listed.stdout).skills as Array<{
    name: string
    description: string
    path: string
  }>
  assert.deepEqual(
    skills.map((skill) => skill.name),
    ['seo'],
  )
  assert.ok(skills.every((skill) => skill.description.length > 40))

  const path = await runSeo(['skill', 'path', 'seo', '--json'])
  assert.equal(JSON.parse(path.stdout).path, join(sourceSkills, 'seo'))
})

test('skill list explains the packaged skill without dumping its router prompt', async () => {
  const result = await runSeo(['skill', 'list'])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^SEO skill$/m)
  assert.match(result.stdout, /Helps agents choose and run the right SEO audit/)
  assert.match(result.stdout, /seo start/)
  assert.doesNotMatch(result.stdout, /Use and read this skill immediately/)
  assert.ok(result.stdout.split('\n').length < 20)
})
