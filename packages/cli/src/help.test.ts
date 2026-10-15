import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

async function runSeo(
  args: string[],
  env: Record<string, string> = {},
): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      ...env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
    },
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  })
  return `${result.stdout}${result.stderr}`
}

async function runSeoResult(
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

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ;(server as Server).close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

// biome-ignore format: Keep this large integration suite flat while Node runs bounded subtests concurrently.
describe('CLI help and integration contracts', { concurrency: 3 }, () => {
test('root help stays curated and useful', async () => {
  const output = await runSeo(['help'])

  for (const command of [
    'seo start',
    'seo report',
    'seo page',
    'seo compare',
    'seo index',
    'seo research',
    'seo data',
    'seo crawl',
    'seo internal-links',
    'seo projects list',
  ]) {
    assert.match(output, new RegExp(command))
  }
  assert.doesNotMatch(output, /Unknown command help/)
  assert.doesNotMatch(output, /seo quick-wins/)
})

test('command help works through the short help alias', async () => {
  const output = await runSeo(['help', 'report'])

  assert.match(output, /USAGE|Usage:/)
  assert.doesNotMatch(output, /Unknown command/)
})

test('report JSON never prompts without a selector', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-report-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-report-cache-'))

  try {
    const result = await runSeoResult(['report', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message:
          'No site selected. Pass --site, use --project on supported commands, or run `seo start` in a terminal.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start JSON creates a usable project without interactive output', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-cache-'))

  try {
    const result = await runSeoResult(
      [
        'start',
        '--site',
        'sc-domain:example.com',
        '--skip-auth',
        '--skip-mcp',
        '--json',
      ],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, '')
    assert.equal(output.auth, 'skipped')
    assert.equal(output.client.id, 'example-com')
    assert.equal(output.client.siteUrl, 'sc-domain:example.com')
    assert.equal(output.client.startUrl, 'https://example.com/')
    assert.deepEqual(output.next, [
      'seo report --project example-com',
      'seo refresh-priorities --project example-com --verify-content',
      'seo technical-watch --project example-com',
    ])
    assert.doesNotMatch(result.stdout, /seo start|Setup complete|[┌◇└]/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start JSON does not silently skip missing authentication', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-cache-'))

  try {
    const result = await runSeoResult(
      ['start', '--site', 'sc-domain:example.com', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 3)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message:
          'Not logged in. Run `seo auth login`, or pass --skip-auth to save a project profile without connecting Google.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('start dry-run does not create local data directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seo-start-dry-run-'))
  const configDir = join(root, 'config')
  const cacheDir = join(root, 'cache')
  const logDir = join(root, 'logs')

  try {
    const result = await runSeoResult(['start', '--dry-run', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_LOG_DIR: logDir,
    })

    assert.equal(result.exitCode, 0)
    assert.equal(JSON.parse(result.stdout).dryRun, true)
    await Promise.all(
      [configDir, cacheDir, logDir].map((path) => assert.rejects(access(path))),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reset refuses to prompt outside a terminal without --yes', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-reset-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-reset-cache-'))
  const marker = join(configDir, 'keep.txt')
  await writeFile(marker, 'example')

  try {
    const result = await runSeoResult(['reset'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })

    assert.equal(result.exitCode, 2)
    assert.match(
      `${result.stdout}${result.stderr}`,
      /Cannot prompt here\. Pass --yes to confirm reset\./,
    )
    await access(marker)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth status and interactive-only setup stay structured in JSON mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-auth-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-auth-cache-'))

  try {
    const status = await runSeoResult(['auth', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(status.exitCode, 0)
    const { sharedConfigured, accounts, ...statusJson } = JSON.parse(
      status.stdout,
    )
    assert.equal(typeof sharedConfigured, 'boolean')
    assert.deepEqual(accounts, [])
    assert.deepEqual(statusJson, {
      authenticated: false,
      mode: 'none',
      byoConfigured: false,
      serviceAccount: {
        configured: false,
      },
    })

    const setup = await runSeoResult(['auth', 'setup-client', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(setup.exitCode, 2)
    assert.equal(setup.stderr, '')
    assert.equal(JSON.parse(setup.stdout).error.code, 'INVALID_INPUT')
    assert.doesNotMatch(setup.stdout, /Google Desktop OAuth client ID|[◆◇]/)
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth storage reports and changes the local preference in JSON mode', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-auth-storage-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-auth-storage-cache-'))

  try {
    const defaultStorage = await runSeoResult(['auth', 'storage', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
    })
    assert.equal(defaultStorage.exitCode, 0)
    assert.deepEqual(JSON.parse(defaultStorage.stdout), {
      configured: 'keychain',
      active: 'keychain',
    })

    const fileStorage = await runSeoResult(
      ['auth', 'storage', '--file', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
      },
    )
    assert.equal(fileStorage.exitCode, 0)
    assert.deepEqual(JSON.parse(fileStorage.stdout), {
      configured: 'file',
      active: 'file',
    })

    const conflict = await runSeoResult(
      ['auth', 'storage', '--keychain', '--file', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
      },
    )
    assert.equal(conflict.exitCode, 2)
    assert.equal(JSON.parse(conflict.stdout).error.code, 'INVALID_INPUT')
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('auth status reports a service account identity without printing the key', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-service-account-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-service-account-cache-'))
  const privateKey = 'not-a-real-private-key'

  try {
    await writeFile(
      join(configDir, 'tokens.json'),
      JSON.stringify({
        provider: 'google',
        account_email: 'stored-account@example.com',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        token_type: 'Bearer',
        access_token: 'stored-access-token',
        refresh_token: 'stored-refresh-token',
        expires_at: Date.now() + 3_600_000,
        obtained_at: Date.now(),
        client_source: 'byo',
      }),
    )
    const status = await runSeoResult(['auth', 'status', '--json'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'seo-ci@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    })
    assert.equal(status.exitCode, 0)
    const { sharedConfigured, accounts, ...statusJson } = JSON.parse(
      status.stdout,
    )
    assert.equal(typeof sharedConfigured, 'boolean')
    assert.equal(accounts.length, 1)
    assert.equal(accounts[0].accountEmail, 'stored-account@example.com')
    assert.deepEqual(statusJson, {
      authenticated: true,
      mode: 'service-account',
      identity: 'seo-ci@example.iam.gserviceaccount.com',
      byoConfigured: false,
      serviceAccount: {
        configured: true,
        identity: 'seo-ci@example.iam.gserviceaccount.com',
        source: 'environment-json',
      },
    })
    assert.doesNotMatch(status.stdout, new RegExp(privateKey))

    const whoami = await runSeoResult(['auth', 'whoami'], {
      SEO_CONFIG_DIR: configDir,
      SEO_CACHE_DIR: cacheDir,
      SEO_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'seo-ci@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    })
    assert.equal(whoami.exitCode, 0)
    assert.match(whoami.stdout, /seo-ci@example\.iam\.gserviceaccount\.com/)
    assert.doesNotMatch(whoami.stdout, new RegExp(privateKey))
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('long help and command help are available', async () => {
  const all = await runSeo(['help', 'all'])
  assert.match(all, /seo crawl-reports/)
  assert.doesNotMatch(all, /Unknown command/)

  for (const args of [
    ['report', '--help'],
    ['projects', '--help'],
    ['start', '--help'],
    ['crawl', '--help'],
    ['internal-links', '--help'],
    ['analytics', 'google', 'report', '--help'],
    ['providers', 'connect', '--help'],
    ['page', '--help'],
    ['compare', '--help'],
    ['index', '--help'],
    ['research', '--help'],
    ['data', '--help'],
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
})

test('decaying JSON rejects invalid flags before authentication', async () => {
  for (const args of [
    [
      'decaying',
      '--site',
      'sc-domain:example.com',
      '--limit',
      'later',
      '--json',
    ],
    [
      'decaying',
      '--site',
      'sc-domain:example.com',
      '--comparison',
      'weekly',
      '--json',
    ],
  ]) {
    const result = await runSeoResult(args)
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.match(result.stderr, /is now `seo /)
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('unknown and removed commands exit 2 with one clear error', async () => {
  const result = await runSeoResult(['definitely-not-a-command'])
  const output = `${result.stdout}${result.stderr}`

  assert.equal(result.exitCode, 2)
  assert.equal(output.match(/Unknown command/g)?.length, 1)

  for (const command of ['pseo', 'server-logs', 'monthly-report']) {
    const removed = await runSeoResult([command, '--json'])
    assert.equal(removed.exitCode, 2, command)
    assert.equal(removed.stdout, '', command)
    assert.match(removed.stderr, /was removed in 0\.3\.0/, command)
  }
})

test('report JSON fails clearly when Google auth is missing', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cli-cache-'))

  try {
    const result = await runSeoResult(
      ['report', '--site', 'sc-domain:example.com', '--json'],
      { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir },
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 3)
    assert.equal(result.stderr, '')
    assert.deepEqual(output, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Not logged in. Run `seo auth login` first.',
        retryable: false,
      },
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('crawler negated flags disable sitemap and external checks', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>Local test</title><meta name="description" content="Local test page"><h1>Local test</h1><p>Enough local text for a simple crawler smoke test.</p><a href="https://example.com/offsite">Offsite</a>',
    )
  })

  try {
    const output = await runSeo([
      'crawl',
      fixture.baseUrl,
      '--max-pages',
      '1',
      '--no-sitemap',
      '--no-external',
      '--json',
    ])
    const report = JSON.parse(output)

    assert.equal(report.config.useSitemap, false)
    assert.equal(report.config.checkExternal, false)
    assert.equal(report.summary.totalPages, 1)
  } finally {
    await fixture.close()
  }
})

test('crawl-reports compares latest against the previous saved report', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-cli-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-cli-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }
  let snapshotRequests = 0
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    snapshotRequests += 1
    res.end(
      `<title>Snapshot fixture ${snapshotRequests}</title><meta name="description" content="Snapshot fixture page"><h1>Snapshot fixture</h1><p>Enough text for saved crawl report fixture ${snapshotRequests}.</p>`,
    )
  })

  try {
    const beforeRun = JSON.parse(
      await runSeo(
        [
          'crawl',
          `${fixture.baseUrl}/snapshot`,
          '--max-pages',
          '1',
          '--no-sitemap',
          '--no-external',
          '--refresh',
          '--save',
          '--json',
        ],
        env,
      ),
    ) as { id: string; definitionId: string }
    const afterRun = JSON.parse(
      await runSeo(
        [
          'crawl',
          `${fixture.baseUrl}/snapshot`,
          '--max-pages',
          '1',
          '--no-sitemap',
          '--no-external',
          '--refresh',
          '--save',
          '--json',
        ],
        env,
      ),
    ) as { id: string; definitionId: string }

    assert.notEqual(beforeRun.id, afterRun.id)
    assert.equal(beforeRun.definitionId, afterRun.definitionId)

    const output = await runSeo(
      [
        'crawl-reports',
        '--compare',
        'latest',
        '--against',
        'previous',
        '--json',
      ],
      env,
    )
    const diff = JSON.parse(output) as {
      before: { id: string; url: string }
      after: { id: string; url: string }
      summary: { titleChanges: number; contentChanges: number }
    }

    assert.notEqual(diff.before.id, diff.after.id)
    assert.equal(diff.before.url, `${fixture.baseUrl}/snapshot`)
    assert.equal(diff.after.url, `${fixture.baseUrl}/snapshot`)
    assert.equal(diff.summary.titleChanges, 1)
    assert.equal(diff.summary.contentChanges, 1)
  } finally {
    await fixture.close()
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
})
