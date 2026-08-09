import {
  SITEMAP_VALIDATOR_LIMITS,
  type SitemapValidationReport,
  validateSitemapByteStream,
} from '../../src/lib/sitemap-validator.ts'
import { defaultToolUrlToHttps } from '../../src/lib/tool-url.ts'
import {
  isBrowserRequestFromSameSite,
  parseSitemapUrl,
  type SitemapFetcher,
} from './sitemap.ts'
import {
  type CrawlBudget,
  ExtractorFetchError,
  ExtractorLimitError,
  fetchPublicResponse,
  SITEMAP_EXTRACTOR_LIMITS,
} from './sitemap-extractor-network.ts'

export const SITEMAP_VALIDATOR_REQUEST_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  redirects: SITEMAP_EXTRACTOR_LIMITS.redirects,
  timeoutMilliseconds: SITEMAP_EXTRACTOR_LIMITS.requestTimeoutMilliseconds,
})

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

class ValidatorInputError extends Error {}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readRequest(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > SITEMAP_VALIDATOR_REQUEST_LIMITS.bodyBytes
  ) {
    throw new ValidatorInputError('The request is too large.')
  }
  if (!request.body) throw new ValidatorInputError('Send a JSON request.')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > SITEMAP_VALIDATOR_REQUEST_LIMITS.bodyBytes) {
        await reader.cancel()
        throw new ValidatorInputError('The request is too large.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(text + decoder.decode())
  } catch {
    throw new ValidatorInputError('Send a valid JSON request.')
  }
}

function sitemapUrl(value: unknown): URL {
  try {
    return parseSitemapUrl(
      typeof value === 'string' ? defaultToolUrlToHttps(value) : value,
    )
  } catch {
    throw new ValidatorInputError('Enter a public HTTPS sitemap URL.')
  }
}

export async function validateRemoteSitemap(
  initialUrl: URL,
  fetcher: SitemapFetcher = fetch,
): Promise<SitemapValidationReport> {
  const budget: CrawlBudget = {
    startedAt: Date.now(),
    subrequests: 0,
    downloadedBytes: 0,
    expandedBytes: 0,
  }
  const { response, finalUrl } = await fetchPublicResponse(
    initialUrl,
    fetcher,
    budget,
    'application/xml, text/xml, application/gzip, text/plain;q=0.8',
  )
  if (!response.body) {
    throw new ExtractorFetchError('The sitemap response was empty.')
  }
  return validateSitemapByteStream({
    body: response.body,
    source: {
      kind: 'url',
      requestedUrl: initialUrl.toString(),
      finalUrl: finalUrl.toString(),
      contentType: response.headers.get('content-type'),
    },
  })
}

export async function handleSitemapValidation(
  request: Request,
  fetcher: SitemapFetcher = fetch,
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
    const body = await readRequest(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidatorInputError('Send a JSON object with a sitemap URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new ValidatorInputError('Send only the sitemap URL.')
    }
    const url = sitemapUrl((body as { url?: unknown }).url)
    return jsonResponse(await validateRemoteSitemap(url, fetcher))
  } catch (error) {
    if (error instanceof ValidatorInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    if (error instanceof ExtractorLimitError) {
      return jsonResponse({ error: error.message }, 413)
    }
    if (error instanceof ExtractorFetchError) {
      return jsonResponse({ error: error.message }, 422)
    }
    return jsonResponse(
      {
        error: `The sitemap could not be validated within the ${SITEMAP_VALIDATOR_LIMITS.expandedBytes.toLocaleString()} byte processing limit.`,
      },
      503,
    )
  }
}
