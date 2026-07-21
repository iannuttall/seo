import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../../index.js', import.meta.url))

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'seo-keyword-sets-cli-'))
  const configDir = join(root, 'config')
  const cacheDir = join(root, 'cache')
  await mkdir(configDir, { recursive: true })
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({
      clients: [
        {
          id: 'example-project',
          name: 'Example project',
          siteUrl: 'sc-domain:example.test',
          watchUrls: [],
          brandTerms: [],
          analytics: {},
          isDefault: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      telemetry: { enabled: false },
    }),
  )
  return {
    root,
    env: {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    },
  }
}

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

test('keyword set commands keep project state local and JSON structured', async () => {
  const local = await fixture()
  try {
    const create = await runSeo(
      [
        'projects',
        'keyword-sets',
        'create',
        '--project',
        'example-project',
        '--name',
        'Local ideas',
        '--country',
        'gb',
        '--language',
        'en',
        '--location',
        'London',
        '--device',
        'mobile',
        '--json',
      ],
      local.env,
    )
    assert.equal(create.exitCode, 0)
    assert.equal(create.stderr, '')
    assert.equal(JSON.parse(create.stdout).market.countryCode, 'GB')

    const add = await runSeo(
      [
        'projects',
        'keyword-sets',
        'add',
        '--project',
        'example-project',
        '--set',
        'Local ideas',
        '--keywords',
        'Emergency plumber,boiler repair,emergency  plumber',
        '--tags',
        'local,service',
        '--target-url',
        'https://example.test/services',
        '--json',
      ],
      local.env,
    )
    assert.equal(add.exitCode, 0)
    assert.equal(add.stderr, '')
    assert.deepEqual(JSON.parse(add.stdout), {
      setId: JSON.parse(create.stdout).id,
      requested: 3,
      normalized: 2,
      added: 2,
      removed: 0,
      existing: 0,
      updated: 0,
      keywordCount: 2,
    })

    const show = await runSeo(
      [
        'projects',
        'keyword-sets',
        'show',
        '--project',
        'example-project',
        '--set',
        'Local ideas',
        '--tag',
        'local',
        '--limit',
        '1',
        '--json',
      ],
      local.env,
    )
    const detail = JSON.parse(show.stdout)
    assert.equal(show.exitCode, 0)
    assert.equal(detail.pagination.total, 2)
    assert.equal(detail.pagination.nextOffset, 1)
    assert.equal(detail.items[0].keyword, 'boiler repair')
    assert.equal(detail.items[0].page.kind, 'target')

    const output = join(local.root, 'keywords.csv')
    const exported = await runSeo(
      [
        'projects',
        'keyword-sets',
        'export',
        '--project',
        'example-project',
        '--set',
        'Local ideas',
        '--output',
        output,
      ],
      local.env,
    )
    assert.equal(exported.exitCode, 0)
    assert.match(await readFile(output, 'utf8'), /boiler repair/)
    assert.match(await readFile(output, 'utf8'), /emergency plumber/)

    const remove = await runSeo(
      [
        'projects',
        'keyword-sets',
        'remove',
        '--project',
        'example-project',
        '--set',
        'Local ideas',
        '--keyword',
        'boiler repair',
        '--json',
      ],
      local.env,
    )
    assert.equal(JSON.parse(remove.stdout).removed, 1)
  } finally {
    await rm(local.root, { recursive: true, force: true })
  }
})

test('keyword set commands reject unsafe files and destructive defaults', async () => {
  const local = await fixture()
  try {
    const file = join(local.root, 'too-large.txt')
    await writeFile(file, 'x'.repeat(100_001))
    const oversized = await runSeo(
      [
        'projects',
        'keyword-sets',
        'add',
        '--project',
        'example-project',
        '--set',
        'missing',
        '--file',
        file,
        '--json',
      ],
      local.env,
    )
    assert.equal(oversized.exitCode, 2)
    assert.match(JSON.parse(oversized.stdout).error.message, /100 KB/)

    const deletion = await runSeo(
      [
        'projects',
        'keyword-sets',
        'delete',
        '--project',
        'example-project',
        '--set',
        'missing',
        '--json',
      ],
      local.env,
    )
    assert.equal(deletion.exitCode, 2)
    assert.match(JSON.parse(deletion.stdout).error.message, /--yes/)

    const invalidOffset = await runSeo(
      [
        'projects',
        'keyword-sets',
        'refresh',
        '--project',
        'example-project',
        '--set',
        'missing',
        '--offset',
        'later',
        '--json',
      ],
      local.env,
    )
    assert.equal(invalidOffset.exitCode, 2)
    assert.match(
      JSON.parse(invalidOffset.stdout).error.message,
      /--offset must be an integer/i,
    )
  } finally {
    await rm(local.root, { recursive: true, force: true })
  }
})
