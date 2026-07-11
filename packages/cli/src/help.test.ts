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
import { test } from 'node:test'
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

test('root help stays curated and useful', async () => {
  const output = await runSeo(['help'])

  assert.match(output, /seo start/)
  assert.match(output, /seo report/)
  assert.match(output, /seo projects list/)
  assert.match(output, /seo refresh-priorities/)
  assert.match(output, /seo quick-wins/)
  assert.match(output, /seo second-page/)
  assert.match(output, /seo technical-watch/)
  assert.doesNotMatch(output, /Unknown command help/)
  assert.doesNotMatch(output, /seo crawl\s/)
})

test('command help works through the short help alias', async () => {
  const output = await runSeo(['help', 'init'])

  assert.match(output, /Legacy alias for `seo start`/)
  assert.match(output, /--skip-auth/)
  assert.doesNotMatch(output, /Unknown command help/)
})

test('start JSON never prompts and requires an explicit site on first run', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-cache-'))

  try {
    const result = await runSeoResult(['start', '--json'], {
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

test('init is a compatibility alias for the guided start flow', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-init-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-init-cache-'))

  try {
    const result = await runSeoResult(
      ['init', '--site', 'sc-domain:example.com', '--skip-auth', '--json'],
      {
        SEO_CONFIG_DIR: configDir,
        SEO_CACHE_DIR: cacheDir,
      },
    )

    assert.equal(result.exitCode, 0)
    const output = JSON.parse(result.stdout)
    assert.equal(output.site, 'sc-domain:example.com')
    assert.equal(output.auth, 'skipped')
    assert.doesNotMatch(result.stdout, /Semrush|DataForSEO|Google OAuth client/)
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

test('start reuses the existing project profile for the selected property', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-start-profile-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-start-profile-cache-'))
  const env = { SEO_CONFIG_DIR: configDir, SEO_CACHE_DIR: cacheDir }

  try {
    const added = await runSeoResult(
      [
        'projects',
        'add',
        '--id',
        'keep',
        '--name',
        'keep.md',
        '--site',
        'sc-domain:keep.md',
        '--url',
        'https://keep.md/',
        '--json',
      ],
      env,
    )
    assert.equal(added.exitCode, 0)

    const result = await runSeoResult(
      [
        'start',
        '--site',
        'sc-domain:keep.md',
        '--skip-auth',
        '--skip-mcp',
        '--json',
      ],
      env,
    )
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 0)
    assert.equal(output.client.id, 'keep')
    assert.deepEqual(output.next, [
      'seo report --project keep',
      'seo refresh-priorities --project keep --verify-content',
      'seo technical-watch --project keep',
    ])

    const listed = await runSeoResult(['projects', 'list', '--json'], env)
    assert.equal(listed.exitCode, 0)
    assert.equal(JSON.parse(listed.stdout).clients.length, 1)
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
  await writeFile(marker, 'keep')

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
    const { sharedConfigured, ...statusJson } = JSON.parse(status.stdout)
    assert.equal(typeof sharedConfigured, 'boolean')
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
    const { sharedConfigured, ...statusJson } = JSON.parse(status.stdout)
    assert.equal(typeof sharedConfigured, 'boolean')
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

test('long help and crawler command help are available', async () => {
  const all = await runSeo(['help', 'all'])
  assert.match(all, /seo crawl\s+Crawl a site/)
  assert.match(all, /seo crawl-reports\s+List saved crawl reports/)

  for (const args of [
    ['report', '--help'],
    ['projects', '--help'],
    ['start', '--help'],
    ['skills', '--help'],
    ['skills', 'install', '--help'],
    ['crawl', '--help'],
    ['crawl-reports', '--help'],
    ['internal-links', '--help'],
    ['cannibal', '--help'],
    ['decaying', '--help'],
    ['pseo', 'audit', '--help'],
    ['ai-referrals', '--help'],
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
})

test('AI referrals help exposes bounded evidence controls', async () => {
  const output = await runSeo(['ai-referrals', '--help'])

  for (const flag of [
    '--property',
    '--start-date',
    '--end-date',
    '--max-rows',
    '--result-limit',
    '--refresh',
    '--json',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('AI referrals JSON rejects invalid evidence controls before auth', async () => {
  for (const args of [
    ['--max-rows', 'nope'],
    ['--max-rows', '0'],
    ['--result-limit', '1001'],
    ['--start-date', '2026-06-01', '--end-date', 'yesterday'],
  ]) {
    const result = await runSeoResult([
      'ai-referrals',
      '--property',
      '123',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('query opportunity help exposes bounded retained evidence', async () => {
  for (const command of ['seo-to-ai-query', 'community-intent']) {
    const output = await runSeo([command, '--help'])
    for (const flag of [
      '--days',
      '--start-date',
      '--end-date',
      '--limit',
      '--min-impressions',
      '--max-rows',
      '--brand-terms',
      '--json',
    ]) {
      assert.match(output, new RegExp(flag), `${command} ${flag}`)
    }
  }
})

test('query opportunity JSON rejects malformed bounds before auth', async () => {
  for (const command of ['seo-to-ai-query', 'community-intent']) {
    for (const args of [
      ['--days', 'nope'],
      ['--days', '0'],
      ['--limit', '1.5'],
      ['--max-rows', '50001'],
      ['--start-date', '2026-06-01'],
    ]) {
      const result = await runSeoResult([
        command,
        '--site',
        'sc-domain:example.com',
        ...args,
        '--json',
      ])
      assert.notEqual(result.exitCode, 0, `${command} ${args.join(' ')}`)
      assert.match(
        `${result.stdout}${result.stderr}`,
        /INVALID_INPUT|must|provided together/i,
      )
    }
  }
})

test('segment impact help exposes bounded comparison evidence', async () => {
  const output = await runSeo(['segment-impact', '--help'])

  for (const flag of [
    '--dimension',
    '--days',
    '--compare',
    '--start-date',
    '--end-date',
    '--limit',
    '--unmatched-limit',
    '--max-rows',
    '--refresh',
    '--json',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('segment impact JSON rejects malformed bounds before auth', async () => {
  for (const args of [
    ['--days', 'later'],
    ['--days', '241'],
    ['--max-rows', 'many'],
    ['--max-rows', '0'],
    ['--unmatched-limit', 'none'],
    ['--unmatched-limit', '101'],
    ['--start-date', 'not-a-date', '--end-date', '2026-05-28'],
  ]) {
    const result = await runSeoResult([
      'segment-impact',
      '--site',
      'sc-domain:example.com',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('change measurement rejects malformed windows before auth', async () => {
  const result = await runSeoResult([
    'tests',
    'report',
    '--site',
    'sc-domain:example.com',
    '--scope',
    'site',
    '--target',
    'sitewide',
    '--date',
    '2026-06-01',
    '--before',
    'nope',
    '--json',
  ])

  assert.notEqual(result.exitCode, 0)
  assert.match(`${result.stdout}${result.stderr}`, /--before must be a number/i)
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    /auth login|Google OAuth/i,
  )
})

test('cannibal help exposes bounded discovery controls', async () => {
  const output = await runSeo(['cannibal', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--min-impressions',
    '--brand-terms',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('decaying help exposes bounded comparison controls', async () => {
  const output = await runSeo(['decaying', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--comparison',
    '--min-drop-pct',
    '--min-previous-clicks',
    '--min-click-loss',
    '--brand-terms',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
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
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('internal-links help exposes bounded matching and fetch controls', async () => {
  const output = await runSeo(['internal-links', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--check-limit',
    '--min-impressions',
    '--brand-terms',
    '--fetch-concurrency',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('pSEO help exposes bounded discovery and sampling controls', async () => {
  const output = await runSeo(['pseo', 'audit', '--help'])

  for (const flag of [
    '--days',
    '--limit',
    '--minimum-template-urls',
    '--minimum-template-share',
    '--minimum-template-impressions',
    '--max-sitemap-urls',
    '--crawl-samples',
    '--inspect-samples',
    '--fetch-concurrency',
    '--refresh',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('pSEO JSON rejects invalid bounds before authentication', async () => {
  for (const args of [
    ['--crawl-samples', '11'],
    ['--minimum-template-share', '1.1'],
    ['--days', 'later'],
  ]) {
    const result = await runSeoResult([
      'pseo',
      'audit',
      '--site',
      'sc-domain:example.com',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('index-watch help exposes bounded quota and inventory controls', async () => {
  const output = await runSeo(['index-watch', '--help'])

  for (const flag of [
    '--urls',
    '--sitemaps',
    '--daily-limit',
    '--inspect-limit',
    '--max-urls',
    '--target-days',
    '--language',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('index-coverage help explains project, crawl, sitemap, and source limits', async () => {
  const output = await runSeo(['index-coverage', '--help'])

  for (const flag of [
    '--project',
    '--site',
    '--crawl-report-id',
    '--sitemaps',
    '--days',
    '--row-limit',
    '--max-sitemap-urls',
    '--limit',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('index-watch JSON rejects unsafe bounds before authentication', async () => {
  for (const args of [
    ['--urls', 'https://example.com/a', '--daily-limit', '2001'],
    ['--sitemaps', 'https://example.com/sitemap.xml', '--inspect-limit', '101'],
  ]) {
    const result = await runSeoResult([
      'index-watch',
      '--site',
      'sc-domain:example.com',
      ...args,
      '--json',
    ])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stderr, '')
    assert.equal(output.error.code, 'INVALID_INPUT')
  }
})

test('performance help exposes lab and field controls', async () => {
  const output = await runSeo(['perf', 'audit', '--help'])

  for (const flag of [
    '--url',
    '--strategy',
    '--lighthouse-bin',
    '--crux-key',
    '--refresh',
    '--raw',
    '--json',
  ]) {
    assert.match(output, new RegExp(flag))
  }
})

test('version aliases and nested command help are available', async () => {
  assert.match(await runSeo(['--version']), /0\.1\.0/)
  assert.match(await runSeo(['-v']), /0\.1\.0/)

  for (const args of [
    ['content', 'optimize', '--help'],
    ['monitoring', 'cron', '--help'],
    ['export', 'refresh-priorities', '--help'],
  ]) {
    const output = await runSeo(args)
    assert.doesNotMatch(output, /Unknown command/)
    assert.match(output, /USAGE|Usage:/)
  }
})

test('unknown commands emit one error and exit with failure', async () => {
  const result = await runSeoResult(['definitely-not-a-command'])
  const output = `${result.stdout}${result.stderr}`

  assert.equal(result.exitCode, 2)
  assert.equal(output.match(/Unknown command/g)?.length, 1)
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

test('OKF JSON validation failures use a failing exit code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-okf-invalid-'))
  try {
    await writeFile(join(directory, 'index.md'), '# Not an OKF bundle\n')
    const result = await runSeoResult(['okf', 'validate', directory, '--json'])
    const output = JSON.parse(result.stdout)

    assert.equal(result.exitCode, 1)
    assert.equal(output.valid, false)
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
