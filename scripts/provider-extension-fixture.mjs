import { copyFileSync, cpSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function installBuiltProviderFixture(input) {
  const packageJson = JSON.parse(
    readFileSync(join(input.sourceDirectory, 'package.json'), 'utf8'),
  )
  const { getSeoCliPaths } = await import('../packages/core/dist/paths.js')
  const { saveInstalledProviderPackage } = await import(
    '../packages/core/dist/provider-extensions/store.js'
  )
  const packageDirectory = join(
    getSeoCliPaths().providerPackagesDir,
    'node_modules',
    ...packageJson.name.split('/'),
  )
  mkdirSync(packageDirectory, { recursive: true, mode: 0o700 })
  copyFileSync(
    join(input.sourceDirectory, 'package.json'),
    join(packageDirectory, 'package.json'),
  )
  cpSync(join(input.sourceDirectory, 'dist'), join(packageDirectory, 'dist'), {
    recursive: true,
  })
  saveInstalledProviderPackage({
    id: input.id,
    package: packageJson.name,
    version: packageJson.version,
    integrity: 'sha512-dGVzdC1maXh0dXJl',
    enabled: true,
    installedAt: '2026-08-13T00:00:00.000Z',
  })
}
