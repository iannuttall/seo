import type { OAuthClientConfig } from './types.js'

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
      `Google token refresh failed with ${status}${oauthError ? ` (${oauthError})` : ''}.`,
    )
    this.name = 'GoogleTokenEndpointError'
  }
}

export async function requestGoogleAccessToken(
  input: {
    clientConfig: OAuthClientConfig
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
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: unknown }
      | undefined
    throw new GoogleTokenEndpointError(
      response.status,
      typeof payload?.error === 'string' ? payload.error : undefined,
    )
  }

  const payload = (await response.json()) as {
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
