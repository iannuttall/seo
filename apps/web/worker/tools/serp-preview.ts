import {
  base64,
  inspectImage,
  parseAttributes,
  previewContentType,
} from './favicon-image.ts'
import { safePublicFetchMessage } from './public-fetch-errors.ts'
import {
  isBrowserRequestFromSameSite,
  parseSitemapUrl,
  type SitemapFetcher,
} from './sitemap.ts'

export const SERP_PREVIEW_FETCH_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  htmlBytes: 1_048_576,
  iconBytes: 131_072,
  redirects: 3,
  subrequests: 6,
  timeoutMilliseconds: 8_000,
})

export type SerpPreviewFetchResult = {
  schema: 1
  source: {
    requestedUrl: string
    finalUrl: string
    status: number
    contentType: string
    htmlBytes: number
    subrequests: number
    redirects: Array<{ from: string; to: string; status: number }>
    limits: typeof SERP_PREVIEW_FETCH_LIMITS
  }
  metadata: {
    title: string
    description: string
    siteName: string
    favicon: {
      status: 'found' | 'unavailable'
      url?: string
      dataUrl?: string
    }
  }
  warnings: string[]
}

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

class ToolInputError extends Error {}
class ToolFetchError extends Error {}
class ToolLimitError extends Error {}

type FetchBudget = { subrequests: number }

type FetchedResource = {
  bytes: Uint8Array
  contentType: string
  finalUrl: URL
  status: number
  redirects: Array<{ from: string; to: string; status: number }>
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readBounded(
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
        throw new ToolLimitError('The fetched file exceeded its size limit.')
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

async function readRequest(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > SERP_PREVIEW_FETCH_LIMITS.bodyBytes
  ) {
    throw new ToolInputError('The request is too large.')
  }
  try {
    const bytes = await readBounded(
      request.body,
      SERP_PREVIEW_FETCH_LIMITS.bodyBytes,
    )
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof ToolLimitError) {
      throw new ToolInputError('The request is too large.')
    }
    if (error instanceof SyntaxError) {
      throw new ToolInputError('Send a valid JSON request.')
    }
    throw error
  }
}

function parsePageUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ToolInputError('Enter a public website URL or domain.')
  }
  const trimmed = value.trim()
  const complete = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    return parseSitemapUrl(complete)
  } catch {
    throw new ToolInputError(
      'Use a public HTTPS URL without credentials or a custom port.',
    )
  }
}

async function fetchBounded(
  initialUrl: URL,
  fetcher: SitemapFetcher,
  budget: FetchBudget,
  maximumBytes: number,
  accept: string,
): Promise<FetchedResource> {
  let current = initialUrl
  const redirects: FetchedResource['redirects'] = []
  for (
    let redirectCount = 0;
    redirectCount <= SERP_PREVIEW_FETCH_LIMITS.redirects;
    redirectCount += 1
  ) {
    if (budget.subrequests >= SERP_PREVIEW_FETCH_LIMITS.subrequests) {
      throw new ToolLimitError('The request limit was reached.')
    }
    budget.subrequests += 1
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      SERP_PREVIEW_FETCH_LIMITS.timeoutMilliseconds,
    )
    let response: Response
    try {
      response = await fetcher(current, {
        headers: {
          accept,
          'user-agent':
            'SEO-SERP-Preview/1.0 (+https://seoskill.dev/tools/serp-preview)',
        },
        redirect: 'manual',
        signal: controller.signal,
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { '200-299': 300, '400-499': 60, '500-599': 0 },
        },
      } as RequestInit)
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ToolFetchError('The request timed out.')
      }
      throw new ToolFetchError(safePublicFetchMessage(error, 'page'))
    } finally {
      clearTimeout(timeout)
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new ToolFetchError('A redirect had no location.')
      if (redirectCount === SERP_PREVIEW_FETCH_LIMITS.redirects) {
        throw new ToolLimitError('The URL redirected too many times.')
      }
      let next: URL
      try {
        next = parseSitemapUrl(new URL(location, current).toString())
      } catch {
        throw new ToolFetchError(
          'The URL redirected to a location that cannot be fetched.',
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

    if (!response.ok) {
      await response.body?.cancel()
      throw new ToolFetchError(`The server returned HTTP ${response.status}.`)
    }
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maximumBytes) {
      await response.body?.cancel()
      throw new ToolLimitError('The fetched file exceeded its size limit.')
    }
    return {
      bytes: await readBounded(response.body, maximumBytes),
      contentType:
        response.headers.get('content-type')?.split(';')[0]?.trim() ?? '',
      finalUrl: current,
      status: response.status,
      redirects,
    }
  }
  throw new ToolLimitError('The URL redirected too many times.')
}

function decodeHtml(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      const named: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      }
      const normalized = entity.toLowerCase()
      if (named[normalized]) return named[normalized]
      const hexadecimal = normalized.startsWith('&#x')
      const codePoint = Number.parseInt(
        entity.slice(hexadecimal ? 3 : 2, -1),
        hexadecimal ? 16 : 10,
      )
      try {
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity
      } catch {
        return entity
      }
    },
  )
}

