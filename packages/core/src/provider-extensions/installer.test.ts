import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import {
  inspectProviderPackage,
  installProviderPackage,
  type ProviderPackageCommand,
  uninstallProviderExtension,
} from './installer.js'
import { readInstalledProviderPackages } from './store.js'

const root = mkdtempSync(join(tmpdir(), 'seo-provider-installer-'))
const configDir = join(root, 'config')
const packagesDir = join(configDir, 'providers')
const previousConfigDir = process.env.SEO_CONFIG_DIR
const expectedIntegrity = 'sha512-YWJjZGVmZ2hpamts'
const otherIntegrity = 'sha512-ZGVmZ2hpamtsbW5v'

beforeEach(() => {
  process.env.SEO_CONFIG_DIR = configDir
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
})

after(() => {
  rmSync(root, { recursive: true, force: true })
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
})

function command(
  input: {
    dependencies?: Record<string, string>
    installedIntegrity?: string
    maintainers?: Array<string | { name: string }>
    metadataIntegrities?: string[]
    npmUser?: string | { name: string } | null
    registerSecondProvider?: boolean
    unpackedSize?: number
    version?: string
  } = {},
): { run: ProviderPackageCommand; calls: string[][] } {
  const calls: string[][] = []
  let viewCall = 0
  const version = input.version ?? '1.2.3'
  const run: ProviderPackageCommand = async (_executable, args) => {
    calls.push([...args])
    if (args[0] === 'view') {
      const integrity =
        input.metadataIntegrities?.[
          Math.min(viewCall, input.metadataIntegrities.length - 1)
        ] ?? expectedIntegrity
      viewCall += 1
      return {
        stdout: JSON.stringify({
          name: '@example/fixture',
          version,
          description: 'Fixture provider.',
          repository: {
            type: 'git',
            url: 'git+https://github.com/example/fixture.git',
          },
          _npmUser:
            input.npmUser === null ? undefined : (input.npmUser ?? 'example'),
          maintainers: input.maintainers,
          dependencies: input.dependencies,
          dist: {
            integrity,
            unpackedSize: input.unpackedSize ?? 1_024,
          },
          seo: { apiVersion: 1, providers: ['./dist/index.js'] },
        }),
        stderr: '',
      }
    }
    if (args[0] === 'install') {
      const packageDir = join(
        packagesDir,
        'node_modules',
        '@example',
        'fixture',
      )
      mkdirSync(join(packageDir, 'dist'), { recursive: true })
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({
          name: '@example/fixture',
          version,
          type: 'module',
          seo: { apiVersion: 1, providers: ['./dist/index.js'] },
        }),
      )
      writeFileSync(
        join(packagesDir, 'package-lock.json'),
        JSON.stringify({
          packages: {
            'node_modules/@example/fixture': {
              version,
              integrity: input.installedIntegrity ?? expectedIntegrity,
            },
          },
        }),
      )
      writeFileSync(
        join(packageDir, 'dist', 'index.js'),
        `export default host => { host.registerProvider({ id: 'fixture', displayName: 'Fixture', description: 'Fixture analytics provider.', kinds: ['traffic-analytics'], connection: { fields: [{ id: 'account', label: 'Account', kind: 'account' }], async verify() {} }, capabilities: [{ id: 'landing-page-visits', async run() { return { metric: 'landing-page-visits', rows: [], returnedRows: 0, retainedRowLimit: 100, retainedRowLimitReached: false, dataStatus: 'complete', qualityWarnings: [] } } }] }); ${input.registerSecondProvider ? "host.registerProvider({ id: 'second', displayName: 'Second', description: 'Second provider.', kinds: ['other'], connection: { fields: [], async verify() {} }, capabilities: [], actions: [{ id: 'run', description: 'Run.', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, async run() { return {} } }] })" : ''} }`,
      )
    }
    return { stdout: '', stderr: '' }
  }
  return { run, calls }
}

