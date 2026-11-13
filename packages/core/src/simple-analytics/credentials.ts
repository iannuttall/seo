import { ProviderError } from '../providers/errors.js'
import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'
import { isSimpleAnalyticsKey } from './api.js'

// A Simple Analytics API key saved on this machine only, or set in the
// environment. A key saved on the seoskill.dev account needs nothing here.

export const SIMPLE_ANALYTICS_KEY_ENV = 'SEO_SIMPLE_ANALYTICS_KEY'
const SECRET = PROVIDER_SECRET_NAMES.simpleAnalyticsKey

function checked(value: string): string {
  const key = value.trim()
  if (!isSimpleAnalyticsKey(key)) {
    throw new ProviderError({
      provider: 'simple-analytics',
      operation: 'credentials',
      code: 'configuration',
      message:
        'Simple Analytics needs an API key that starts with sa_api_key_ (Account settings, API keys).',
    })
  }
  return key
}

export async function readSimpleAnalyticsKey(): Promise<
  { key: string; source: ProviderSecretSource } | undefined
> {
  const saved = await readProviderSecret({
    name: SECRET,
    envVar: SIMPLE_ANALYTICS_KEY_ENV,
  })
  return saved ? { key: checked(saved.value), source: saved.source } : undefined
}

export async function writeSimpleAnalyticsKey(
  value: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  return writeProviderSecret(SECRET, checked(value))
}

export async function deleteSimpleAnalyticsKey(): Promise<void> {
  await deleteProviderSecret(SECRET)
}
