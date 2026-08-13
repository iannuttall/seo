import { readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { getSeoCliPaths } from '../paths.js'
import {
  type InstalledProviderPackage,
  providerPackageManifestSchema,
} from './contracts.js'
import {
  ProviderExtensionRegistry,
  type RegisteredProviderExtension,
} from './registry.js'
import type { SeoProviderActivate } from './sdk.js'
import { readInstalledProviderPackages } from './store.js'

const installedPackageJsonSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    seo: providerPackageManifestSchema,
  })
  .passthrough()

type ImportedProviderModule = {
  default?: unknown
}

export type ProviderExtensionLoadFailure = {
  id: string
  package: string
  message: string
}

export type LoadedProviderExtensions = {
  registry: ProviderExtensionRegistry
  failures: ProviderExtensionLoadFailure[]
}

export type ProviderExtensionLoaderOptions = {
  registry?: ProviderExtensionRegistry
  packagesDir?: string
  installed?: readonly InstalledProviderPackage[]
  importModule?: (url: string) => Promise<ImportedProviderModule>
}

function packageDirectory(packagesDir: string, packageName: string): string {
  return join(packagesDir, 'node_modules', ...packageName.split('/'))
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function providerActivate(value: unknown): SeoProviderActivate {
  if (typeof value !== 'function') {
    throw new Error('Provider entry point must export a default function.')
  }
  return value as SeoProviderActivate
}

async function loadOne(
  installed: InstalledProviderPackage,
  registry: ProviderExtensionRegistry,
  options: Required<Pick<ProviderExtensionLoaderOptions, 'importModule'>> & {
    packagesDir: string
  },
): Promise<void> {
  const registered = await loadProviderPackage(
    { package: installed.package, version: installed.version },
    options,
  )
  const added = registered.map((provider) => provider.id)
  if (added.length !== 1 || added[0] !== installed.id) {
    throw new Error(
      `Provider package must register exactly ${installed.id}; received ${added.join(', ') || 'none'}.`,
    )
  }
  const host = registry.hostFor({
    package: installed.package,
    version: installed.version,
  })
  for (const provider of registered) {
    host.registerProvider({
      id: provider.id,
      displayName: provider.displayName,
      description: provider.description,
      kinds: provider.kinds,
      connection: provider.connection,
      capabilities: provider.capabilities,
      actions: provider.actions,
    })
  }
}

export async function loadProviderPackage(
  input: { package: string; version: string },
  options: {
    packagesDir: string
    importModule?: (url: string) => Promise<ImportedProviderModule>
  },
): Promise<RegisteredProviderExtension[]> {
  const importModule =
    options.importModule ??
    ((url: string) => import(url) as Promise<ImportedProviderModule>)
  const packageDir = realpathSync(
    packageDirectory(options.packagesDir, input.package),
  )
  if (!inside(realpathSync(options.packagesDir), packageDir)) {
    throw new Error(
      'Installed provider package resolves outside the provider directory.',
    )
  }
  const packageJsonPath = join(packageDir, 'package.json')
  const packageJson = installedPackageJsonSchema.parse(
    JSON.parse(readFileSync(packageJsonPath, 'utf8')),
  )
  if (
    packageJson.name !== input.package ||
    packageJson.version !== input.version
  ) {
    throw new Error(
      'Installed provider package does not match its saved record.',
    )
  }

  const packageRegistry = new ProviderExtensionRegistry()
  for (const entry of packageJson.seo.providers) {
    const entryPath = realpathSync(resolve(dirname(packageJsonPath), entry))
    if (!inside(packageDir, entryPath)) {
      throw new Error('Provider entry point resolves outside its package.')
    }
    const module = await importModule(
      `${pathToFileURL(entryPath).href}?seo-provider=${encodeURIComponent(input.version)}`,
    )
    await providerActivate(module.default)(
      packageRegistry.hostFor({
        package: input.package,
        version: input.version,
      }),
    )
  }
  return packageRegistry.list()
}

export async function loadInstalledProviderExtensions(
  options: ProviderExtensionLoaderOptions = {},
): Promise<LoadedProviderExtensions> {
  const registry = options.registry ?? new ProviderExtensionRegistry()
  const failures: ProviderExtensionLoadFailure[] = []
  const packagesDir =
    options.packagesDir ?? getSeoCliPaths().providerPackagesDir
  const installed =
    options.installed ?? readInstalledProviderPackages().packages
  const importModule =
    options.importModule ??
    ((url: string) => import(url) as Promise<ImportedProviderModule>)

  for (const provider of [...installed]
    .filter((item) => item.enabled)
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )) {
    try {
      await loadOne(provider, registry, { packagesDir, importModule })
    } catch (error) {
      failures.push({
        id: provider.id,
        package: provider.package,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { registry, failures }
}
