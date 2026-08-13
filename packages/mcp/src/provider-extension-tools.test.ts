import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { registerProviderExtensionTools } from './provider-extension-tools.js'

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  structuredContent?: Record<string, unknown>
  isError?: boolean
}>

function handlers(): Map<string, ToolHandler> {
  const registered = new Map<string, ToolHandler>()
  registerProviderExtensionTools({
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      registered.set(name, handler)
    },
  } as never)
  return registered
}

test('MCP discovers and runs actions from the shared provider registry', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-mcp-provider-'))
  const packageDir = join(
    configDir,
    'providers',
    'node_modules',
    '@example',
    'fixture',
  )
  const previousConfigDir = process.env.SEO_CONFIG_DIR
  const previousFixtureKey = process.env.SEO_FIXTURE_KEY
  try {
    process.env.SEO_CONFIG_DIR = configDir
    process.env.SEO_FIXTURE_KEY = 'fixture-secret'
    await mkdir(join(packageDir, 'dist'), { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@example/fixture',
        version: '1.2.3',
        type: 'module',
        seo: { apiVersion: 1, providers: ['./dist/index.js'] },
      }),
    )
    await writeFile(
      join(packageDir, 'dist', 'index.js'),
      `export default host => host.registerProvider({ id: 'fixture', displayName: 'Fixture', description: 'Fixture provider.', kinds: ['other'], connection: { fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }, { id: 'apiKey', label: 'API key', kind: 'secret', envVar: 'SEO_FIXTURE_KEY' }], async verify() {} }, capabilities: [], actions: [{ id: 'report', description: 'Run a report.', inputSchema: { type: 'object', properties: { country: { type: 'string' } }, required: ['country'] }, outputSchema: { type: 'object' }, async run(input) { return { siteId: input.account.siteId, country: input.params.country, hasSecret: Boolean(input.credentials.apiKey) } } }] })`,
    )
    await writeFile(
      join(configDir, 'provider-packages.json'),
      JSON.stringify({
        schemaVersion: 1,
        packages: [
          {
            id: 'fixture',
            package: '@example/fixture',
            version: '1.2.3',
            integrity: 'sha512-YWJjZGVmZ2hpamts',
            enabled: true,
            installedAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    )

    const tools = handlers()
    assert.deepEqual(
      [...tools.keys()],
      ['seo_list_providers', 'seo_describe_provider', 'seo_run_provider'],
    )

    const listed = await tools.get('seo_list_providers')?.({})
    assert.equal(listed?.isError, undefined)
    assert.equal((listed?.structuredContent?.installed as unknown[])?.length, 1)

    const described = await tools.get('seo_describe_provider')?.({
      id: 'fixture',
    })
    assert.equal(described?.isError, undefined)
    assert.equal(described?.structuredContent?.id, 'fixture')
    const actions = described?.structuredContent?.actions as
      | Array<{ id: string }>
      | undefined
    assert.equal(actions?.[0]?.id, 'report')

    const run = await tools.get('seo_run_provider')?.({
      id: 'fixture',
      action: 'report',
      account: { siteId: '123' },
      params: { country: 'GB' },
    })
    assert.equal(run?.isError, undefined)
    assert.deepEqual(run?.structuredContent?.data, {
      country: 'GB',
      hasSecret: true,
      siteId: '123',
    })
  } finally {
    if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
    else process.env.SEO_CONFIG_DIR = previousConfigDir
    if (previousFixtureKey === undefined) delete process.env.SEO_FIXTURE_KEY
    else process.env.SEO_FIXTURE_KEY = previousFixtureKey
    await rm(configDir, { recursive: true, force: true })
  }
})
