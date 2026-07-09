import type { OAuth2Client } from 'google-auth-library'
import { fetch, type RequestInit } from 'undici'
import { SeoError } from '../../errors.js'
import { createAuthorizedClient } from '../auth.js'

export async function authedFetch(
  client: OAuth2Client,
  url: string,
  init?: RequestInit,
) {
  const token = await client.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token.token
  if (!accessToken) {
    throw new SeoError(
      'AUTH_EXPIRED',
      'Could not obtain a Google access token. Run `seo auth login` again.',
    )
  }

  return fetch(url, {
    method: init?.method,
    body: init?.body,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  })
}

export async function getAuthorized(): Promise<{ client: OAuth2Client }> {
  const { client } = await createAuthorizedClient()
  return { client }
}
