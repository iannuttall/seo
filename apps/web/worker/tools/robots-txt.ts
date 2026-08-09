import { safePublicFetchMessage } from './public-fetch-errors.ts'
import { isBrowserRequestFromSameSite, parseSitemapUrl } from './sitemap.ts'

export const ROBOTS_TXT_FETCH_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  fileBytes: 500 * 1_024,
  redirects: 5,
  subrequests: 6,
  requestTimeoutMilliseconds: 8_000,
  totalTimeMilliseconds: 12_000,
})

export type RobotsTxtFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type RobotsTxtFetchResult = {
  schema: 1
  source: {
    requestedUrl: string
    finalUrl: string
    origin: string
    status: number
    statusText: string
    contentType: string | null
    bytes: number
    truncated: boolean
    looksLikeHtml: boolean
    availability: 'rules' | 'no-rules' | 'uncertain'
    redirects: Array<{ from: string; to: string; status: number }>
    limits: typeof ROBOTS_TXT_FETCH_LIMITS
  }
  content: string
  message: string
}

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

class ToolInputError extends Error {}
class ToolFetchError extends Error {}
class ToolLimitError extends Error {}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readBoundedRequest(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > ROBOTS_TXT_FETCH_LIMITS.bodyBytes
  ) {
    throw new ToolInputError('The request is too large.')
  }
  if (!request.body) throw new ToolInputError('Send a JSON request.')

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > ROBOTS_TXT_FETCH_LIMITS.bodyBytes) {
        await reader.cancel()
        throw new ToolInputError('The request is too large.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text + decoder.decode())
  } catch {
    throw new ToolInputError('Send a valid JSON request.')
  }
}

function parsePublicSite(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ToolInputError('Enter a public HTTPS domain or URL.')
  }
  const trimmed = value.trim()
  const complete = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const submitted = parseSitemapUrl(complete)
    return new URL('/robots.txt', `${submitted.origin}/`)
  } catch {
    throw new ToolInputError(
      'Use a public HTTPS domain without credentials or a custom port.',
    )
  }
}

async function readPrefix(
  body: ReadableStream<Uint8Array> | null,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(), truncated: false }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let retained = 0
  let truncated = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      const remaining = ROBOTS_TXT_FETCH_LIMITS.fileBytes - retained
      if (remaining > 0) {
        const kept = chunk.value.subarray(0, remaining)
        chunks.push(kept)
        retained += kept.byteLength
      }
      if (chunk.value.byteLength > remaining) {
        truncated = true
        await reader.cancel()
        break
      }
      if (retained >= ROBOTS_TXT_FETCH_LIMITS.fileBytes) {
        const next = await reader.read()
        truncated = !next.done
        if (!next.done) await reader.cancel()
        break
      }
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(retained)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

function looksLikeHtml(content: string, contentType: string | null): boolean {
  return (
    contentType?.toLowerCase().startsWith('text/html') === true ||
    /^\s*(?:<!doctype\s+html|<html\b)/iu.test(content.slice(0, 512))
  )
}

function availability(
  status: number,
): RobotsTxtFetchResult['source']['availability'] {
  if (status >= 200 && status < 300) return 'rules'
  if (status >= 400 && status < 500 && status !== 429) return 'no-rules'
  return 'uncertain'
}

function statusMessage(
  status: number,
  state: RobotsTxtFetchResult['source']['availability'],
): string {
  if (state === 'rules') return 'The live robots.txt response was fetched.'
  if (state === 'no-rules') {
    return `The server returned HTTP ${status}. RFC 9309 treats this robots.txt file as unavailable, so a crawler may access resources. Individual crawler policies can differ.`
  }
  return `The server returned HTTP ${status}. Cached crawler rules may still apply, so current access cannot be determined from this response alone.`
}

