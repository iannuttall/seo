import { readJson, readJsonOrUndefined } from '../../http/read-json.js'
import type { OAuthClientConfig } from './types.js'

// A web or desktop OAuth client; source only matters to the CLI.
export type GoogleClientCredentials = Omit<OAuthClientConfig, 'source'> & {
  source?: OAuthClientConfig['source']
}

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export type GoogleRefreshTokenResponse = {
  accessToken: string
  expiresIn: number
  refreshToken?: string
}

export class GoogleTokenEndpointError extends Error {
  constructor(
    readonly status: number,
    readonly oauthError?: string,
  ) {
    super(
      `Google token request failed with ${status}${oauthError ? ` (${oauthError})` : ''}.`,
    )
    this.name = 'GoogleTokenEndpointError'
  }
}

export async function requestGoogleAccessToken(
  input: {
    clientConfig: GoogleClientCredentials
    refreshToken: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleRefreshTokenResponse> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: input.clientConfig.clientId,
      client_secret: input.clientConfig.clientSecret,
      refresh_token: input.refreshToken,
    }),
  })

  if (!response.ok) {
    const payload = (await readJsonOrUndefined(response, 'Google sign-in')) as
      | { error?: unknown }
      | undefined
    throw new GoogleTokenEndpointError(
      response.status,
      typeof payload?.error === 'string' ? payload.error : undefined,
    )
  }

  const payload = (await readJson(response, 'Google sign-in')) as {
    access_token?: unknown
    expires_in?: unknown
    refresh_token?: unknown
  }
  if (
    typeof payload.access_token !== 'string' ||
    !payload.access_token ||
    typeof payload.expires_in !== 'number' ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0 ||
    (payload.refresh_token !== undefined &&
      typeof payload.refresh_token !== 'string')
  ) {
    throw new Error('Google token refresh returned an invalid response.')
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    refreshToken: payload.refresh_token,
  }
}

export type GoogleCodeTokens = {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
  id_token?: string
}

// Swaps a Google sign-in code for tokens. The CLI sends a PKCE verifier; the
// hosted MCP, a confidential web client, does not.
export async function exchangeGoogleCode(
  input: {
    clientConfig: GoogleClientCredentials
    code: string
    redirectUri: string
    verifier?: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleCodeTokens> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientConfig.clientId,
      client_secret: input.clientConfig.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.verifier ? { code_verifier: input.verifier } : {}),
    }),
  })
  if (!response.ok) {
    const payload = await readJsonOrUndefined<{ error?: unknown }>(
      response,
      'Google sign-in',
    )
    throw new GoogleTokenEndpointError(
      response.status,
      typeof payload?.error === 'string' ? payload.error : undefined,
    )
  }
  return readJson<GoogleCodeTokens>(response, 'Google sign-in')
}
