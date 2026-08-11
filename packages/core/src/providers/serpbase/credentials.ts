import { PROVIDER_SECRET_NAMES } from '../../storage/provider-secrets.js'
import { createApiKeyCredentialStore } from '../api-key-credentials.js'

export const SERPBASE_API_KEY_ENV = 'SEO_SERPBASE_API_KEY'
export const SERPBASE_API_KEY_SECRET = PROVIDER_SECRET_NAMES.serpBaseApiKey

const store = createApiKeyCredentialStore({
  provider: 'serpbase',
  environmentVariable: SERPBASE_API_KEY_ENV,
  secretName: SERPBASE_API_KEY_SECRET,
  invalidMessage: 'SerpBase needs a valid API key.',
})

export type StoredSerpBaseApiKey = NonNullable<
  Awaited<ReturnType<typeof store.read>>
>

export async function writeSerpBaseApiKey(value: string) {
  return store.write(value)
}

export async function readSerpBaseApiKey(
  input: { env?: NodeJS.ProcessEnv } = {},
) {
  return store.read(input)
}

export async function deleteSerpBaseApiKey(): Promise<void> {
  await store.remove()
}
