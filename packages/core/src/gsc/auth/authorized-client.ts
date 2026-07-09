import { OAuth2Client } from 'google-auth-library'
import { SeoError } from '../../errors.js'
import { getSeoCliPaths } from '../../paths.js'
import { deleteTokens, readTokens, writeTokens } from '../../storage/config.js'
import { withFileLock } from '../../storage/lock.js'
import type { StoredTokens } from '../../types.js'
import { getAuthModeStatus, getClientConfig } from './client-config.js'

export async function createAuthorizedClient(): Promise<{
  client: OAuth2Client
  tokens: StoredTokens
}> {
  const stored = await readTokens()
  if (!stored) {
    throw new SeoError(
      'AUTH_REQUIRED',
      'Not logged in. Run `seo auth login` first.',
    )
  }

  const clientConfig = getClientConfig()
  if (!clientConfig) {
    throw new SeoError(
      'AUTH_CONFIG_REQUIRED',
      'OAuth client config missing. Re-run `seo auth setup-client`.',
    )
  }

  const client = new OAuth2Client(
    clientConfig.clientId,
    clientConfig.clientSecret,
  )
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expires_at,
  })

  client.on('tokens', async (tokens) => {
    await withFileLock(getSeoCliPaths().tokensFile, async () => {
      const latest = (await readTokens()) ?? stored
      await writeTokens({
        ...latest,
        access_token: tokens.access_token ?? latest.access_token,
        expires_at: tokens.expiry_date ?? latest.expires_at,
        refresh_token: tokens.refresh_token ?? latest.refresh_token,
      })
    })
  })

  if (stored.expires_at - Date.now() < 60_000) {
    await refreshAuthToken(client)
  }

  return { client, tokens: (await readTokens()) ?? stored }
}

export async function refreshAuthToken(
  client?: OAuth2Client,
): Promise<StoredTokens> {
  return withFileLock(getSeoCliPaths().tokensFile, async () => {
    const current = await readTokens()
    if (!current) {
      throw new SeoError(
        'AUTH_REQUIRED',
        'Not logged in. Run `seo auth login` first.',
      )
    }

    const clientConfig = getClientConfig()
    if (!clientConfig) {
      throw new SeoError(
        'AUTH_CONFIG_REQUIRED',
        'OAuth client config missing. Re-run `seo auth setup-client`.',
      )
    }

    const oauth =
      client ??
      new OAuth2Client(clientConfig.clientId, clientConfig.clientSecret)
    oauth.setCredentials({
      access_token: current.access_token,
      refresh_token: current.refresh_token,
      expiry_date: current.expires_at,
    })

    try {
      const { credentials } = await oauth.refreshAccessToken()
      const next: StoredTokens = {
        ...current,
        access_token: credentials.access_token ?? current.access_token,
        refresh_token: credentials.refresh_token ?? current.refresh_token,
        expires_at: credentials.expiry_date ?? current.expires_at,
      }
      await writeTokens(next)
      return next
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/invalid_grant|401/.test(message)) {
        await deleteTokens()
        throw new SeoError(
          'AUTH_EXPIRED',
          'Google refresh token is no longer valid. Run `seo auth login` again.',
        )
      }
      throw error
    }
  })
}

export async function authStatus(): Promise<{
  tokens?: StoredTokens
  configured: boolean
  sharedConfigured: boolean
  byoConfigured: boolean
}> {
  const status = getAuthModeStatus()
  return {
    tokens: await readTokens(),
    configured: Boolean(getClientConfig()),
    sharedConfigured: status.sharedConfigured,
    byoConfigured: status.byoConfigured,
  }
}
