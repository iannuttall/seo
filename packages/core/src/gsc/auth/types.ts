export interface OAuthClientConfig {
  clientId: string
  clientSecret: string
  source: 'shared' | 'byo'
}

export interface GoogleAccessTokenClient {
  getAccessToken(): Promise<string>
}

export const GOOGLE_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
] as const

export const GOOGLE_READONLY_SCOPE_LABELS: Record<
  (typeof GOOGLE_READONLY_SCOPES)[number],
  string
> = {
  'https://www.googleapis.com/auth/webmasters.readonly': 'Search Console',
  'https://www.googleapis.com/auth/analytics.readonly': 'Google Analytics',
}

export function missingGoogleReadonlyScopes(
  scope: string,
): Array<(typeof GOOGLE_READONLY_SCOPES)[number]> {
  const granted = new Set(scope.split(/\s+/u).filter(Boolean))
  return GOOGLE_READONLY_SCOPES.filter((required) => !granted.has(required))
}

export const GOOGLE_SCOPE = [...GOOGLE_READONLY_SCOPES, 'openid', 'email'].join(
  ' ',
)
