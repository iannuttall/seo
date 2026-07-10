import { fetch, type RequestInit } from 'undici'
import { SeoError } from '../../errors.js'
import {
  createAuthorizedClient,
  type GoogleAccessTokenClient,
} from '../auth.js'

export async function authedFetch(
  client: GoogleAccessTokenClient,
  url: string,
  init?: RequestInit,
) {
  const accessToken = await client.getAccessToken()
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

export async function getAuthorized() {
  const { client, tokens } = await createAuthorizedClient()
  return { client, tokens }
}
