import { SeoError } from '../../errors.js'
import { getSeoCliPaths } from '../../paths.js'
import { deleteTokens, readTokens, writeTokens } from '../../storage/config.js'
import { withFileLock } from '../../storage/lock.js'
import type { StoredTokens } from '../../types.js'
import {
  getAuthModeStatus,
  getClientConfig,
  missingOAuthClientMessage,
} from './client-config.js'
import {
  getServiceAccountConfig,
  getServiceAccountStatus,
  ServiceAccountAccessTokenClient,
  type ServiceAccountStatus,
} from './service-account.js'
import {
  GoogleTokenEndpointError,
  requestGoogleAccessToken,
} from './token-endpoint.js'
import type { GoogleAccessTokenClient, OAuthClientConfig } from './types.js'

const REFRESH_BUFFER_MS = 60_000

function authRequired(): SeoError {
  return new SeoError(
    'AUTH_REQUIRED',
    'Not logged in. Run `seo auth login` first.',
  )
}

function authExpired(): SeoError {
  return new SeoError(
    'AUTH_EXPIRED',
    'Google refresh token is no longer valid. Run `seo auth login` again.',
  )
}

function needsRefresh(tokens: StoredTokens, now: number): boolean {
  return !tokens.access_token || tokens.expires_at - now < REFRESH_BUFFER_MS
}

function requireClientConfig(tokens: StoredTokens): OAuthClientConfig {
  const clientConfig = getClientConfig(tokens.client_source)
  if (!clientConfig) {
    throw new SeoError(
      'AUTH_CONFIG_REQUIRED',
      missingOAuthClientMessage(tokens.client_source),
    )
  }
  return clientConfig
}

function refreshRejected(error: unknown): boolean {
  return (
    (error instanceof GoogleTokenEndpointError &&
      (error.status === 401 || error.oauthError === 'invalid_grant')) ||
    /invalid_grant|401/.test(
      error instanceof Error ? error.message : String(error),
    )
  )
}

async function refreshStoredToken(input: {
  onlyIfExpiring: boolean
}): Promise<StoredTokens> {
  return withFileLock(getSeoCliPaths().tokensFile, async () => {
    const current = await readTokens()
    if (!current) throw authRequired()

    const clientConfig = requireClientConfig(current)
    const now = Date.now()
    if (input.onlyIfExpiring && !needsRefresh(current, now)) {
      return current
    }
    if (!current.refresh_token) {
      await deleteTokens()
      throw authExpired()
    }

    try {
      const refreshed = await requestGoogleAccessToken({
        clientConfig,
        refreshToken: current.refresh_token,
      })
      const next: StoredTokens = {
        ...current,
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken ?? current.refresh_token,
        expires_at: now + refreshed.expiresIn * 1_000,
      }
      await writeTokens(next)
      return next
    } catch (error) {
      if (refreshRejected(error)) {
        await deleteTokens()
        throw authExpired()
      }
      throw error
    }
  })
}

class LocalGoogleAccessTokenClient implements GoogleAccessTokenClient {
  constructor(private tokens: StoredTokens) {}

  async getAccessToken(): Promise<string> {
    if (needsRefresh(this.tokens, Date.now())) {
      this.tokens = await refreshStoredToken({
        onlyIfExpiring: true,
      })
    }
    if (!this.tokens.access_token) throw authExpired()
    return this.tokens.access_token
  }
}

export async function createAuthorizedClient(): Promise<{
  client: GoogleAccessTokenClient
  tokens: StoredTokens
}> {
  let tokens = await readTokens()
  if (!tokens) throw authRequired()

  requireClientConfig(tokens)
  if (needsRefresh(tokens, Date.now())) {
    tokens = await refreshStoredToken({
      onlyIfExpiring: true,
    })
  }

  return {
    client: new LocalGoogleAccessTokenClient(tokens),
    tokens,
  }
}

export async function refreshAuthToken(): Promise<StoredTokens> {
  return refreshStoredToken({ onlyIfExpiring: false })
}

export type AuthorizedGoogleClient = {
  client: GoogleAccessTokenClient
  mode: 'oauth' | 'service-account'
  identity: string
  quotaIdentity: {
    clientId: string
    accountEmail: string
  }
  tokens?: StoredTokens
}

export async function createGoogleAccessTokenClient(): Promise<AuthorizedGoogleClient> {
  const serviceAccount = getServiceAccountConfig()
  if (serviceAccount) {
    return {
      client: new ServiceAccountAccessTokenClient(serviceAccount),
      mode: 'service-account',
      identity: serviceAccount.clientEmail,
      quotaIdentity: {
        clientId: 'service-account',
        accountEmail: serviceAccount.clientEmail,
      },
    }
  }

  const { client, tokens } = await createAuthorizedClient()
  const clientConfig = requireClientConfig(tokens)
  return {
    client,
    mode: 'oauth',
    identity: tokens.account_email,
    quotaIdentity: {
      clientId: clientConfig.clientId,
      accountEmail: tokens.account_email,
    },
    tokens,
  }
}

export async function authStatus(): Promise<{
  tokens?: StoredTokens
  configured: boolean
  sharedConfigured: boolean
  byoConfigured: boolean
  activeMode: 'oauth' | 'service-account' | 'none'
  identity?: string
  serviceAccount: ServiceAccountStatus
}> {
  const status = getAuthModeStatus()
  const serviceAccount = getServiceAccountStatus()
  if (serviceAccount.configured || serviceAccount.error) {
    return {
      configured: serviceAccount.configured,
      sharedConfigured: status.sharedConfigured,
      byoConfigured: status.byoConfigured,
      activeMode: 'service-account',
      identity: serviceAccount.identity,
      serviceAccount,
    }
  }
  const tokens = await readTokens()
  return {
    tokens,
    configured: Boolean(getClientConfig(tokens?.client_source)),
    sharedConfigured: status.sharedConfigured,
    byoConfigured: status.byoConfigured,
    activeMode: tokens ? 'oauth' : 'none',
    identity: tokens?.account_email,
    serviceAccount,
  }
}
