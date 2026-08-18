import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { ensureSeoCliDirs, getSeoCliPaths } from '../paths.js'
import { writeJsonAtomic } from '../storage/files.js'
import type { InstalledProviderPackage } from './contracts.js'
import {
  providerExactVersionSchema,
  providerIntegritySchema,
  providerPackageManifestSchema,
  providerPackageNameSchema,
} from './contracts.js'
import { loadProviderPackage } from './loader.js'
import {
  readInstalledProviderPackages,
  removeInstalledProviderPackage,
  saveInstalledProviderPackage,
} from './store.js'

const execFileAsync = promisify(execFile)
const MAX_PROVIDER_UNPACKED_BYTES = 5 * 1024 * 1024
const MAX_NPM_OUTPUT_BYTES = 1024 * 1024
const PACKAGE_REFERENCE_EXAMPLE = '@scope/provider or @scope/provider@1.2.3'

const npmPackageMetadataSchema = z
  .object({
    name: providerPackageNameSchema,
    version: providerExactVersionSchema,
    dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    bundledDependencies: z.array(z.string()).optional(),
    dist: z
      .object({
        integrity: providerIntegritySchema,
        unpackedSize: z.number().int().nonnegative(),
      })
      .passthrough(),
    seo: providerPackageManifestSchema,
    description: z.string().trim().max(500).nullish(),
    repository: z
      .union([
        z.string().trim().max(2_048),
        z.object({ url: z.string().trim().max(2_048) }).passthrough(),
      ])
      .nullish(),
    author: z
      .union([
        z.string().trim().max(500),
        z.object({ name: z.string().trim().max(200) }).passthrough(),
      ])
      .nullish(),
    maintainers: z
      .array(
        z.union([
          z.string().trim().max(200),
          z.object({ name: z.string().trim().max(200) }).passthrough(),
        ]),
      )
      .max(100)
      .nullish(),
    _npmUser: z
      .union([
        z.string().trim().max(200),
        z.object({ name: z.string().trim().max(200) }).passthrough(),
      ])
      .nullish(),
  })
  .passthrough()

const providerPackageReleaseSchema = z
  .object({
    package: providerPackageNameSchema,
    version: providerExactVersionSchema,
    integrity: providerIntegritySchema,
    unpackedSize: z.number().int().nonnegative(),
    apiVersion: z.literal(1),
    entryPoints: z.number().int().min(1).max(16),
    description: z.string().trim().max(500).optional(),
    repository: z.string().trim().max(2_048).optional(),
    publisher: z.string().trim().max(200).optional(),
  })
  .strict()

export type ProviderPackageRelease = z.infer<
  typeof providerPackageReleaseSchema
>

