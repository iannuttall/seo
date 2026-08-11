import { PROVIDER_SECRET_NAMES } from '../../storage/provider-secrets.js'
import { createApiKeyCredentialStore } from '../api-key-credentials.js'

export const AHREFS_API_KEY_ENV = 'SEO_AHREFS_API_KEY'
export const AHREFS_API_KEY_SECRET = PROVIDER_SECRET_NAMES.ahrefsApiKey

const store = createApiKeyCredentialStore({
  provider: 'ahrefs',
  environmentVariable: AHREFS_API_KEY_ENV,
  secretName: AHREFS_API_KEY_SECRET,
  invalidMessage: 'Ahrefs needs a valid API v3 key.',
})

export type StoredAhrefsApiKey = NonNullable<
  Awaited<ReturnType<typeof store.read>>
>

export async function writeAhrefsApiKey(value: string) {
  return store.write(value)
}

export async function readAhrefsApiKey(
  input: { env?: NodeJS.ProcessEnv } = {},
) {
  return store.read(input)
}

export async function deleteAhrefsApiKey(): Promise<void> {
  await store.remove()
}
