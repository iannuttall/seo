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

export const GOOGLE_SCOPE = [...GOOGLE_READONLY_SCOPES, 'openid', 'email'].join(
  ' ',
)
