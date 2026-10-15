import { fetch, type RequestInit } from 'undici'
import { SeoError } from '../../errors.js'
import type { GoogleFetch } from '../../google/api.js'
import {
  createGoogleAccessTokenClient,
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

export async function getAuthorized(accountEmail?: string) {
  return createGoogleAccessTokenClient(accountEmail)
}

// The shared Google API calls with this machine's sign-in.
export function googleFetchFor(client: GoogleAccessTokenClient): GoogleFetch {
  return (url, init) =>
    authedFetch(
      client,
      url,
      init as Parameters<typeof authedFetch>[2],
    ) as unknown as Promise<Response>
}

export const LOCAL_SIGN_IN = { signIn: 'Run `seo auth login` again.' }