function cleanText(value: string | undefined, maximum: number): string {
  if (!value) return ''
  return decodeHtml(value.replace(/<[^>]*>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximum)
}

function safeResolve(value: string | undefined, base: URL): URL | undefined {
  if (!value || value.length > 2_048) return undefined
  try {
    return parseSitemapUrl(new URL(decodeHtml(value), base).toString())
  } catch {
    return undefined
  }
}

function metadataFromHtml(
  html: string,
  finalUrl: URL,
): {
  title: string
  description: string
  siteName: string
  iconUrls: URL[]
} {
  const explicitHead = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/iu)
  const bodyIndex = html.search(/<body\b/iu)
  const head =
    explicitHead?.[1] ?? html.slice(0, bodyIndex >= 0 ? bodyIndex : html.length)
  const baseTag = head.match(/<base\b[^>]*>/iu)?.[0]
  const baseUrl =
    safeResolve(
      baseTag ? parseAttributes(baseTag).get('href') : undefined,
      finalUrl,
    ) ?? finalUrl
  const meta = new Map<string, string>()
  for (const match of head.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const key = (
      attributes.get('name') ?? attributes.get('property')
    )?.toLowerCase()
    const content = attributes.get('content')
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content)
  }

  const iconUrls: URL[] = []
  for (const match of head.matchAll(/<link\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const relationships = attributes.get('rel')?.toLowerCase().split(/\s+/u)
    if (!relationships?.includes('icon')) continue
    const iconUrl = safeResolve(attributes.get('href'), baseUrl)
    if (
      iconUrl &&
      !iconUrls.some((url) => url.toString() === iconUrl.toString())
    ) {
      iconUrls.push(iconUrl)
    }
  }
  const fallback = new URL('/favicon.ico', finalUrl.origin)
  if (!iconUrls.some((url) => url.toString() === fallback.toString())) {
    iconUrls.push(fallback)
  }

  return {
    title: cleanText(
      head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1],
      300,
    ),
    description: cleanText(
      meta.get('description') ?? meta.get('og:description'),
      1_000,
    ),
    siteName: cleanText(
      meta.get('og:site_name') ?? meta.get('application-name'),
      100,
    ),
    iconUrls: iconUrls.slice(0, 2),
  }
}

export async function fetchSerpPreviewMetadata(
  pageUrl: URL,
  requestedUrl: string,
  fetcher: SitemapFetcher = fetch,
): Promise<SerpPreviewFetchResult> {
  const budget: FetchBudget = { subrequests: 0 }
  const warnings: string[] = []
  const page = await fetchBounded(
    pageUrl,
    fetcher,
    budget,
    SERP_PREVIEW_FETCH_LIMITS.htmlBytes,
    'text/html, application/xhtml+xml;q=0.9',
  )
  if (!/^(?:text\/html|application\/xhtml\+xml)$/iu.test(page.contentType)) {
    throw new ToolFetchError('The URL did not return an HTML page.')
  }
  const metadata = metadataFromHtml(
    new TextDecoder().decode(page.bytes),
    page.finalUrl,
  )
  if (!metadata.title) warnings.push('The fetched page has no title element.')
  if (!metadata.description) {
    warnings.push('The fetched page has no meta description.')
  }

  let favicon: SerpPreviewFetchResult['metadata']['favicon'] = {
    status: 'unavailable',
  }
  for (const iconUrl of metadata.iconUrls) {
    try {
      const icon = await fetchBounded(
        iconUrl,
        fetcher,
        budget,
        SERP_PREVIEW_FETCH_LIMITS.iconBytes,
        'image/*',
      )
      const contentType = previewContentType(inspectImage(icon.bytes).format)
      if (!contentType) continue
      favicon = {
        status: 'found',
        url: icon.finalUrl.toString(),
        dataUrl: `data:${contentType};base64,${base64(icon.bytes)}`,
      }
      break
    } catch {
      // Try the conventional fallback before returning metadata without an icon.
    }
  }
  if (favicon.status === 'unavailable') {
    warnings.push('No previewable favicon could be loaded.')
  }

  return {
    schema: 1,
    source: {
      requestedUrl,
      finalUrl: page.finalUrl.toString(),
      status: page.status,
      contentType: page.contentType,
      htmlBytes: page.bytes.byteLength,
      subrequests: budget.subrequests,
      redirects: page.redirects,
      limits: SERP_PREVIEW_FETCH_LIMITS,
    },
    metadata: {
      title: metadata.title,
      description: metadata.description,
      siteName:
        metadata.siteName || page.finalUrl.hostname.replace(/^www\./u, ''),
      favicon,
    },
    warnings,
  }
}

export async function handleSerpPreviewFetch(
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
      throw new ToolInputError('Send a JSON object with a website URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new ToolInputError('Send only the website URL.')
    }
    const submitted = (body as { url?: unknown }).url
    const pageUrl = parsePageUrl(submitted)
    return jsonResponse(
      await fetchSerpPreviewMetadata(
        pageUrl,
        typeof submitted === 'string' ? submitted.trim() : '',
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
      { error: 'The page metadata could not be loaded.' },
      503,
    )
  }
}
