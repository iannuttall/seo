import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const bundledRuntimeDependencies = new Set(['cheerio'])
const repositoryUrl = 'https://github.com/iannuttall/seo'

test('the public package exposes one unscoped API, CLI, and MCP surface', () => {
  assert.equal(packageJson.name, 'seo')
  assert.equal(packageJson.private, undefined)
  assert.equal(packageJson.bin.seo, './dist/cli.js')
  assert.equal(packageJson.exports['.'].import, './dist/index.js')
  assert.equal(packageJson.exports['./mcp'].import, './dist/mcp.js')
  assert.equal(packageJson.license, 'Apache-2.0')
  assert.equal(packageJson.homepage, 'https://seocli.sh')
  assert.equal(packageJson.repository.url, `git+${repositoryUrl}.git`)
  assert.equal(packageJson.bugs.url, `${repositoryUrl}/issues`)
  assert.doesNotMatch(
    JSON.stringify(packageJson),
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  )
})

test('the public TypeScript library and MCP entry points load', async () => {
  const [core, mcp] = await Promise.all([
    import('../dist/index.js'),
    import('../dist/mcp.js'),
  ])

  assert.equal(typeof core.auditPage, 'function')
  assert.equal(typeof core.crawlSite, 'function')
  assert.equal(typeof mcp.createServer, 'function')
  assert.equal(typeof mcp.describeReport, 'function')
  assert.equal(typeof mcp.executeReport, 'function')
  assert.ok(mcp.listReports().length > 0)
})

