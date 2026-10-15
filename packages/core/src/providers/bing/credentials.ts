import { PROVIDER_SECRET_NAMES } from '../../storage/provider-secrets.js'
import { createApiKeyCredentialStore } from '../api-key-credentials.js'

// The Bing Webmaster API key for the CLI and the local MCP. The hosted MCP
// links Bing with Bing's own sign-in instead.

export const BING_API_KEY_ENV = 'SEO_BING_API_KEY'
export const BING_API_KEY_SECRET = PROVIDER_SECRET_NAMES.bingApiKey

const store = createApiKeyCredentialStore({
  provider: 'bing',
  environmentVariable: BING_API_KEY_ENV,
  secretName: BING_API_KEY_SECRET,
  invalidMessage: 'Bing Webmaster needs a valid API key.',
})

export async function writeBingApiKey(value: string) {
  return store.write(value)
}

export async function readBingApiKey(input: { env?: NodeJS.ProcessEnv } = {}) {
  return store.read(input)
}

export async function deleteBingApiKey(): Promise<void> {
  await store.remove()
}
