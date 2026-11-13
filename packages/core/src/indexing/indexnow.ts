import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import { fetchFailure } from './indexmysite.js'

// IndexNow (https://www.indexnow.org/documentation): one POST to the shared
// endpoint reaches Bing, Yandex, Seznam, Naver and Yep. Google does not use
// IndexNow. A key file served at https://<host>/<key>.txt proves the site
// owner sent the URLs. Ported from the site starter kit's deploy step.
// Worker-safe.

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'
// One IndexNow request takes up to 10,000 URLs.
export const INDEXNOW_MAX_URLS = 10_000
const TIMEOUT_MS = 10_000
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/

export function validIndexNowKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

// 32 random hex characters.
export function newIndexNowKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// The host IndexNow keys and checks: example.com from example.com,
// https://example.com/page or sc-domain:example.com. www.example.com is
// its own host with its own key file.
export function indexNowHost(site: string): string | null {
  const value = site.trim().replace(/^sc-domain:/i, '')
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    )
    return url.hostname ? url.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

export const keyFileUrl = (host: string, key: string) =>
  `https://${host}/${key}.txt`

export type KeyFileCheck = {
  url: string
  live: boolean
  // HTTP status, or null when the fetch failed.
  status: number | null
  // Why it is not live, in words that follow the URL.
  problem: string | null
}

// Whether https://<host>/<key>.txt returns 200 with the key as its body.
// Redirects are not followed: search engines read the key at that URL.
export async function checkKeyFile(
  host: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<KeyFileCheck> {
  const url = keyFileUrl(host, key)
  try {
    const response = await fetcher(url, {
      redirect: 'manual',
      headers: { 'user-agent': SEO_CRAWLER_USER_AGENT, accept: 'text/plain' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      return {
        url,
        live: false,
        status: response.status,
        problem: `redirects (${response.status}${location ? ` to ${location}` : ''}); serve the file at this exact URL`,
      }
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      return {
        url,
        live: false,
        status: response.status,
        problem: `returns ${response.status}`,
      }
    }
    const body = (await response.text()).slice(0, 1000).trim()
    return body === key
      ? { url, live: true, status: 200, problem: null }
      : {
          url,
          live: false,
          status: 200,
          problem:
            'returns 200, but its text is not the key alone (a page or a different key)',
        }
  } catch (error) {
    return {
      url,
      live: false,
      status: null,
      problem: `could not be fetched (${fetchFailure(error)})`,
    }
  }
}

export type IndexNowResult = {
  // IndexNow's HTTP status, or null when the request failed.
  status: number | null
  ok: boolean
  submitted: number
  // IndexNow's own words for the status.
  meaning: string
}

// What each IndexNow status means, from its documentation.
function meaning(status: number | null, body: string): string {
  switch (status) {
    case 200:
      return 'URLs received.'
    case 202:
      return 'URLs received; the key is still being validated.'
    case 400:
      return `Bad request${body ? `: ${body}` : ''}.`
    case 403:
      return 'Key not valid: the key file was not found or does not match.'
    case 422:
      return 'The URLs do not belong to the host, or the key does not match the key file.'
    case 429:
      return 'Too many requests. Wait before sending again.'
    case null:
      return `The request failed${body ? `: ${body}` : ''}.`
    default:
      return `Unexpected status${body ? `: ${body}` : ''}.`
  }
}

// Sends URLs on one host in one request. The caller checks the host, the
// key and the count first.
export async function submitIndexNow(
  input: { host: string; key: string; urls: string[] },
  fetcher: typeof fetch = fetch,
): Promise<IndexNowResult> {
  try {
    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'user-agent': SEO_CRAWLER_USER_AGENT,
      },
      body: JSON.stringify({
        host: input.host,
        key: input.key,
        keyLocation: keyFileUrl(input.host, input.key),
        urlList: input.urls,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS * 3),
    })
    const body = (await response.text().catch(() => ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    return {
      status: response.status,
      ok: response.status === 200 || response.status === 202,
      submitted: input.urls.length,
      meaning: meaning(response.status, body),
    }
  } catch (error) {
    return {
      status: null,
      ok: false,
      submitted: input.urls.length,
      meaning: meaning(null, fetchFailure(error)),
    }
  }
}
