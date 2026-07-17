import { fetch, Headers, type RequestInit } from 'undici'
import UserAgent from 'user-agents'

export type HttpProfile = 'browser' | 'bot'

export class ResponseSizeLimitError extends Error {
  constructor(
    readonly maxBytes: number,
    label = 'Response',
  ) {
    super(`${label} exceeds the ${maxBytes}-byte response limit.`)
    this.name = 'ResponseSizeLimitError'
  }
}

export const BROWSER_USER_AGENT = new UserAgent({
  deviceCategory: 'desktop',
}).toString()

export function requestHeaders(profile: HttpProfile): Headers {
  if (profile === 'bot') {
    return new Headers({
      accept: 'text/plain,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      connection: 'close',
      'user-agent': BROWSER_USER_AGENT,
    })
  }

  return new Headers({
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    connection: 'close',
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

export async function readBoundedResponseText(
  response: Awaited<ReturnType<typeof publicHttpFetch>>,
  maxBytes: number,
  label = 'Response',
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new ResponseSizeLimitError(maxBytes, label)
  }

  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new ResponseSizeLimitError(maxBytes, label)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, total).toString('utf8')
}
