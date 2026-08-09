export const SITEMAP_TOOL_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  sitemapBytes: 1_048_576,
  totalBytes: 3_145_728,
  sitemaps: 5,
  subrequests: 8,
  urls: 1_000,
  urlCharacters: 250_000,
  redirects: 3,
  timeoutMilliseconds: 8_000,
})

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type SitemapFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type SitemapDocument = {
  requestedUrl: string
  finalUrl: string
  root: 'urlset' | 'sitemapindex'
  locs: string[]
  bytes: number
}

export type SitemapToolResult = {
  schema: 1
  source: {
    requestedUrl: string
    finalUrl: string
    dataStatus: 'complete' | 'partial'
    sitemapsFetched: number
    urlsFound: number
    limits: typeof SITEMAP_TOOL_LIMITS
  }
  truncation: {
    possiblyTruncated: boolean
    sitemapLimitExceeded: boolean
    urlLimitExceeded: boolean
    outputLimitExceeded: boolean
  }
  urls: Array<{ url: string; label: string }>
  warnings: string[]
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
          `A sitemap exceeded the ${maximumBytes.toLocaleString()} byte limit.`,
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
  if (Number.isFinite(declared) && declared > SITEMAP_TOOL_LIMITS.bodyBytes) {
    throw new ToolInputError('The request is too large.')
  }
  const bytes = await readBoundedBytes(
    request.body,
    SITEMAP_TOOL_LIMITS.bodyBytes,
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

export function isBrowserRequestFromSameSite(request: Request): boolean {
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

export function parseSitemapUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new ToolInputError('Enter a complete HTTPS sitemap URL.')
  }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new ToolInputError('Enter a complete HTTPS sitemap URL.')
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
      'Use a public HTTPS sitemap URL without credentials or a custom port.',
    )
  }
  url.hash = ''
  return url
}

function decodeXmlText(value: string): string {
  const unwrapped = value.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, '$1')
  return unwrapped.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      const named: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      }
      const replacement = named[entity.toLowerCase()]
      if (replacement) return replacement
      const hexadecimal = entity.toLowerCase().startsWith('&#x')
      const raw = entity.slice(hexadecimal ? 3 : 2, -1)
      const codePoint = Number.parseInt(raw, hexadecimal ? 16 : 10)
      if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff)
        return entity
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return entity
      }
    },
  )
}

function extractSitemapDocument(
  xml: string,
  requestedUrl: string,
  finalUrl: string,
  bytes: number,
): SitemapDocument {
  if (/<!DOCTYPE\b/iu.test(xml)) {
    throw new ToolFetchError(
      'The sitemap contains an unsupported document type.',
    )
  }

  const openingRoot = xml.match(
    /<(?:(?:[A-Za-z_][\w.-]*):)?(urlset|sitemapindex)\b[^>]*>/iu,
  )
  const root = openingRoot?.[1]?.toLowerCase()
  if (root !== 'urlset' && root !== 'sitemapindex') {
    throw new ToolFetchError('The response is not a sitemap XML document.')
  }

  const entryName = root === 'urlset' ? 'url' : 'sitemap'
  const entryPattern = new RegExp(
    `<(?:(?:[A-Za-z_][\\w.-]*):)?${entryName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${entryName}\\s*>`,
    'giu',
  )
  const locPattern =
    /<(?:(?:[A-Za-z_][\w.-]*):)?loc\b[^>]*>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?loc\s*>/iu
  const locs: string[] = []
  for (const entry of xml.matchAll(entryPattern)) {
    const loc = entry[1]?.match(locPattern)?.[1]
    if (loc !== undefined) locs.push(decodeXmlText(loc))
  }

  return { requestedUrl, finalUrl, root, locs, bytes }
}

async function decodeSitemapBytes(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  if (!isGzip) return new TextDecoder().decode(bytes)

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const expanded = await readBoundedBytes(
    stream,
    SITEMAP_TOOL_LIMITS.sitemapBytes,
  )
  return new TextDecoder().decode(expanded)
}