export async function fetchRobotsTxt(
  initialUrl: URL,
  fetcher: RobotsTxtFetcher = fetch,
): Promise<RobotsTxtFetchResult> {
  const startedAt = Date.now()
  const requestedUrl = initialUrl.toString()
  const initialOrigin = initialUrl.origin
  const redirects: RobotsTxtFetchResult['source']['redirects'] = []
  let current = initialUrl

  for (
    let requestNumber = 0;
    requestNumber < ROBOTS_TXT_FETCH_LIMITS.subrequests;
    requestNumber += 1
  ) {
    const remaining =
      ROBOTS_TXT_FETCH_LIMITS.totalTimeMilliseconds - (Date.now() - startedAt)
    if (remaining <= 0) {
      throw new ToolLimitError('The robots.txt fetch time limit was reached.')
    }
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(remaining, ROBOTS_TXT_FETCH_LIMITS.requestTimeoutMilliseconds),
    )

    let response: Response
    try {
      try {
        response = await fetcher(current, {
          headers: {
            accept: 'text/plain, text/*;q=0.8, */*;q=0.2',
            'user-agent':
              'SEO-Robots-Validator/1.0 (+https://seoskill.dev/tools/robots-txt-validator)',
          },
          redirect: 'manual',
          signal: controller.signal,
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: {
              '200-299': 300,
              '400-499': 60,
              '500-599': 0,
            },
          },
        } as RequestInit)
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ToolFetchError('The robots.txt request timed out.')
        }
        throw new ToolFetchError(
          safePublicFetchMessage(error, 'robots.txt file'),
        )
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new ToolFetchError('The redirect has no location.')
        if (redirects.length >= ROBOTS_TXT_FETCH_LIMITS.redirects) {
          throw new ToolLimitError(
            'The robots.txt file redirected too many times.',
          )
        }
        let next: URL
        try {
          next = parseSitemapUrl(new URL(location, current).toString())
        } catch {
          throw new ToolFetchError(
            'The robots.txt file redirected to a URL that cannot be fetched.',
          )
        }
        redirects.push({
          from: current.toString(),
          to: next.toString(),
          status: response.status,
        })
        current = next
        continue
      }

      const state = availability(response.status)
      let content = ''
      let bytes = 0
      let truncated = false
      if (state === 'rules') {
        const prefix = await readPrefix(response.body)
        bytes = prefix.bytes.byteLength
        truncated = prefix.truncated
        try {
          content = new TextDecoder('utf-8', {
            fatal: !truncated,
            ignoreBOM: false,
          }).decode(prefix.bytes)
        } catch {
          throw new ToolFetchError('The response is not valid UTF-8 text.')
        }
      } else {
        await response.body?.cancel()
      }
      const contentType = response.headers.get('content-type')

      return {
        schema: 1,
        source: {
          requestedUrl,
          finalUrl: current.toString(),
          origin: initialOrigin,
          status: response.status,
          statusText: response.statusText,
          contentType,
          bytes,
          truncated,
          looksLikeHtml:
            state === 'rules' && looksLikeHtml(content, contentType),
          availability: state,
          redirects,
          limits: ROBOTS_TXT_FETCH_LIMITS,
        },
        content,
        message: statusMessage(response.status, state),
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new ToolLimitError('The robots.txt request limit was reached.')
}

export async function handleRobotsTxtFetch(
  request: Request,
  fetcher: RobotsTxtFetcher = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Not found' }, 404)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request.' }, 400)
  }

  try {
    const body = await readBoundedRequest(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ToolInputError('Send a JSON object with a domain or URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new ToolInputError('Send only the domain or URL.')
    }
    return jsonResponse(
      await fetchRobotsTxt(
        parsePublicSite((body as { url?: unknown }).url),
        fetcher,
      ),
    )
  } catch (error) {
    if (error instanceof ToolInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    if (error instanceof ToolLimitError) {
      return jsonResponse({ error: error.message }, 413)
    }
    if (error instanceof ToolFetchError) {
      return jsonResponse({ error: error.message }, 422)
    }
    return jsonResponse(
      { error: 'The robots.txt file could not be checked.' },
      503,
    )
  }
}
