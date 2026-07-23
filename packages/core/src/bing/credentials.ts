import { SeoError } from '../errors.js'
import {
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
} from '../storage/provider-secrets.js'
import { BingWebmasterClient } from './client.js'

export const BING_API_KEY_SECRET = PROVIDER_SECRET_NAMES.bingApiKey
export const BING_API_KEY_ENV = 'SEO_BING_API_KEY'

export async function createBingWebmasterClient(
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<{
  client: BingWebmasterClient
  credentialSource: ProviderSecretSource
}> {
  const secret = await readProviderSecret({
    name: BING_API_KEY_SECRET,
    envVar: BING_API_KEY_ENV,
    env: input.env,
  })
  if (!secret) {
    throw new SeoError(
      'AUTH_REQUIRED',
      'Bing Webmaster is not connected. Run `seo providers bing connect`, or set SEO_BING_API_KEY for this process.',
    )
  }
  return {
    client: new BingWebmasterClient({ apiKey: secret.value }),
    credentialSource: secret.source,
  }
}
