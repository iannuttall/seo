import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { after, test } from 'node:test'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const root = process.cwd()
const tempRoot = await mkdtemp(join(tmpdir(), 'seo-packed-install-'))
const archiveDirectory = join(tempRoot, 'archive')
const consumerDirectory = join(tempRoot, 'consumer')
const configDirectory = join(tempRoot, 'config')
const cacheDirectory = join(tempRoot, 'cache')
const globalPrefix = join(tempRoot, 'global')
const pnpmGlobalDirectory = join(tempRoot, 'pnpm-global')
const pnpmBinDirectory = join(tempRoot, 'pnpm-bin')
const tsc = require.resolve('typescript/bin/tsc')
let archivePath

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

async function listInstalledMcpTools(seo) {
  const transport = new StdioClientTransport({
    command: seo,
    args: ['mcp', 'serve'],
    cwd: root,
    env: {
      ...consumerEnv(),
      NPM_CONFIG_OFFLINE: 'true',
    },
    stderr: 'pipe',
  })
  const client = new Client({
    name: 'seo-installed-package-test',
    version: '1.0.0',
  })
  try {
    await client.connect(transport)
    return await client.listTools()
  } finally {
    await client.close()
  }
}

async function packedTarball() {
  if (archivePath) return archivePath
  await mkdir(archiveDirectory, { recursive: true })
  await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', archiveDirectory],
    { cwd: root, env: consumerEnv() },
  )
  const archive = (await readdir(archiveDirectory)).find((file) =>
    /^seo-[\d.]+\.tgz$/.test(file),
  )
  assert.ok(archive, 'npm pack should create an seo tarball')
  archivePath = join(archiveDirectory, archive)
  return archivePath
}

test('the packed package installs globally into an isolated prefix', {
  timeout: 120_000,
}, async () => {
  const tarball = await packedTarball()
  await execFileAsync(
    'npm',
    [
      'install',
      '--global',
      '--prefix',
      globalPrefix,
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    { cwd: root, env: consumerEnv(), maxBuffer: 1024 * 1024 },
  )

  if (process.platform === 'win32') return

  const seo = join(globalPrefix, 'bin', 'seo')
  const version = await execFileAsync(seo, ['--version'], {
    cwd: root,
    env: consumerEnv(),
  })
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/)

  const start = await execFileAsync(seo, ['start', '--dry-run', '--json'], {
    cwd: root,
    env: consumerEnv(),
  })
  assert.equal(JSON.parse(start.stdout).dryRun, true)

  const cache = await execFileAsync(seo, ['cache', 'stats'], {
    cwd: root,
    env: consumerEnv(),
  })
  assert.match(cache.stdout, /DB\s+/)

  const mcp = await listInstalledMcpTools(seo)
  assert.deepEqual(
    mcp.tools.map((tool) => tool.name),
    ['seo_list_reports', 'seo_describe_report', 'seo_run_report'],
  )
})

test('the packed package opens its database after a pnpm global install', {
  timeout: 120_000,
}, async () => {
  if (process.platform === 'win32') return

  const tarball = await packedTarball()
  await mkdir(pnpmGlobalDirectory, { recursive: true })
  await mkdir(pnpmBinDirectory, { recursive: true })
  await execFileAsync(
    'pnpm',
    [
      'add',
      '--global',
      '--global-dir',
      pnpmGlobalDirectory,
      '--global-bin-dir',
      pnpmBinDirectory,
      '--ignore-scripts',
      tarball,
    ],
    {
      cwd: root,
      env: {
        ...consumerEnv(),
        PATH: `${pnpmBinDirectory}${delimiter}${process.env.PATH ?? ''}`,
        PNPM_HOME: pnpmBinDirectory,
      },
      maxBuffer: 1024 * 1024,
    },
  )

  const seo = join(pnpmBinDirectory, 'seo')
  const cache = await execFileAsync(seo, ['cache', 'stats'], {
    cwd: root,
    env: consumerEnv(),
  })
  assert.match(cache.stdout, /DB\s+/)
})

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

  const cache = await execFileAsync(process.execPath, [cli, 'cache', 'stats'], {
    cwd: consumerDirectory,
    env: consumerEnv(),
  })
  assert.match(cache.stdout, /DB\s+/)

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
