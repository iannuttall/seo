import {
  exchangeGoogleCode,
  type GoogleCodeTokens,
  readJsonOrUndefined,
  requestGoogleAccessToken,
} from '@seo/core/hosted'

// Google and Bing sign-in for the account store. Both use the authorization
// code flow from this server, and both refresh access tokens here.

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
]

const EARLY = 60_000

export function googleSignInUrl(env: Env, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/oauth/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', state)
  return url.toString()
}

const googleClient = (env: Env) => ({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
})

export type SignedIn = {
  subject: string
  email: string
  refresh: string
  access: string
  accessExp: number
}

// The id token came straight from Google's token endpoint over TLS, so its
// claims can be read without checking the signature (OpenID Connect 3.1.3.7).
function claims(token: string | undefined): { sub?: string; email?: string } {
  const part = token?.split('.')[1]
  if (!part) return {}
  try {
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(part.replaceAll('-', '+').replaceAll('_', '/')),
          (char) => char.charCodeAt(0),
        ),
      ),
    )
  } catch {
    return {}
  }
}

export async function googleSignedIn(
  env: Env,
  code: string,
): Promise<SignedIn | null> {
  const tokens: GoogleCodeTokens | null = await exchangeGoogleCode({
    clientConfig: googleClient(env),
    code,
    redirectUri: `${env.PUBLIC_URL}/oauth/callback`,
  }).catch(() => null)
  const who = claims(tokens?.id_token)
  if (!tokens?.refresh_token || !who.sub) return null
  return {
    subject: who.sub,
    email: who.email ?? who.sub,
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    accessExp: Date.now() + tokens.expires_in * 1000 - EARLY,
  }
}

export async function refreshGoogle(
  env: Env,
  refresh: string,
): Promise<{ access: string; accessExp: number; refresh?: string }> {
  const tokens = await requestGoogleAccessToken({
    clientConfig: googleClient(env),
    refreshToken: refresh,
  })
  return {
    access: tokens.accessToken,
    accessExp: Date.now() + tokens.expiresIn * 1000 - EARLY,
    refresh: tokens.refreshToken,
  }
}

export async function revokeGoogle(refresh: string): Promise<void> {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refresh }),
  }).catch(() => undefined)
}

const BING = 'https://www.bing.com/webmasters/oauth'

export function bingSignInUrl(env: Env, state: string): string {
  const url = new URL(`${BING}/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', env.BING_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/oauth/bing/callback`)
  url.searchParams.set('scope', 'webmaster.read')
  url.searchParams.set('state', state)
  return url.toString()
}

async function bingToken(
  env: Env,
  body: Record<string, string>,
): Promise<{ access: string; accessExp: number; refresh?: string }> {
  const response = await fetch(`${BING}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.BING_CLIENT_ID,
      client_secret: env.BING_CLIENT_SECRET,
      ...body,
    }),
  })
  const json = await readJsonOrUndefined<{
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }>(response, 'Bing sign-in')
  if (!response.ok || typeof json?.access_token !== 'string') {
    throw new Error(`Bing sign-in failed with ${response.status}.`)
  }
  return {
    access: json.access_token,
    accessExp:
      Date.now() +
      (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000 -
      EARLY,
    refresh:
      typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
  }
}

export function bingSignedIn(env: Env, code: string) {
  return bingToken(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${env.PUBLIC_URL}/oauth/bing/callback`,
  })
}

export function refreshBing(env: Env, refresh: string) {
  return bingToken(env, { grant_type: 'refresh_token', refresh_token: refresh })
}
