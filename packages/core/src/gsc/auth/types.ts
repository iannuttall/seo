export interface OAuthClientConfig {
  clientId: string
  clientSecret: string
  source: 'shared' | 'byo'
}

export const GOOGLE_SCOPE =
  'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly openid email'
