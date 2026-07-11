import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const root = process.cwd()
const tempRoot = await mkdtemp(join(tmpdir(), 'seo-packed-install-'))
const archiveDirectory = join(tempRoot, 'archive')
const consumerDirectory = join(tempRoot, 'consumer')
const configDirectory = join(tempRoot, 'config')
const cacheDirectory = join(tempRoot, 'cache')
const tsc = require.resolve('typescript/bin/tsc')

after(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

function consumerEnv() {
  return {
    ...process.env,
    SEO_CACHE_DIR: cacheDirectory,
    SEO_CONFIG_DIR: configDirectory,
    NO_UPDATE_NOTIFIER: '1',
  }
}

async function packedTarball() {
  await mkdir(archiveDirectory)
  await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', archiveDirectory],
    { cwd: root, env: consumerEnv() },
  )
  const archive = (await readdir(archiveDirectory)).find((file) =>
    /^seo-[\d.]+\.tgz$/.test(file),
  )
  assert.ok(archive, 'npm pack should create an seo tarball')
  return join(archiveDirectory, archive)
}

test('the packed package installs and runs without the workspace', {
  timeout: 120_000,
}, async () => {
  const tarball = await packedTarball()
  await mkdir(consumerDirectory)
  await writeFile(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({
      name: 'seo-package-consumer',
      private: true,
      type: 'module',
    }),
  )
  await execFileAsync('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: consumerDirectory,
    env: consumerEnv(),
    maxBuffer: 1024 * 1024,
  })

  const cli = join(consumerDirectory, 'node_modules', 'seo', 'dist', 'cli.js')
  const version = await execFileAsync(process.execPath, [cli, '--version'], {
    cwd: consumerDirectory,
    env: consumerEnv(),
  })
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/)

  const start = await execFileAsync(
    process.execPath,
    [
      cli,
      'start',
      '--dry-run',
      '--site',
      'https://example.com',
      '--skip-auth',
      '--skip-mcp',
      '--json',
    ],
    { cwd: consumerDirectory, env: consumerEnv() },
  )
  const startResult = JSON.parse(start.stdout)
  assert.equal(startResult.dryRun, true)

  const reportHelp = await execFileAsync(
    process.execPath,
    [cli, 'report', '--help'],
    { cwd: consumerDirectory, env: consumerEnv() },
  )
  assert.match(reportHelp.stdout, /Run the main SEO report/)

  const mcp = await execFileAsync(
    process.execPath,
    [cli, 'mcp', 'serve', '--test'],
    { cwd: consumerDirectory, env: consumerEnv() },
  )
  assert.match(mcp.stdout, /MCP server constructed successfully/)

  const library = await execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { auditPage, crawlSite } from 'seo'; import { createServer } from 'seo/mcp'; if (typeof auditPage !== 'function' || typeof crawlSite !== 'function' || typeof createServer !== 'function') process.exit(1)",
    ],
    { cwd: consumerDirectory, env: consumerEnv() },
  )
  assert.equal(library.stderr, '')

  await writeFile(
    join(consumerDirectory, 'consumer.ts'),
    "import { auditPage, crawlSite } from 'seo'\nimport { createServer } from 'seo/mcp'\n\nvoid auditPage\nvoid crawlSite\nvoid createServer\n",
  )
  await execFileAsync(
    process.execPath,
    [
      tsc,
      '--noEmit',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--strict',
      'consumer.ts',
    ],
    { cwd: consumerDirectory, env: consumerEnv() },
  )
})
