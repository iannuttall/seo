import { chmodSync, statSync } from 'node:fs'
import * as KeytarCompat from '@napi-rs/keyring/keytar.js'
import { ensureSeoCliDirs, getSeoCliPaths } from '../paths.js'
import {
  type AppConfig,
  configSchema,
  type StoredTokens,
  tokenSchema,
} from '../types.js'
import { fileMode, readJsonFile, safeRemove, writeJsonAtomic } from './files.js'

const KEYRING_SERVICE = 'seo'
const PRIVATE_FILE_MODE = 0o600

function tightenConfigPermissions(path: string): void {
  try {
    chmodSync(path, PRIVATE_FILE_MODE)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export function readConfig(): AppConfig {
  ensureSeoCliDirs()
  const configFile = getSeoCliPaths().configFile
  tightenConfigPermissions(configFile)
  const raw = readJsonFile<AppConfig>(configFile)
  return configSchema.parse(raw ?? {})
}

export function writeConfig(config: AppConfig): void {
  ensureSeoCliDirs()
  writeJsonAtomic(
    getSeoCliPaths().configFile,
    configSchema.parse(config),
    PRIVATE_FILE_MODE,
  )
}

function getKeyringAccount(tokens: StoredTokens): string {
  return `google:${tokens.account_email}`
}

export async function readTokens(): Promise<StoredTokens | undefined> {
  ensureSeoCliDirs()
  const raw = readJsonFile<StoredTokens>(getSeoCliPaths().tokensFile)
  if (!raw) {
    return undefined
  }

  const parsed = tokenSchema.parse(raw)
  const config = readConfig()
  if (!config.security.useKeychain) {
    return parsed
  }

  const account = getKeyringAccount(parsed)
  const accessToken = await KeytarCompat.getPassword(
    KEYRING_SERVICE,
    `${account}:access`,
  )
  const refreshToken = await KeytarCompat.getPassword(
    KEYRING_SERVICE,
    `${account}:refresh`,
  )

  return {
    ...parsed,
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  }
}

export async function writeTokens(tokens: StoredTokens): Promise<void> {
  ensureSeoCliDirs()
  const parsed = tokenSchema.parse(tokens)
  const config = readConfig()

  if (config.security.useKeychain) {
    const account = getKeyringAccount(parsed)
    if (parsed.access_token) {
      await KeytarCompat.setPassword(
        KEYRING_SERVICE,
        `${account}:access`,
        parsed.access_token,
      )
    }
    if (parsed.refresh_token) {
      await KeytarCompat.setPassword(
        KEYRING_SERVICE,
        `${account}:refresh`,
        parsed.refresh_token,
      )
    }
    writeJsonAtomic(
      getSeoCliPaths().tokensFile,
      { ...parsed, access_token: undefined, refresh_token: undefined },
      0o600,
    )
    return
  }

  writeJsonAtomic(getSeoCliPaths().tokensFile, parsed, 0o600)
}

export async function deleteTokens(): Promise<void> {
  const tokens = await readTokens()
  if (tokens) {
    const account = getKeyringAccount(tokens)
    await KeytarCompat.deletePassword(
      KEYRING_SERVICE,
      `${account}:access`,
    ).catch(() => undefined)
    await KeytarCompat.deletePassword(
      KEYRING_SERVICE,
      `${account}:refresh`,
    ).catch(() => undefined)
  }

  safeRemove(getSeoCliPaths().tokensFile)
}

export function readOauthClient():
  | { clientId: string; clientSecret: string }
  | undefined {
  const raw = readJsonFile<{ clientId: string; clientSecret: string }>(
    getSeoCliPaths().oauthClientFile,
  )
  return raw?.clientId && raw?.clientSecret ? raw : undefined
}

export function writeOauthClient(client: {
  clientId: string
  clientSecret: string
}): void {
  writeJsonAtomic(getSeoCliPaths().oauthClientFile, client, 0o600)
}

export function getPrivacySnapshot(): Array<{
  label: string
  path: string
  mode: string
  sizeBytes: number
}> {
  const paths = getSeoCliPaths()
  const sizeOf = (path: string) => {
    try {
      return statSync(path).size
    } catch {
      return 0
    }
  }

  return [
    {
      label: 'Config',
      path: paths.configFile,
      mode: fileMode(paths.configFile),
      sizeBytes: sizeOf(paths.configFile),
    },
    {
      label: 'Tokens',
      path: paths.tokensFile,
      mode: fileMode(paths.tokensFile),
      sizeBytes: sizeOf(paths.tokensFile),
    },
    {
      label: 'OAuth client',
      path: paths.oauthClientFile,
      mode: fileMode(paths.oauthClientFile),
      sizeBytes: sizeOf(paths.oauthClientFile),
    },
    {
      label: 'Cache DB',
      path: paths.cacheDbFile,
      mode: fileMode(paths.cacheDbFile),
      sizeBytes: sizeOf(paths.cacheDbFile),
    },
  ]
}
