import { readConfig, readOauthClient } from '../../storage/config.js'
import { SHARED_OAUTH_CLIENT } from '../shared-client.generated.js'
import type { OAuthClientConfig } from './types.js'

export function getAuthModeStatus(): {
  sharedConfigured: boolean
  byoConfigured: boolean
} {
  const byo = readOauthClient()

  return {
    sharedConfigured: Boolean(getSharedClientConfig()),
    byoConfigured: Boolean(byo?.clientId && byo?.clientSecret),
  }
}

function getSharedClientConfig(): OAuthClientConfig | undefined {
  const config = readConfig()
  const clientId =
    process.env.SEO_GOOGLE_CLIENT_ID ??
    process.env.GSC_CLIENT_ID ??
    SHARED_OAUTH_CLIENT.clientId ??
    config.auth.sharedClientId
  const clientSecret =
    process.env.SEO_GOOGLE_CLIENT_SECRET ??
    process.env.GSC_CLIENT_SECRET ??
    SHARED_OAUTH_CLIENT.clientSecret ??
    config.auth.sharedClientSecret
  if (!clientId || !clientSecret) {
    return undefined
  }

  return { clientId, clientSecret, source: 'shared' }
}

export function getClientConfig(
  source?: OAuthClientConfig['source'],
): OAuthClientConfig | undefined {
  const byo = readOauthClient()
  if (source !== 'shared' && byo) {
    return {
      clientId: byo.clientId,
      clientSecret: byo.clientSecret,
      source: 'byo',
    }
  }
  if (source === 'byo') return undefined
  return getSharedClientConfig()
}

export function missingOAuthClientMessage(
  source: OAuthClientConfig['source'],
): string {
  return source === 'shared'
    ? 'The stored Google login uses the shared seo app, but this build does not include that OAuth client. Reinstall `seo`, then run `seo auth login` again.'
    : 'The stored Google login uses a BYO OAuth client that is no longer configured. Restore the same client with `seo auth setup-client`, or run `seo auth logout` before signing in with a different client.'
}
