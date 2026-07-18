import { chmodSync, statSync } from 'node:fs'
import { ensureSeoCliDirs, getSeoCliPaths } from '../paths.js'
import {
  type AppConfig,
  configSchema,
  type StoredTokens,
  tokenSchema,
} from '../types.js'
import { fileMode, readJsonFile, safeRemove, writeJsonAtomic } from './files.js'
import {
  deleteKeyringPassword,
  getKeyringPassword,
  setKeyringPassword,
} from './keyring.js'

const KEYRING_SERVICE = 'seo'
const PRIVATE_FILE_MODE = 0o600

export type TokenStorageMode = 'keychain' | 'file'
export type TokenStorageStatus = {
  configured: TokenStorageMode
  active: TokenStorageMode
  reason?: string
}

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

function tokenStorageMode(config: AppConfig): TokenStorageMode {
  return config.security.useKeychain ? 'keychain' : 'file'
}

function hasTokenSecrets(tokens: StoredTokens): boolean {
  return Boolean(tokens.access_token || tokens.refresh_token)
}

function tokenMetadata(tokens: StoredTokens): StoredTokens {
  return {
    ...tokens,
    access_token: undefined,
    refresh_token: undefined,
  }
}

async function readKeyringTokens(tokens: StoredTokens): Promise<{
  accessToken?: string
  refreshToken?: string
}> {
  const account = getKeyringAccount(tokens)
  const [accessToken, refreshToken] = await Promise.all([
    getKeyringPassword(KEYRING_SERVICE, `${account}:access`),
    getKeyringPassword(KEYRING_SERVICE, `${account}:refresh`),
  ])
  return {
    accessToken: accessToken ?? undefined,
    refreshToken: refreshToken ?? undefined,
  }
}

async function writeKeyringTokens(tokens: StoredTokens): Promise<void> {
  const account = getKeyringAccount(tokens)
  if (tokens.access_token) {
    await setKeyringPassword(
      KEYRING_SERVICE,
      `${account}:access`,
      tokens.access_token,
    )
  } else {
    await deleteKeyringPassword(KEYRING_SERVICE, `${account}:access`)
  }
  if (tokens.refresh_token) {
    await setKeyringPassword(
      KEYRING_SERVICE,
      `${account}:refresh`,
      tokens.refresh_token,
    )
  } else {
    await deleteKeyringPassword(KEYRING_SERVICE, `${account}:refresh`)
  }
}

async function deleteKeyringTokens(tokens: StoredTokens): Promise<void> {
  const account = getKeyringAccount(tokens)
  await Promise.all([
    deleteKeyringPassword(KEYRING_SERVICE, `${account}:access`),
    deleteKeyringPassword(KEYRING_SERVICE, `${account}:refresh`),
  ])
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

  try {
    const keyringTokens = await readKeyringTokens(parsed)
    if (hasTokenSecrets(parsed)) {
      await writeKeyringTokens(parsed)
      writeJsonAtomic(
        getSeoCliPaths().tokensFile,
        tokenMetadata(parsed),
        PRIVATE_FILE_MODE,
      )
      return parsed
    }
    return {
      ...parsed,
      access_token: keyringTokens.accessToken,
      refresh_token: keyringTokens.refreshToken,
    }
  } catch {
    return parsed
  }
}

export async function writeTokens(tokens: StoredTokens): Promise<void> {
  ensureSeoCliDirs()
  const parsed = tokenSchema.parse(tokens)
  const config = readConfig()

  if (config.security.useKeychain) {
    try {
      await writeKeyringTokens(parsed)
      writeJsonAtomic(
        getSeoCliPaths().tokensFile,
        tokenMetadata(parsed),
        PRIVATE_FILE_MODE,
      )
      return
    } catch {
      // A headless Linux host or a locked desktop keychain should not prevent
      // local OAuth from working. The private file remains the fallback.
    }
  }

  writeJsonAtomic(getSeoCliPaths().tokensFile, parsed, PRIVATE_FILE_MODE)
}

export async function deleteTokens(): Promise<void> {
  const tokens = await readTokens()
  if (tokens) {
    await deleteKeyringTokens(tokens).catch(() => undefined)
  }

  safeRemove(getSeoCliPaths().tokensFile)
}

export async function getTokenStorageStatus(): Promise<TokenStorageStatus> {
  ensureSeoCliDirs()
  const config = readConfig()
  const configured = tokenStorageMode(config)
  if (configured === 'file') {
    return { configured, active: 'file' }
  }

  const raw = readJsonFile<StoredTokens>(getSeoCliPaths().tokensFile)
  if (!raw) return { configured, active: 'keychain' }
  const tokens = tokenSchema.parse(raw)
  if (hasTokenSecrets(tokens)) {
    return {
      configured,
      active: 'file',
      reason:
        'Private token file will move to the keychain when it is available.',
    }
  }

  try {
    await readKeyringTokens(tokens)
    return { configured, active: 'keychain' }
  } catch {
    return {
      configured,
      active: 'file',
      reason:
        'The system keychain is unavailable, so seo is using its private file fallback.',
    }
  }
}

export async function setTokenStorageMode(
  mode: TokenStorageMode,
): Promise<TokenStorageStatus> {
  const tokens = await readTokens()
  const config = readConfig()
  writeConfig({
    ...config,
    security: { ...config.security, useKeychain: mode === 'keychain' },
  })

  if (tokens) {
    await writeTokens(tokens)
    if (mode === 'file') {
      await deleteKeyringTokens(tokens).catch(() => undefined)
    }
  }

  return getTokenStorageStatus()
}

export function readOauthClient():
  | { clientId: string; clientSecret: string }
  | undefined {
  ensureSeoCliDirs()
  const raw = readJsonFile<{ clientId: string; clientSecret: string }>(
    getSeoCliPaths().oauthClientFile,
  )
  return raw?.clientId && raw?.clientSecret ? raw : undefined
}

export function writeOauthClient(client: {
  clientId: string
  clientSecret: string
}): void {
  ensureSeoCliDirs()
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
      label: 'Provider secrets',
      path: paths.providerSecretsFile,
      mode: fileMode(paths.providerSecretsFile),
      sizeBytes: sizeOf(paths.providerSecretsFile),
    },
    {
      label: 'Telemetry state',
      path: paths.telemetryStateFile,
      mode: fileMode(paths.telemetryStateFile),
      sizeBytes: sizeOf(paths.telemetryStateFile),
    },
    {
      label: 'Cache DB',
      path: paths.cacheDbFile,
      mode: fileMode(paths.cacheDbFile),
      sizeBytes: sizeOf(paths.cacheDbFile),
    },
  ]
}
