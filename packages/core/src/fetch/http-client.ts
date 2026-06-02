import { fetch, Headers, type RequestInit } from 'undici'
import UserAgent from 'user-agents'

export type HttpProfile = 'browser' | 'bot'

export const BROWSER_USER_AGENT = new UserAgent({
  deviceCategory: 'desktop',
}).toString()

export function requestHeaders(profile: HttpProfile): Headers {
  if (profile === 'bot') {
    return new Headers({
      accept: 'text/plain,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': BROWSER_USER_AGENT,
    })
  }

  return new Headers({
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'upgrade-insecure-requests': '1',
    'user-agent': BROWSER_USER_AGENT,
  })
}

export function publicHttpFetch(
  url: string,
  input: RequestInit & { profile?: HttpProfile } = {},
) {
  const { profile = 'browser', headers, ...init } = input
  const base = requestHeaders(profile)

  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      base.set(key, value)
    }
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      base.set(key, value)
    }
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        base.set(key, value)
      }
    }
  }

  return fetch(url, { ...init, headers: base })
}