test('direct install resolves, approves, pins, and validates an npm package', async () => {
  const fake = command()
  const release = await inspectProviderPackage('@example/fixture', {
    packagesDir,
    run: fake.run,
  })
  assert.deepEqual(release, {
    package: '@example/fixture',
    version: '1.2.3',
    integrity: expectedIntegrity,
    unpackedSize: 1_024,
    apiVersion: 1,
    entryPoints: 1,
    description: 'Fixture provider.',
    repository: 'https://github.com/example/fixture',
    publisher: 'example',
  })

  const installed = await installProviderPackage(release, {
    packagesDir,
    run: fake.run,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assert.deepEqual(installed, {
    id: 'fixture',
    package: '@example/fixture',
    version: '1.2.3',
    integrity: expectedIntegrity,
    enabled: true,
    installedAt: '2026-08-11T12:00:00.000Z',
  })
  assert.deepEqual(readInstalledProviderPackages().packages, [installed])
  assert.deepEqual(fake.calls[0], ['view', '@example/fixture', '--json'])
  assert.deepEqual(fake.calls[1], ['view', '@example/fixture@1.2.3', '--json'])
  assert.deepEqual(fake.calls[2], [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--legacy-peer-deps',
    '--omit=optional',
    '--save-exact',
    '@example/fixture@1.2.3',
  ])

  assert.equal(
    (
      await uninstallProviderExtension('fixture', {
        packagesDir,
        run: fake.run,
      })
    )?.id,
    'fixture',
  )
  assert.deepEqual(readInstalledProviderPackages().packages, [])
  assert.equal(fake.calls.at(-1)?.[0], 'uninstall')
})

test('direct install accepts an exact version and rejects ranges or URLs', async () => {
  const fake = command()
  await inspectProviderPackage('@example/fixture@1.2.3', {
    packagesDir,
    run: fake.run,
  })
  assert.deepEqual(fake.calls[0], ['view', '@example/fixture@1.2.3', '--json'])
  for (const invalid of [
    '@example/fixture@^1.2.3',
    'https://example.com/provider.tgz',
    'github:example/fixture',
  ]) {
    await assert.rejects(
      inspectProviderPackage(invalid, { packagesDir, run: fake.run }),
      /npm package name with an optional exact version/i,
    )
  }
  assert.equal(fake.calls.length, 1)
})

test('package inspection accepts string maintainers from npm metadata', async () => {
  const fake = command({
    maintainers: ['Ian Nuttall <npm@example.com>'],
    npmUser: null,
  })
  const release = await inspectProviderPackage('@example/fixture', {
    packagesDir,
    run: fake.run,
  })

  assert.equal(release.publisher, 'Ian Nuttall <npm@example.com>')
})

test('package inspection rejects dependency trees before installation', async () => {
  const fake = command({ dependencies: { surprise: '^1.0.0' } })
  await assert.rejects(
    inspectProviderPackage('@example/fixture', {
      packagesDir,
      run: fake.run,
    }),
    /declare no runtime/i,
  )
  assert.equal(fake.calls.length, 1)
})

test('package inspection rejects oversized releases before installation', async () => {
  const fake = command({ unpackedSize: 6 * 1024 * 1024 })
  await assert.rejects(
    inspectProviderPackage('@example/fixture', {
      packagesDir,
      run: fake.run,
    }),
    /unpacked-size limit/i,
  )
  assert.equal(fake.calls.length, 1)
})

test('direct install rejects metadata that changes after approval', async () => {
  const fake = command({
    metadataIntegrities: [expectedIntegrity, otherIntegrity],
  })
  const release = await inspectProviderPackage('@example/fixture', {
    packagesDir,
    run: fake.run,
  })
  await assert.rejects(
    installProviderPackage(release, { packagesDir, run: fake.run }),
    /metadata changed after approval/i,
  )
  assert.equal(fake.calls.length, 2)
})

test('direct install removes a package with the wrong installed integrity', async () => {
  const fake = command({ installedIntegrity: otherIntegrity })
  const release = await inspectProviderPackage('@example/fixture', {
    packagesDir,
    run: fake.run,
  })
  await assert.rejects(
    installProviderPackage(release, { packagesDir, run: fake.run }),
    /does not match the approved package release/i,
  )
  assert.equal(fake.calls.at(-1)?.[0], 'uninstall')
  assert.deepEqual(readInstalledProviderPackages().packages, [])
})

test('direct install requires one registered provider per package', async () => {
  const fake = command({ registerSecondProvider: true, version: '1.2.4' })
  const release = await inspectProviderPackage('@example/fixture', {
    packagesDir,
    run: fake.run,
  })
  await assert.rejects(
    installProviderPackage(release, { packagesDir, run: fake.run }),
    /must register exactly one provider/i,
  )
  assert.equal(fake.calls.at(-1)?.[0], 'uninstall')
  assert.deepEqual(readInstalledProviderPackages().packages, [])
})
