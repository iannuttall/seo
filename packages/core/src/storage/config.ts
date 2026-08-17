import { chmodSync, statSync } from 'node:fs'
import { ensureSeoCliDirs, getSeoCliPaths } from '../paths.js'
import {
  type AppConfig,
  configSchema,
  type StoredTokenStore,
  type StoredTokens,
  tokenSchema,
  tokenStoreSchema,
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

function sameAccount(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function parseTokenStore(raw: unknown): StoredTokenStore | undefined {
  if (raw === undefined || raw === null) return undefined
  const store = tokenStoreSchema.safeParse(raw)
  if (store.success) return store.data
  const legacy = tokenSchema.safeParse(raw)
  if (!legacy.success) return tokenStoreSchema.parse(raw)
  return {
    version: 2,
    active_account: legacy.data.account_email,
    accounts: [legacy.data],
  }
}

function readRawTokenStore(): StoredTokenStore | undefined {
  ensureSeoCliDirs()
  return parseTokenStore(readJsonFile<unknown>(getSeoCliPaths().tokensFile))
}

function writeTokenStore(store: StoredTokenStore): void {
  writeJsonAtomic(
    getSeoCliPaths().tokensFile,
    tokenStoreSchema.parse(store),
    PRIVATE_FILE_MODE,
  )
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

async function hydrateTokens(tokens: StoredTokens): Promise<StoredTokens> {
  const config = readConfig()
  if (!config.security.useKeychain || hasTokenSecrets(tokens)) {
    return tokens
  }

  try {
    const keyringTokens = await readKeyringTokens(tokens)
    return {
      ...tokens,
      access_token: keyringTokens.accessToken,
      refresh_token: keyringTokens.refreshToken,
    }
  } catch {
    return tokens
  }
}

export async function readAllTokens(): Promise<StoredTokens[]> {
  const store = readRawTokenStore()
  if (!store) return []
  return Promise.all(store.accounts.map((tokens) => hydrateTokens(tokens)))
}

export async function readTokens(
  accountEmail?: string,
): Promise<StoredTokens | undefined> {
  const store = readRawTokenStore()
  if (!store) return undefined
  const selected = accountEmail
    ? store.accounts.find((tokens) =>
        sameAccount(tokens.account_email, accountEmail),
      )
    : store.accounts.find((tokens) =>
        sameAccount(tokens.account_email, store.active_account),
      )
  return selected ? hydrateTokens(selected) : undefined
}

export function listGoogleAccounts(): Array<{
  accountEmail: string
  scopes: string[]
  expiresAt: number
  active: boolean
}> {
  const store = readRawTokenStore()
  if (!store) return []
  return store.accounts.map((tokens) => ({
    accountEmail: tokens.account_email,
    scopes: tokens.scope.split(/\s+/u).filter(Boolean),
    expiresAt: tokens.expires_at,
    active: sameAccount(tokens.account_email, store.active_account),
  }))
}

export function setActiveGoogleAccount(accountEmail: string): void {
  const store = readRawTokenStore()
  const account = store?.accounts.find((tokens) =>
    sameAccount(tokens.account_email, accountEmail),
  )
  if (!store || !account) {
    throw new Error(`Google account is not connected: ${accountEmail}`)
  }
  writeTokenStore({ ...store, active_account: account.account_email })
}

export async function writeTokens(
  tokens: StoredTokens,
  options: { makeActive?: boolean } = {},
): Promise<void> {
  ensureSeoCliDirs()
  const parsedInput = tokenSchema.parse(tokens)
  const config = readConfig()
  const current = readRawTokenStore()
  const existing = current?.accounts.find((item) =>
    sameAccount(item.account_email, parsedInput.account_email),
  )
  const existingTokens = existing ? await hydrateTokens(existing) : undefined
  const parsed = tokenSchema.parse({
    ...parsedInput,
    refresh_token: parsedInput.refresh_token ?? existingTokens?.refresh_token,
  })
  const accounts = [
    ...(current?.accounts.filter(
      (item) => !sameAccount(item.account_email, parsed.account_email),
    ) ?? []),
    parsed,
  ]
  const activeAccount =
    options.makeActive === false && current
      ? current.active_account
      : parsed.account_email
  const nextStore = tokenStoreSchema.parse({
    version: 2,
    active_account: activeAccount,
    accounts,
  })

  if (config.security.useKeychain) {
    try {
      for (const item of accounts.filter(hasTokenSecrets)) {
        await writeKeyringTokens(item)
      }
      writeTokenStore({
        ...nextStore,
        accounts: nextStore.accounts.map(tokenMetadata),
      })
      return
    } catch {
      // A headless Linux host or a locked desktop keychain should not prevent
      // local OAuth from working. The private file remains the fallback.
    }
  }

  writeTokenStore(nextStore)
}

export async function deleteTokens(accountEmail?: string): Promise<void> {
  const path = getSeoCliPaths().tokensFile
  const store = readRawTokenStore()
  if (!store) {
    safeRemove(path)
    return
  }
  const targets = accountEmail
    ? store.accounts.filter((tokens) =>
        sameAccount(tokens.account_email, accountEmail),
      )
    : store.accounts
  if (accountEmail && targets.length === 0) {
    throw new Error(`Google account is not connected: ${accountEmail}`)
  }
  for (const tokens of targets) {
    const keyringBacked = !hasTokenSecrets(tokens)
    try {
      await deleteKeyringTokens(tokens)
    } catch (error) {
      if (keyringBacked) {
        throw new Error(
          'Google tokens could not be removed from the system keychain. Unlock the keychain and try again.',
          { cause: error },
        )
      }
    }
  }

  if (!accountEmail || targets.length === store.accounts.length) {
    safeRemove(path)
    return
  }
  const accounts = store.accounts.filter(
    (tokens) => !sameAccount(tokens.account_email, accountEmail),
  )
  const activeAccount = sameAccount(store.active_account, accountEmail)
    ? (accounts[0]?.account_email ?? '')
    : store.active_account
  writeTokenStore({
    version: 2,
    active_account: activeAccount,
    accounts,
  })
}

export async function getTokenStorageStatus(): Promise<TokenStorageStatus> {
  ensureSeoCliDirs()
  const config = readConfig()
  const configured = tokenStorageMode(config)
  if (configured === 'file') {
    return { configured, active: 'file' }
  }

  const store = readRawTokenStore()
  if (!store) return { configured, active: 'keychain' }
  if (store.accounts.some(hasTokenSecrets)) {
    return {
      configured,
      active: 'file',
      reason:
        'Private token file will move to the keychain when it is available.',
    }
  }

  try {
    await Promise.all(store.accounts.map((tokens) => readKeyringTokens(tokens)))
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
  const tokens = await readAllTokens()
  const activeAccount = listGoogleAccounts().find(
    (account) => account.active,
  )?.accountEmail
  const config = readConfig()
  writeConfig({
    ...config,
    security: { ...config.security, useKeychain: mode === 'keychain' },
  })

  if (tokens.length > 0) {
    for (const item of tokens) {
      await writeTokens(item, {
        makeActive: sameAccount(item.account_email, activeAccount ?? ''),
      })
    }
    if (mode === 'file') {
      await Promise.all(
        tokens.map((item) => deleteKeyringTokens(item).catch(() => undefined)),
      )
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
