import crypto from 'node:crypto'
import http from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import open from 'open'
import { getSeoCliPaths } from '../paths.js'
import {
  deleteTokens,
  readConfig,
  readOauthClient,
  readTokens,
  writeTokens,
} from '../storage/config.js'
import { withFileLock } from '../storage/lock.js'
import type { StoredTokens } from '../types.js'
import { SHARED_OAUTH_CLIENT } from './shared-client.generated.js'

const GOOGLE_SCOPE =
  'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly openid email'

function decodeJwtEmail(idToken?: string): string | undefined {
  if (!idToken) {
    return undefined
  }

  const [, payload] = idToken.split('.')
  if (!payload) {
    return undefined
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { email?: string }
    return parsed.email
  } catch {
    return undefined
  }
}

export interface OAuthClientConfig {
  clientId: string
  clientSecret: string
  source: 'shared' | 'byo'
}

export function getAuthModeStatus(): {
  sharedConfigured: boolean
  byoConfigured: boolean
} {
  const byo = readOauthClient()
  const config = readConfig()
  const sharedClientId =
    process.env.SEO_GOOGLE_CLIENT_ID ??
    SHARED_OAUTH_CLIENT.clientId ??
    config.auth.sharedClientId
  const sharedClientSecret =
    process.env.SEO_GOOGLE_CLIENT_SECRET ??
    SHARED_OAUTH_CLIENT.clientSecret ??
    config.auth.sharedClientSecret

  return {
    sharedConfigured: Boolean(sharedClientId && sharedClientSecret),
    byoConfigured: Boolean(byo?.clientId && byo?.clientSecret),
  }
}

function getClientConfig(): OAuthClientConfig | undefined {
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
    SHARED_OAUTH_CLIENT.clientId ??
    config.auth.sharedClientId
  const clientSecret =
    process.env.SEO_GOOGLE_CLIENT_SECRET ??
    SHARED_OAUTH_CLIENT.clientSecret ??
    config.auth.sharedClientSecret
  if (!clientId || !clientSecret) {
    return undefined
  }

  return { clientId, clientSecret, source: 'shared' }
}

async function fetchUserEmail(
  accessToken: string,
): Promise<string | undefined> {
  const response = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok) {
    return undefined
  }
  const json = (await response.json()) as { email?: string }
  return json.email
}

export async function loginWithLoopback(
  clientConfig = getClientConfig(),
): Promise<StoredTokens> {
  if (!clientConfig) {
    const status = getAuthModeStatus()
    if (status.byoConfigured) {
      throw new Error(
        'BYO OAuth client is configured but incomplete. Re-run `seo auth setup-client`.',
      )
    }
    throw new Error(
      'This build does not have the shared seo Google app configured. Run `seo auth setup-client` or set SEO_GOOGLE_CLIENT_ID / SEO_GOOGLE_CLIENT_SECRET for local testing.',
    )
  }

  const state = crypto.randomBytes(32).toString('base64url')
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
  const server = http.createServer()

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not bind loopback server.')
  }

  const redirectUri = `http://127.0.0.1:${address.port}/callback`
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.search = new URLSearchParams({
    client_id: clientConfig.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()

  await open(authUrl.toString())

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('OAuth flow timed out after 5 minutes.')),
      300_000,
    )
    server.on('request', (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', redirectUri)
        if (reqUrl.searchParams.get('state') !== state) {
          throw new Error('OAuth state mismatch.')
        }
        const error = reqUrl.searchParams.get('error')
        if (error) {
          throw new Error(`OAuth error: ${error}`)
        }

        const incomingCode = reqUrl.searchParams.get('code')
        if (!incomingCode) {
          throw new Error('OAuth code missing.')
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          '<h1>seo connected.</h1><p>You can close this tab.</p><script>window.close()</script>',
        )
        clearTimeout(timer)
        resolve(incomingCode)
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
  }).finally(() => server.close())

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientConfig.clientId,
    client_secret: clientConfig.clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed with ${tokenResponse.status}.`)
  }

  const tokenJson = (await tokenResponse.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope: string
    id_token?: string
  }

  const jwtEmail = decodeJwtEmail(tokenJson.id_token)
  const accountEmail =
    jwtEmail ?? (await fetchUserEmail(tokenJson.access_token))
  if (!accountEmail) {
    throw new Error(
      'Google login succeeded but account email could not be determined.',
    )
  }

  const tokens: StoredTokens = {
    provider: 'google',
    account_email: accountEmail,
    scope: tokenJson.scope,
    token_type: tokenJson.token_type,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_at: Date.now() + tokenJson.expires_in * 1000,
    obtained_at: Date.now(),
    client_source: clientConfig.source,
  }

  await writeTokens(tokens)
  return tokens
}

export async function createAuthorizedClient(): Promise<{
  client: OAuth2Client
  tokens: StoredTokens
}> {
  const stored = await readTokens()
  if (!stored) {
    throw new Error('Not logged in. Run `seo auth login` first.')
  }

  const clientConfig = getClientConfig()
  if (!clientConfig) {
    throw new Error(
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
      throw new Error('Not logged in.')
    }

    const clientConfig = getClientConfig()
    if (!clientConfig) {
      throw new Error('OAuth client config missing.')
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
        throw new Error(
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