const npmPackageLockSchema = z
  .object({
    packages: z.record(
      z.string(),
      z
        .object({
          version: providerExactVersionSchema.optional(),
          integrity: providerIntegritySchema.optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()

export type ProviderPackageCommandResult = {
  stdout: string
  stderr: string
}

export type ProviderPackageCommand = (
  executable: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<ProviderPackageCommandResult>

export type ProviderInstallerOptions = {
  packagesDir?: string
  now?: () => Date
  run?: ProviderPackageCommand
}

async function defaultCommand(
  executable: string,
  args: readonly string[],
  options: { cwd: string },
): Promise<ProviderPackageCommandResult> {
  const result = await execFileAsync(executable, [...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    },
    maxBuffer: MAX_NPM_OUTPUT_BYTES,
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

function ensurePackageRoot(packagesDir: string): void {
  ensureSeoCliDirs()
  mkdirSync(packagesDir, { recursive: true, mode: 0o700 })
  const packageJsonPath = join(packagesDir, 'package.json')
  if (existsSync(packageJsonPath)) return
  writeJsonAtomic(
    packageJsonPath,
    {
      name: 'seo-local-provider-packages',
      private: true,
      type: 'module',
      dependencies: {},
    },
    0o644,
  )
}

function assertBoundedPackage(
  metadata: z.infer<typeof npmPackageMetadataSchema>,
): void {
  const runtimeDependencies = Object.keys(metadata.dependencies ?? {})
  const optionalDependencies = Object.keys(metadata.optionalDependencies ?? {})
  const bundledDependencies = metadata.bundledDependencies ?? []
  if (
    runtimeDependencies.length > 0 ||
    optionalDependencies.length > 0 ||
    bundledDependencies.length > 0
  ) {
    throw new Error(
      'Provider packages must bundle their runtime code and declare no runtime, optional, or bundled dependencies.',
    )
  }
  if (metadata.dist.unpackedSize > MAX_PROVIDER_UNPACKED_BYTES) {
    throw new Error(
      `Provider package exceeds the ${MAX_PROVIDER_UNPACKED_BYTES} byte unpacked-size limit.`,
    )
  }
}

function assertInstalledRelease(
  packagesDir: string,
  release: ProviderPackageRelease,
): void {
  const packageLock = npmPackageLockSchema.parse(
    JSON.parse(readFileSync(join(packagesDir, 'package-lock.json'), 'utf8')),
  )
  const installed = packageLock.packages[`node_modules/${release.package}`]
  if (
    installed?.version !== release.version ||
    installed.integrity !== release.integrity
  ) {
    throw new Error(
      `${release.package} does not match the approved package release.`,
    )
  }
}

function packageReference(value: string): {
  package: string
  version?: string
} {
  const normalized = value.trim()
  let packageName = normalized
  let version: string | undefined
  if (normalized.startsWith('@')) {
    const slash = normalized.indexOf('/')
    const separator = normalized.lastIndexOf('@')
    if (slash > 1 && separator > slash) {
      packageName = normalized.slice(0, separator)
      version = normalized.slice(separator + 1)
    }
  } else {
    const separator = normalized.lastIndexOf('@')
    if (separator > 0) {
      packageName = normalized.slice(0, separator)
      version = normalized.slice(separator + 1)
    }
  }
  if (
    !providerPackageNameSchema.safeParse(packageName).success ||
    (version !== undefined &&
      !providerExactVersionSchema.safeParse(version).success)
  ) {
    throw new Error(
      `Provider package must be an npm package name with an optional exact version, such as ${PACKAGE_REFERENCE_EXAMPLE}.`,
    )
  }
  return { package: packageName, ...(version ? { version } : {}) }
}

function repository(
  value: z.infer<typeof npmPackageMetadataSchema>['repository'],
): string | undefined {
  const raw = typeof value === 'string' ? value : value?.url
  return raw?.replace(/^git\+/u, '').replace(/\.git$/u, '')
}

function publisher(
  metadata: z.infer<typeof npmPackageMetadataSchema>,
): string | undefined {
  if (typeof metadata._npmUser === 'string') return metadata._npmUser
  if (metadata._npmUser?.name) return metadata._npmUser.name
  if (typeof metadata.author === 'string') return metadata.author
  if (metadata.author?.name) return metadata.author.name
  const maintainer = metadata.maintainers?.[0]
  return typeof maintainer === 'string' ? maintainer : maintainer?.name
}

async function packageMetadata(
  packageName: string,
  version: string | undefined,
  input: { packagesDir: string; run: ProviderPackageCommand },
): Promise<z.infer<typeof npmPackageMetadataSchema>> {
  const result = await input.run(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['view', version ? `${packageName}@${version}` : packageName, '--json'],
    { cwd: input.packagesDir },
  )
  const parsed = npmPackageMetadataSchema.parse(JSON.parse(result.stdout))
  if (parsed.name !== packageName) {
    throw new Error(
      `npm returned metadata for ${parsed.name}, not ${packageName}.`,
    )
  }
  if (version && parsed.version !== version) {
    throw new Error(
      `npm returned ${parsed.name}@${parsed.version}, not ${packageName}@${version}.`,
    )
  }
  assertBoundedPackage(parsed)
  return parsed
}

export async function inspectProviderPackage(
  value: string,
  options: ProviderInstallerOptions = {},
): Promise<ProviderPackageRelease> {
  const packagesDir =
    options.packagesDir ?? getSeoCliPaths().providerPackagesDir
  const run = options.run ?? defaultCommand
  const reference = packageReference(value)
  ensurePackageRoot(packagesDir)
  const metadata = await packageMetadata(reference.package, reference.version, {
    packagesDir,
    run,
  })
  return providerPackageReleaseSchema.parse({
    package: metadata.name,
    version: metadata.version,
    integrity: metadata.dist.integrity,
    unpackedSize: metadata.dist.unpackedSize,
    apiVersion: metadata.seo.apiVersion,
    entryPoints: metadata.seo.providers.length,
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(repository(metadata.repository)
      ? { repository: repository(metadata.repository) }
      : {}),
    ...(publisher(metadata) ? { publisher: publisher(metadata) } : {}),
  })
}

export async function installProviderPackage(
  input: ProviderPackageRelease,
  options: ProviderInstallerOptions = {},
): Promise<InstalledProviderPackage> {
  const release = providerPackageReleaseSchema.parse(input)
  const packagesDir =
    options.packagesDir ?? getSeoCliPaths().providerPackagesDir
  const run = options.run ?? defaultCommand
  const current = readInstalledProviderPackages()
  if (current.packages.some((item) => item.package === release.package)) {
    throw new Error(
      `${release.package} is already installed. Remove it before installing another version.`,
    )
  }
  ensurePackageRoot(packagesDir)
  const metadata = await packageMetadata(release.package, release.version, {
    packagesDir,
    run,
  })
  if (
    metadata.version !== release.version ||
    metadata.dist.integrity !== release.integrity ||
    metadata.seo.apiVersion !== release.apiVersion ||
    metadata.seo.providers.length !== release.entryPoints
  ) {
    throw new Error(
      `${release.package} npm metadata changed after approval. Run the install command again to review it.`,
    )
  }
  await run(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--legacy-peer-deps',
      '--omit=optional',
      '--save-exact',
      `${release.package}@${release.version}`,
    ],
    { cwd: packagesDir },
  )

  try {
    assertInstalledRelease(packagesDir, release)
    const registered = await loadProviderPackage(
      { package: release.package, version: release.version },
      { packagesDir },
    )
    if (registered.length !== 1) {
      throw new Error(
        `${release.package} must register exactly one provider; received ${registered.length}.`,
      )
    }
    const provider = registered[0]
    if (!provider) {
      throw new Error(`${release.package} did not register a provider.`)
    }
    if (current.packages.some((item) => item.id === provider.id)) {
      throw new Error(`Provider ${provider.id} is already installed.`)
    }
    const record: InstalledProviderPackage = {
      id: provider.id,
      package: release.package,
      version: release.version,
      integrity: release.integrity,
      enabled: true,
      installedAt: (options.now ?? (() => new Date()))().toISOString(),
    }
    saveInstalledProviderPackage(record)
    return record
  } catch (error) {
    await run(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        'uninstall',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        release.package,
      ],
      { cwd: packagesDir },
    ).catch(() => undefined)
    throw error
  }
}

export async function uninstallProviderExtension(
  id: string,
  options: ProviderInstallerOptions = {},
): Promise<InstalledProviderPackage | undefined> {
  const packagesDir =
    options.packagesDir ?? getSeoCliPaths().providerPackagesDir
  const run = options.run ?? defaultCommand
  const provider = readInstalledProviderPackages().packages.find(
    (item) => item.id === id,
  )
  if (!provider) return undefined
  await run(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'uninstall',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      provider.package,
    ],
    { cwd: packagesDir },
  )
  return removeInstalledProviderPackage(id)
}