test('public runtime bundles do not depend on private workspace packages', async () => {
  const files = (await readdir('dist')).filter((file) => file.endsWith('.js'))
  assert.ok(files.length >= 3)
  for (const file of files) {
    const source = await readFile(`dist/${file}`, 'utf8')
    assert.doesNotMatch(source, /(?:from\s*|import\()['"]@seo\//)
  }
})

test('the CLI bundle is executable and the seo skill ships in the package', async () => {
  const cli = await readFile('dist/cli.js', 'utf8')
  assert.match(cli, /^#!\/usr\/bin\/env node\n/)
  assert.ok(packageJson.files.includes('skills'))

  const skillFolders = await readdir('skills', { withFileTypes: true })
  const skills = skillFolders
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.deepEqual(skills, ['seo'])
  const source = await readFile('skills/seo/SKILL.md', 'utf8')
  assert.match(source, /^---\nname: seo\n/)
})

test('the evals directory ships in the package', async () => {
  assert.ok(packageJson.files.includes('evals'))

  const evalFiles = (await readdir('evals')).filter((file) =>
    file.endsWith('.json'),
  )
  assert.ok(evalFiles.length > 0)
  for (const file of evalFiles) {
    const doc = JSON.parse(await readFile(`evals/${file}`, 'utf8'))
    assert.equal(doc.subject, file.replace(/\.json$/, ''))
    assert.ok(Array.isArray(doc.evals) && doc.evals.length > 0)
  }
})

test('the packaged CLI reports the public package version', async () => {
  const result = await execFileAsync(
    process.execPath,
    ['dist/cli.js', '--version'],
    { env: { ...process.env, NO_UPDATE_NOTIFIER: '1' } },
  )
  assert.equal(result.stdout.trim(), packageJson.version)
})

test('the public package includes its trust and legal policies', async () => {
  await Promise.all([
    readFile('PRIVACY.md', 'utf8'),
    readFile('SECURITY.md', 'utf8'),
    readFile('TERMS.md', 'utf8'),
    readFile('TRADEMARKS.md', 'utf8'),
  ])
  assert.ok(packageJson.files.includes('PRIVACY.md'))
  assert.ok(packageJson.files.includes('SECURITY.md'))
  assert.ok(packageJson.files.includes('TERMS.md'))
  assert.ok(packageJson.files.includes('TRADEMARKS.md'))

  const trademarks = await readFile('TRADEMARKS.md', 'utf8')
  assert.match(trademarks, /source code is available under Apache-2\.0/i)
  assert.match(trademarks, /license does not grant/i)
})

test('public support and security routes stay on GitHub', async () => {
  const publicFiles = [
    '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/ISSUE_TEMPLATE/report.yml',
    'AGENTS.md',
    'README.md',
    'CONTRIBUTING.md',
    'PRIVACY.md',
    'SECURITY.md',
    'TERMS.md',
    'TRADEMARKS.md',
    'docs/release.md',
  ]
  const sources = await Promise.all(
    publicFiles.map((file) => readFile(file, 'utf8')),
  )
  const combined = sources.join('\n')

  assert.match(combined, /github\.com\/iannuttall\/seo\/issues/)
  assert.match(
    combined,
    /github\.com\/iannuttall\/seo\/security\/advisories\/new/,
  )
  assert.doesNotMatch(combined, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
  assert.doesNotMatch(combined, /audits\.run/i)
})

test('the release workflow uses npm trusted publishing and release-only OAuth injection', async () => {
  const release = await readFile('.github/workflows/release.yml', 'utf8')
  const ci = await readFile('.github/workflows/ci.yml', 'utf8')

  assert.match(release, /contents: read/)
  assert.match(release, /id-token: write/)
  for (const workflow of [release, ci]) {
    assert.match(workflow, /actions\/checkout@v7/)
    assert.match(workflow, /pnpm\/action-setup@v6/)
    assert.match(workflow, /actions\/setup-node@v6/)
  }
  assert.match(release, /node-version: 24/)
  assert.match(release, /package-manager-cache: false/)
  assert.match(release, /npm publish --access public --provenance/)
  assert.doesNotMatch(release, /NPM_TOKEN|NODE_AUTH_TOKEN/)
  assert.match(release, /secrets\.SEO_GOOGLE_CLIENT_ID/)
  assert.match(release, /secrets\.SEO_GOOGLE_CLIENT_SECRET/)
  assert.doesNotMatch(ci, /SEO_GOOGLE_CLIENT_ID|SEO_GOOGLE_CLIENT_SECRET/)
  for (const workflow of [release, ci]) {
    assert.match(workflow, /pnpm test:package-install/)
    assert.match(workflow, /gitleaks\/gitleaks-action@v3/)
    assert.match(workflow, /pnpm security:check/)
    assert.doesNotMatch(workflow, /pnpm security:audit/)
  }
})

test('the shared OAuth injector escapes values and requires both credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-shared-oauth-'))
  const output = join(directory, 'shared-client.generated.ts')
  const padding = 'x'.repeat(100)
  const env = {
    ...process.env,
    SEO_GOOGLE_CLIENT_ID: `test-client-${padding}-'\\\u2028`,
    SEO_GOOGLE_CLIENT_SECRET: `test-secret-${padding}-'\\\u2029`,
    SEO_SHARED_OAUTH_OUTPUT_PATH: output,
  }

  try {
    const result = await execFileAsync(
      process.execPath,
      ['scripts/inject-shared-oauth-client.mjs'],
      { env },
    )
    const source = await readFile(output, 'utf8')

    assert.match(result.stdout, /Wrote shared OAuth client/)
    assert.match(source, /clientId:\n {4}'test-client-x+-\\'\\\\\\u2028'/)
    assert.match(source, /clientSecret:\n {4}'test-secret-x+-\\'\\\\\\u2029'/)

    await assert.rejects(
      execFileAsync(
        process.execPath,
        ['scripts/inject-shared-oauth-client.mjs'],
        {
          env: {
            ...process.env,
            SEO_GOOGLE_CLIENT_ID: '',
            SEO_GOOGLE_CLIENT_SECRET: '',
            SEO_SHARED_OAUTH_OUTPUT_PATH: output,
          },
        },
      ),
      /SEO_GOOGLE_CLIENT_ID and SEO_GOOGLE_CLIENT_SECRET must both be set/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('root runtime dependencies cover or bundle workspace dependencies', async () => {
  const workspaceFiles = [
    'packages/core/package.json',
    'packages/cli/package.json',
    'packages/mcp/package.json',
  ]

  for (const file of workspaceFiles) {
    const workspacePackage = JSON.parse(await readFile(file, 'utf8'))
    for (const [name, version] of Object.entries(
      workspacePackage.dependencies ?? {},
    )) {
      if (name.startsWith('@seo/')) continue
      if (bundledRuntimeDependencies.has(name)) {
        const runtimeFiles = (await readdir('dist')).filter((entry) =>
          entry.endsWith('.js'),
        )
        for (const runtimeFile of runtimeFiles) {
          const source = await readFile(`dist/${runtimeFile}`, 'utf8')
          assert.doesNotMatch(
            source,
            new RegExp(`(?:from\\s*|import\\()['"]${name}(?:/[^'"]*)?['"]`),
            `${name} must be bundled into ${runtimeFile}`,
          )
        }
        continue
      }
      assert.equal(
        packageJson.dependencies[name],
        version,
        `${name} from ${file} must match the public package`,
      )
    }
  }
})
