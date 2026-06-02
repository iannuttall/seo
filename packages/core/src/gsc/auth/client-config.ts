import { readConfig, readOauthClient } from '../../storage/config.js'
import { SHARED_OAUTH_CLIENT } from '../shared-client.generated.js'
import type { OAuthClientConfig } from './types.js'

export function getAuthModeStatus(): {
  sharedConfigured: boolean
  byoConfigured: boolean
} {
  const byo = readOauthClient()
  const config = readConfig()
  const sharedClientId =
    process.env.SEO_GOOGLE_CLIENT_ID ??
    process.env.GSC_CLIENT_ID ??
    SHARED_OAUTH_CLIENT.clientId ??
    config.auth.sharedClientId
  const sharedClientSecret =
    process.env.SEO_GOOGLE_CLIENT_SECRET ??
    process.env.GSC_CLIENT_SECRET ??
    SHARED_OAUTH_CLIENT.clientSecret ??
    config.auth.sharedClientSecret

  return {
    sharedConfigured: Boolean(sharedClientId && sharedClientSecret),
    byoConfigured: Boolean(byo?.clientId && byo?.clientSecret),
  }
}

export function getClientConfig(): OAuthClientConfig | undefined {
  const byo = readOauthClient()
  if (byo) {
    return {
      clientId: byo.clientId,
      clientSecret: byo.clientSecret,
      source: 'byo',
    }
  }

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
