import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

test('indexnow validates a dry run as structured JSON without network work', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      cliPath,
      'indexnow',
      'submit',
      '--site',
      'https://example.test',
      '--urls',
      'https://example.test/b,https://example.test/a',
      '--dry-run',
      '--json',
    ],
    {
      env: {
        ...process.env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
        SEO_INDEXNOW_KEY: 'test-key-123',
      },
    },
  )
  assert.equal(stderr, '')
  const result = JSON.parse(stdout)
  assert.equal(result.status, 'validated')
  assert.equal(result.dryRun, true)
  assert.equal(result.submittedUrls, 2)
  assert.equal(result.credentialSource, 'environment')
  assert.equal('key' in result, false)
})

test('indexnow is discoverable in full help', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cliPath, 'help', 'all'],
    { env: { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' } },
  )
  assert.equal(stderr, '')
  assert.match(stdout, /seo indexnow submit/)
})

test('indexnow setup writes one new key file and keeps the key local', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-indexnow-cli-'))
  const configDirectory = join(directory, 'config')
  const outputDirectory = join(directory, 'public')
  await mkdir(configDirectory)
  await writeFile(
    join(configDirectory, 'config.json'),
    JSON.stringify({ security: { useKeychain: false } }),
  )
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        cliPath,
        'indexnow',
        'setup',
        '--site',
        'https://example.test',
        '--output',
        outputDirectory,
        '--json',
      ],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CONFIG_DIR: configDirectory,
        },
      },
    )
    assert.equal(stderr, '')
    const result = JSON.parse(stdout)
    const contents = (await readFile(result.keyFile, 'utf8')).trim()
    assert.equal(basename(result.keyFile), `${contents}.txt`)
    assert.equal('key' in result, false)
    assert.equal(result.host, 'example.test')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
