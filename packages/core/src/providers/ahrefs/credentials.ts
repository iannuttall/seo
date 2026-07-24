import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../../storage/provider-secrets.js'
import { ProviderError } from '../errors.js'

export const AHREFS_API_KEY_ENV = 'SEO_AHREFS_API_KEY'
export const AHREFS_API_KEY_SECRET = PROVIDER_SECRET_NAMES.ahrefsApiKey

export type StoredAhrefsApiKey = {
  apiKey: string
  source: ProviderSecretSource
}

function configurationError(message: string): ProviderError {
  return new ProviderError({
    provider: 'ahrefs',
    operation: 'credentials',
    code: 'configuration',
    message,
  })
}

function normalizeApiKey(value: string): string {
  const apiKey = value.trim()
  if (!apiKey || apiKey.length > 4_096) {
    throw configurationError('Ahrefs needs a valid API v3 key.')
  }
  return apiKey
}

export async function writeAhrefsApiKey(
  value: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  return writeProviderSecret(AHREFS_API_KEY_SECRET, normalizeApiKey(value))
}

export async function readAhrefsApiKey(
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<StoredAhrefsApiKey | undefined> {
  const credential = await readProviderSecret({
    name: AHREFS_API_KEY_SECRET,
    envVar: AHREFS_API_KEY_ENV,
    env: input.env,
  })
  return credential
    ? {
        apiKey: normalizeApiKey(credential.value),
        source: credential.source,
      }
    : undefined
}

export async function deleteAhrefsApiKey(): Promise<void> {
  await deleteProviderSecret(AHREFS_API_KEY_SECRET)
}
