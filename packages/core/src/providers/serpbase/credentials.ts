import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../../storage/provider-secrets.js'
import { ProviderError } from '../errors.js'

export const SERPBASE_API_KEY_ENV = 'SEO_SERPBASE_API_KEY'
export const SERPBASE_API_KEY_SECRET = PROVIDER_SECRET_NAMES.serpBaseApiKey

export type StoredSerpBaseApiKey = {
  apiKey: string
  source: ProviderSecretSource
}

function configurationError(message: string): ProviderError {
  return new ProviderError({
    provider: 'serpbase',
    operation: 'credentials',
    code: 'configuration',
    message,
  })
}

function normalizeApiKey(value: string): string {
  const apiKey = value.trim()
  if (!apiKey || apiKey.length > 4_096) {
    throw configurationError('SerpBase needs a valid API key.')
  }
  return apiKey
}

export async function writeSerpBaseApiKey(
  value: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  return writeProviderSecret(SERPBASE_API_KEY_SECRET, normalizeApiKey(value))
}

export async function readSerpBaseApiKey(
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<StoredSerpBaseApiKey | undefined> {
  const credential = await readProviderSecret({
    name: SERPBASE_API_KEY_SECRET,
    envVar: SERPBASE_API_KEY_ENV,
    env: input.env,
  })
  return credential
    ? { apiKey: normalizeApiKey(credential.value), source: credential.source }
    : undefined
}

export async function deleteSerpBaseApiKey(): Promise<void> {
  await deleteProviderSecret(SERPBASE_API_KEY_SECRET)
}
