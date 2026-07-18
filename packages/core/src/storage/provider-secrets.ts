import { getSeoCliPaths } from '../paths.js'
import { readConfig } from './config.js'
import { readJsonFile, safeRemove, writeJsonAtomic } from './files.js'
import {
  deleteKeyringPassword,
  getKeyringPassword,
  setKeyringPassword,
} from './keyring.js'

const KEYRING_SERVICE = 'seo'
const PRIVATE_FILE_MODE = 0o600

type ProviderSecretsFile = {
  version: 1
  secrets: Record<string, string>
}

export type ProviderSecretSource = 'environment' | 'keychain' | 'file'

export type ProviderSecret = {
  value: string
  source: ProviderSecretSource
}

function account(name: string): string {
  return `provider:${name}`
}

function readFile(): ProviderSecretsFile {
  return (
    readJsonFile<ProviderSecretsFile>(getSeoCliPaths().providerSecretsFile) ?? {
      version: 1,
      secrets: {},
    }
  )
}

function writeFile(file: ProviderSecretsFile): void {
  const path = getSeoCliPaths().providerSecretsFile
  if (Object.keys(file.secrets).length === 0) {
    safeRemove(path)
    return
  }
  writeJsonAtomic(path, file, PRIVATE_FILE_MODE)
}

function deleteFileSecret(name: string): void {
  const file = readFile()
  if (!(name in file.secrets)) return
  delete file.secrets[name]
  writeFile(file)
}

export async function readProviderSecret(input: {
  name: string
  envVar?: string
  env?: NodeJS.ProcessEnv
}): Promise<ProviderSecret | undefined> {
  const environment = input.env ?? process.env
  const environmentValue = input.envVar
    ? environment[input.envVar]?.trim()
    : undefined
  if (environmentValue) {
    return { value: environmentValue, source: 'environment' }
  }

  if (readConfig().security.useKeychain) {
    try {
      const value = await getKeyringPassword(
        KEYRING_SERVICE,
        account(input.name),
      )
      if (value) return { value, source: 'keychain' }
    } catch {
      // Headless and locked environments use the private file fallback.
    }
  }

  const value = readFile().secrets[input.name]
  return value ? { value, source: 'file' } : undefined
}

export async function writeProviderSecret(
  name: string,
  value: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  const normalized = value.trim()
  if (!normalized) throw new Error('Provider secret cannot be empty.')

  if (readConfig().security.useKeychain) {
    try {
      await setKeyringPassword(KEYRING_SERVICE, account(name), normalized)
      deleteFileSecret(name)
      return 'keychain'
    } catch {
      // Preserve local usability when the system keychain is unavailable.
    }
  }

  const file = readFile()
  file.secrets[name] = normalized
  writeFile(file)
  return 'file'
}

export async function deleteProviderSecret(name: string): Promise<void> {
  await deleteKeyringPassword(KEYRING_SERVICE, account(name)).catch(() => false)
  deleteFileSecret(name)
}
