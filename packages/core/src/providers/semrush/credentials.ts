import { readConfig, writeConfig } from '../../storage/config.js'
import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../../storage/provider-secrets.js'
import { ProviderError } from '../errors.js'

export const SEMRUSH_API_KEY_ENV = 'SEO_SEMRUSH_API_KEY'
export const SEMRUSH_API_KEY_SECRET = PROVIDER_SECRET_NAMES.semrushApiKey

export type StoredSemrushApiKey = {
  apiKey: string
  source: ProviderSecretSource
  migrated: boolean
}

function configurationError(message: string): ProviderError {
  return new ProviderError({
    provider: 'semrush',
    operation: 'credentials',
    code: 'configuration',
    message,
  })
}

function normalizeApiKey(value: string): string {
  const apiKey = value.trim()
  if (!apiKey || apiKey.length > 4_096) {
    throw configurationError('Semrush needs a valid Version 3 API key.')
  }
  return apiKey
}

function versionedV3ApiKey(value: string): string | undefined {
  if (!value.trim().startsWith('{')) return undefined
  try {
    const parsed = JSON.parse(value) as {
      schemaVersion?: unknown
      apiKeys?: { v3?: unknown }
    }
    if (parsed.schemaVersion === 1 && typeof parsed.apiKeys?.v3 === 'string') {
      return normalizeApiKey(parsed.apiKeys.v3)
    }
  } catch {
    // The configuration error below is safe and does not expose the secret.
  }
  throw configurationError(
    'The saved Semrush credential does not contain a Version 3 API key. Disconnect Semrush, then connect it again with the permanent Version 3 key.',
  )
}

function clearLegacyConfigApiKey(): boolean {
  const config = readConfig()
  if (!config.providers.semrushApiKey) return false
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      semrushApiKey: undefined,
    },
  })
  return true
}

async function migrateLegacyApiKey(): Promise<StoredSemrushApiKey | undefined> {
  const legacyApiKey = readConfig().providers.semrushApiKey
  if (!legacyApiKey) return undefined
  const apiKey = normalizeApiKey(legacyApiKey)
  const source = await writeSemrushApiKey(apiKey)
  return { apiKey, source, migrated: true }
}

export async function writeSemrushApiKey(
  value: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  const apiKey = normalizeApiKey(value)
  const source = await writeProviderSecret(SEMRUSH_API_KEY_SECRET, apiKey)
  clearLegacyConfigApiKey()
  return source
}

export async function readSemrushApiKey(
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<StoredSemrushApiKey | undefined> {
  const credential = await readProviderSecret({
    name: SEMRUSH_API_KEY_SECRET,
    envVar: SEMRUSH_API_KEY_ENV,
    env: input.env,
  })
  if (credential) {
    const versionedApiKey =
      credential.source === 'environment'
        ? undefined
        : versionedV3ApiKey(credential.value)
    const apiKey = versionedApiKey ?? normalizeApiKey(credential.value)
    const migratedVersionedCredential = Boolean(versionedApiKey)
    const source = migratedVersionedCredential
      ? await writeProviderSecret(SEMRUSH_API_KEY_SECRET, apiKey)
      : credential.source
    const migratedLegacyConfig = clearLegacyConfigApiKey()
    return {
      apiKey,
      source,
      migrated:
        credential.source === 'environment'
          ? false
          : migratedVersionedCredential || migratedLegacyConfig,
    }
  }
  return migrateLegacyApiKey()
}

export async function deleteSemrushApiKey(): Promise<void> {
  await deleteProviderSecret(SEMRUSH_API_KEY_SECRET)
  clearLegacyConfigApiKey()
}
