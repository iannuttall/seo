import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const bundledRuntimeDependencies = new Set([
  '@modelcontextprotocol/sdk',
  'cheerio',
])
const repositoryUrl = 'https://github.com/iannuttall/seo'

test('the public package exposes one unscoped API, CLI, and MCP surface', () => {
  assert.equal(packageJson.name, 'seo')
  assert.equal(packageJson.private, undefined)
  assert.equal(packageJson.bin.seo, './dist/cli.js')
  assert.equal(packageJson.exports['.'].import, './dist/index.js')
  assert.equal(packageJson.exports['./mcp'].import, './dist/mcp.js')
  assert.equal(
    packageJson.exports['./provider-sdk'].import,
    './dist/provider-sdk.js',
  )
  assert.equal(packageJson.license, 'Apache-2.0')
  assert.equal(packageJson.homepage, 'https://seoskill.dev')
  assert.equal(packageJson.repository.url, `git+${repositoryUrl}.git`)
  assert.equal(packageJson.bugs.url, `${repositoryUrl}/issues`)
  assert.equal(packageJson.dependencies['@modelcontextprotocol/sdk'], undefined)
  assert.doesNotMatch(
    JSON.stringify(packageJson),
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  )
})

test('the public TypeScript library, MCP, and provider SDK entry points load', async () => {
  const [core, mcp, providerSdk] = await Promise.all([
    import('../dist/index.js'),
    import('../dist/mcp.js'),
    import('../dist/provider-sdk.js'),
  ])

  assert.equal(typeof core.auditPage, 'function')
  assert.equal(typeof core.crawlSite, 'function')
  assert.equal(typeof mcp.createServer, 'function')
  assert.equal(typeof mcp.describeReport, 'function')
  assert.equal(typeof mcp.executeReport, 'function')
  assert.equal(providerSdk.SEO_PROVIDER_API_VERSION, 1)
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

test('the packaged CLI reports the public package version', async () => {
  const result = await execFileAsync(
    process.execPath,
    ['dist/cli.js', '--version'],
    { env: { ...process.env, NO_UPDATE_NOTIFIER: '1' } },
  )
  assert.equal(result.stdout.trim(), packageJson.version)
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
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          assert.doesNotMatch(
            source,
            new RegExp(
              `^(?:import|export)[^\\n]*from\\s*['"]${escapedName}(?:/[^'"]*)?['"]|^import\\(\\s*['"]${escapedName}(?:/[^'"]*)?['"]`,
              'm',
            ),
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
