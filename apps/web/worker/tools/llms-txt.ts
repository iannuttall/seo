import { defaultToolUrlToHttps } from '../../src/lib/tool-url.ts'

export const LLMS_TXT_TOOL_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  fileBytes: 100_000,
  redirects: 3,
  timeoutMilliseconds: 8_000,
})

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

type LlmsTxtFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type LlmsTxtToolResult = {
  schema: 1
  source: {
    requestedUrl: string
    finalUrl: string
    bytes: number
    contentType: string | null
    limits: typeof LLMS_TXT_TOOL_LIMITS
  }
  content: string
}

class ToolInputError extends Error {}
class ToolFetchError extends Error {}
class ToolLimitError extends Error {}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maximumBytes) {
        await reader.cancel()
        throw new ToolLimitError(
          `The file exceeds the ${maximumBytes.toLocaleString()} byte limit.`,
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function readRequestJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > LLMS_TXT_TOOL_LIMITS.bodyBytes) {
    throw new ToolInputError('The request is too large.')
  }
  const bytes = await readBoundedBytes(
    request.body,
    LLMS_TXT_TOOL_LIMITS.bodyBytes,
  ).catch((error) => {
    if (error instanceof ToolLimitError) {
      throw new ToolInputError('The request is too large.')
    }
    throw error
  })
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ToolInputError('Send a valid JSON request.')
  }
}

function isBrowserRequestFromSameSite(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin && origin !== requestUrl.origin) return false

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return false
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      if (new URL(referer).origin !== requestUrl.origin) return false
    } catch {
      return false
    }
  }
  return true
}

function parseLlmsTxtUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new ToolInputError('Enter a complete HTTPS llms.txt URL.')
  }

  let url: URL
  try {
    url = new URL(defaultToolUrlToHttps(value))
  } catch {
    throw new ToolInputError('Enter a complete HTTPS llms.txt URL.')
  }

  const hostname = url.hostname.toLowerCase()
  const unsafeHostname =
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    hostname.startsWith('[') ||
    /^[\d.]+$/.test(hostname) ||
    hostname.includes(':')

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    unsafeHostname
  ) {
    throw new ToolInputError(
      'Use a public HTTPS URL without credentials or a custom port.',
    )
  }
  url.hash = ''
  return url
}

function looksLikeHtml(content: string, contentType: string | null): boolean {
  if (contentType?.toLowerCase().startsWith('text/html')) return true
  return /^\s*(?:<!doctype\s+html|<html\b)/iu.test(content.slice(0, 512))
}

export async function fetchLlmsTxt(
  initialUrl: URL,
  fetcher: LlmsTxtFetcher = fetch,
): Promise<LlmsTxtToolResult> {
  const requestedUrl = initialUrl.toString()
  let current = initialUrl

  for (
    let redirects = 0;
    redirects <= LLMS_TXT_TOOL_LIMITS.redirects;
    redirects += 1
  ) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      LLMS_TXT_TOOL_LIMITS.timeoutMilliseconds,
    )

    try {
      let response: Response
      try {
        response = await fetcher(current, {
          headers: {
            accept:
              'text/plain, text/markdown, application/markdown, application/octet-stream;q=0.5',
            'user-agent':
              'SEO-llms.txt-Validator/1.0 (+https://seoskill.dev/tools)',
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
          throw new ToolFetchError('The llms.txt request timed out.')
        }
        throw new ToolFetchError(
          `The file could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) {
          throw new ToolFetchError('The redirect has no location.')
        }
        if (redirects === LLMS_TXT_TOOL_LIMITS.redirects) {
          throw new ToolLimitError('The file redirected too many times.')
        }
        try {
          current = parseLlmsTxtUrl(new URL(location, current).toString())
        } catch {
          throw new ToolFetchError(
            'The file redirected to a URL that cannot be fetched.',
          )
        }
        continue
      }

      if (!response.ok) {
        await response.body?.cancel()
        throw new ToolFetchError(`The file returned HTTP ${response.status}.`)
      }

      const declared = Number(response.headers.get('content-length'))
      if (
        Number.isFinite(declared) &&
        declared > LLMS_TXT_TOOL_LIMITS.fileBytes
      ) {
        await response.body?.cancel()
        throw new ToolLimitError(
          `The file exceeds the ${LLMS_TXT_TOOL_LIMITS.fileBytes.toLocaleString()} byte limit.`,
        )
      }

      let bytes: Uint8Array
      try {
        bytes = await readBoundedBytes(
          response.body,
          LLMS_TXT_TOOL_LIMITS.fileBytes,
        )
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ToolFetchError('The llms.txt request timed out.')
        }
        throw error
      }

      let content: string
      try {
        content = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: false,
        }).decode(bytes)
      } catch {
        throw new ToolFetchError('The response is not valid UTF-8 text.')
      }
      const contentType = response.headers.get('content-type')
      if (looksLikeHtml(content, contentType)) {
        throw new ToolFetchError(
          'The URL returned an HTML page instead of an llms.txt file.',
        )
      }

      return {
        schema: 1,
        source: {
          requestedUrl,
          finalUrl: current.toString(),
          bytes: bytes.byteLength,
          contentType,
          limits: LLMS_TXT_TOOL_LIMITS,
        },
        content,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new ToolLimitError('The file redirected too many times.')
}

export async function handleLlmsTxtFetch(
  request: Request,
  fetcher: LlmsTxtFetcher = fetch,
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
    const body = await readRequestJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ToolInputError('Send a JSON object with an llms.txt URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new ToolInputError('Send only the llms.txt URL.')
    }
    const url = parseLlmsTxtUrl((body as { url?: unknown }).url)
    return jsonResponse(await fetchLlmsTxt(url, fetcher))
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
      { error: 'The llms.txt file could not be checked.' },
      503,
    )
  }
}
