import crypto from 'node:crypto'
import http from 'node:http'
import open from 'open'
import { writeTokens } from '../../storage/config.js'
import type { StoredTokens } from '../../types.js'
import { getAuthModeStatus, getClientConfig } from './client-config.js'
import { GOOGLE_TOKEN_ENDPOINT } from './token-endpoint.js'
import { GOOGLE_SCOPE, type OAuthClientConfig } from './types.js'
import { decodeJwtEmail, fetchUserEmail } from './user-email.js'

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
      'This build does not have the shared seo Google app configured. Run `seo auth setup-client` or set SEO_GOOGLE_CLIENT_ID / SEO_GOOGLE_CLIENT_SECRET for local testing. Legacy GSC_CLIENT_ID / GSC_CLIENT_SECRET also work.',
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

  const code = await waitForCode({ server, redirectUri, state }).finally(() =>
    server.close(),
  )
  const tokenJson = await exchangeCode({
    clientConfig,
    code,
    redirectUri,
    verifier,
  })

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

function waitForCode(input: {
  server: http.Server
  redirectUri: string
  state: string
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('OAuth flow timed out after 5 minutes.')),
      300_000,
    )
    input.server.on('request', (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', input.redirectUri)
        if (reqUrl.searchParams.get('state') !== input.state) {
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
  })
}

async function exchangeCode(input: {
  clientConfig: OAuthClientConfig
  code: string
  redirectUri: string
  verifier: string
}): Promise<{
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
  id_token?: string
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientConfig.clientId,
    client_secret: input.clientConfig.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  })

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed with ${tokenResponse.status}.`)
  }

  return tokenResponse.json() as Promise<{
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope: string
    id_token?: string
  }>
}