async function fetchDocument(
  initialUrl: URL,
  fetcher: SitemapFetcher,
  budget: { subrequests: number },
  maximumBytes: number,
): Promise<SitemapDocument> {
  let current = initialUrl
  const requestedUrl = initialUrl.toString()

  for (
    let redirects = 0;
    redirects <= SITEMAP_TOOL_LIMITS.redirects;
    redirects += 1
  ) {
    if (budget.subrequests >= SITEMAP_TOOL_LIMITS.subrequests) {
      throw new ToolLimitError('The sitemap request limit was reached.')
    }
    budget.subrequests += 1

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      SITEMAP_TOOL_LIMITS.timeoutMilliseconds,
    )
    let response: Response
    try {
      response = await fetcher(current, {
        headers: {
          accept:
            'application/xml, text/xml, application/gzip, text/plain;q=0.8',
          'user-agent': 'SEO-Sitemap-Tool/1.0 (+https://seoskill.dev/tools)',
        },
        redirect: 'manual',
        signal: controller.signal,
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { '200-299': 900, '400-499': 60, '500-599': 0 },
        },
      } as RequestInit)
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ToolFetchError('The sitemap request timed out.')
      }
      throw new ToolFetchError(
        `The sitemap could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location)
        throw new ToolFetchError('The sitemap redirect has no location.')
      if (redirects === SITEMAP_TOOL_LIMITS.redirects) {
        throw new ToolLimitError('The sitemap redirected too many times.')
      }
      try {
        current = parseSitemapUrl(new URL(location, current).toString())
      } catch {
        throw new ToolFetchError(
          'The sitemap redirected to a URL that cannot be fetched.',
        )
      }
      continue
    }

    if (!response.ok) {
      throw new ToolFetchError(`The sitemap returned HTTP ${response.status}.`)
    }
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maximumBytes) {
      throw new ToolLimitError(
        `A sitemap exceeded the ${maximumBytes.toLocaleString()} byte limit.`,
      )
    }
    const bytes = await readBoundedBytes(response.body, maximumBytes)
    const xml = await decodeSitemapBytes(bytes)
    return extractSitemapDocument(
      xml,
      requestedUrl,
      current.toString(),
      bytes.byteLength,
    )
  }

  throw new ToolLimitError('The sitemap redirected too many times.')
}

function pageLabel(value: string): string {
  const url = new URL(value)
  const segment = url.pathname.split('/').filter(Boolean).at(-1)
  if (!segment) return url.hostname.replace(/^www\./u, '')

  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // Keep the encoded path when it contains malformed escape sequences.
  }
  const words = decoded
    .replace(/\.(?:html?|mdx?)$/iu, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : url.hostname
}

function normalizePageUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (url.username || url.password || value.length > 2_048) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export async function importSitemap(
  sitemapUrl: URL,
  fetcher: SitemapFetcher = fetch,
): Promise<SitemapToolResult> {
  const queue = [sitemapUrl]
  const scheduled = new Set([sitemapUrl.toString()])
  const seenPages = new Set<string>()
  const urls: Array<{ url: string; label: string }> = []
  const warnings: string[] = []
  const budget = { subrequests: 0 }
  let rootFinalUrl = sitemapUrl.toString()
  let fetched = 0
  let totalBytes = 0
  let urlCharacters = 0
  let sitemapLimitExceeded = false
  let urlLimitExceeded = false
  let outputLimitExceeded = false

  while (queue.length > 0 && fetched < SITEMAP_TOOL_LIMITS.sitemaps) {
    const next = queue.shift()
    if (!next) continue
    const remainingBytes = SITEMAP_TOOL_LIMITS.totalBytes - totalBytes
    if (remainingBytes <= 0) {
      sitemapLimitExceeded = true
      warnings.push('Stopped after reaching the total sitemap download limit.')
      break
    }
    let document: SitemapDocument
    try {
      document = await fetchDocument(
        next,
        fetcher,
        budget,
        Math.min(SITEMAP_TOOL_LIMITS.sitemapBytes, remainingBytes),
      )
    } catch (error) {
      if (fetched === 0) throw error
      warnings.push(
        `Skipped ${next.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }

    fetched += 1
    totalBytes += document.bytes
    if (fetched === 1) rootFinalUrl = document.finalUrl
    if (totalBytes > SITEMAP_TOOL_LIMITS.totalBytes) {
      sitemapLimitExceeded = true
      warnings.push('Stopped after reaching the total sitemap download limit.')
      break
    }

    if (document.root === 'sitemapindex') {
      const rootHostname = new URL(rootFinalUrl).hostname
      for (const loc of document.locs) {
        if (scheduled.size >= SITEMAP_TOOL_LIMITS.sitemaps) {
          sitemapLimitExceeded = true
          break
        }
        let child: URL
        try {
          child = parseSitemapUrl(loc)
        } catch {
          warnings.push(
            `Skipped an invalid child sitemap URL: ${loc.slice(0, 160)}`,
          )
          continue
        }
        if (child.hostname !== rootHostname) {
          warnings.push(
            `Skipped a child sitemap on another hostname: ${child.hostname}`,
          )
          continue
        }
        if (!scheduled.has(child.toString())) {
          scheduled.add(child.toString())
          queue.push(child)
        }
      }
      continue
    }

    for (const loc of document.locs) {
      const page = normalizePageUrl(loc)
      if (!page || seenPages.has(page)) continue
      if (urls.length >= SITEMAP_TOOL_LIMITS.urls) {
        urlLimitExceeded = true
        break
      }
      if (urlCharacters + page.length > SITEMAP_TOOL_LIMITS.urlCharacters) {
        outputLimitExceeded = true
        break
      }
      seenPages.add(page)
      urlCharacters += page.length
      urls.push({ url: page, label: pageLabel(page) })
    }
    if (urlLimitExceeded || outputLimitExceeded) break
  }

  if (queue.length > 0) {
    sitemapLimitExceeded = true
  }
  if (sitemapLimitExceeded) {
    warnings.push(
      `Only the first ${SITEMAP_TOOL_LIMITS.sitemaps} sitemap files were checked.`,
    )
  }
  if (urlLimitExceeded) {
    warnings.push(
      `Only the first ${SITEMAP_TOOL_LIMITS.urls} unique URLs were returned.`,
    )
  }
  if (outputLimitExceeded) {
    warnings.push('The URL list was shortened to keep the response small.')
  }
  if (urls.length === 0) {
    warnings.push('No valid page URLs were found in the checked sitemap files.')
  }

  const possiblyTruncated =
    sitemapLimitExceeded || urlLimitExceeded || outputLimitExceeded
  return {
    schema: 1,
    source: {
      requestedUrl: sitemapUrl.toString(),
      finalUrl: rootFinalUrl,
      dataStatus:
        warnings.length > 0 || possiblyTruncated ? 'partial' : 'complete',
      sitemapsFetched: fetched,
      urlsFound: urls.length,
      limits: SITEMAP_TOOL_LIMITS,
    },
    truncation: {
      possiblyTruncated,
      sitemapLimitExceeded,
      urlLimitExceeded,
      outputLimitExceeded,
    },
    urls,
    warnings: [...new Set(warnings)],
  }
}

export async function handleSitemapImport(
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
    const body = await readRequestJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ToolInputError('Send a JSON object with a sitemap URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new ToolInputError('Send only the sitemap URL.')
    }
    const sitemapUrl = parseSitemapUrl((body as { url?: unknown }).url)
    return jsonResponse(await importSitemap(sitemapUrl, fetcher))
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
    return jsonResponse({ error: 'The sitemap could not be checked.' }, 503)
  }
}
