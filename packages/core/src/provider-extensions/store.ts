import { existsSync } from 'node:fs'
import { ensureSeoCliDirs, getSeoCliPaths } from '../paths.js'
import { readJsonFile, safeRemove, writeJsonAtomic } from '../storage/files.js'
import {
  type InstalledProviderPackage,
  type InstalledProviderPackages,
  installedProviderPackageSchema,
  installedProviderPackagesSchema,
} from './contracts.js'

const PRIVATE_FILE_MODE = 0o600

function emptyStore(): InstalledProviderPackages {
  return { schemaVersion: 1, packages: [] }
}

export function readInstalledProviderPackages(): InstalledProviderPackages {
  const path = getSeoCliPaths().installedProviderPackagesFile
  const raw = readJsonFile<unknown>(path)
  if (raw === undefined && !existsSync(path)) return emptyStore()
  const parsed = installedProviderPackagesSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      'Installed provider package records are invalid. Run `seo providers doctor` for details.',
    )
  }
  return parsed.data
}

export function writeInstalledProviderPackages(
  value: InstalledProviderPackages,
): InstalledProviderPackages {
  const parsed = installedProviderPackagesSchema.parse(value)
  ensureSeoCliDirs()
  if (parsed.packages.length === 0) {
    safeRemove(getSeoCliPaths().installedProviderPackagesFile)
    return parsed
  }
  const sorted = {
    ...parsed,
    packages: [...parsed.packages].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  }
  writeJsonAtomic(
    getSeoCliPaths().installedProviderPackagesFile,
    sorted,
    PRIVATE_FILE_MODE,
  )
  return sorted
}

export function saveInstalledProviderPackage(
  value: InstalledProviderPackage,
): InstalledProviderPackages {
  const provider = installedProviderPackageSchema.parse(value)
  const current = readInstalledProviderPackages()
  const existing = current.packages.find((item) => item.id === provider.id)
  const packageOwner = current.packages.find(
    (item) => item.package === provider.package && item.id !== provider.id,
  )
  if (packageOwner) {
    throw new Error(
      `${provider.package} is already recorded for provider ${packageOwner.id}.`,
    )
  }
  const packages = existing
    ? current.packages.map((item) =>
        item.id === provider.id ? provider : item,
      )
    : [...current.packages, provider]
  return writeInstalledProviderPackages({ schemaVersion: 1, packages })
}

export function removeInstalledProviderPackage(
  id: string,
): InstalledProviderPackage | undefined {
  const current = readInstalledProviderPackages()
  const removed = current.packages.find((provider) => provider.id === id)
  if (!removed) return undefined
  writeInstalledProviderPackages({
    schemaVersion: 1,
    packages: current.packages.filter((provider) => provider.id !== id),
  })
  return removed
}
