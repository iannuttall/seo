import {
  base64,
  expectedType,
  type FaviconImage,
  inspectImage,
  parseAttributes,
  previewContentType,
} from './favicon-image.ts'
import {
  isBrowserRequestFromSameSite,
  parseSitemapUrl,
  type SitemapFetcher,
} from './sitemap.ts'

export const FAVICON_CHECKER_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  homepageBytes: 1_048_576,
  manifestBytes: 262_144,
  iconBytes: 1_048_576,
  totalBytes: 5_242_880,
  previewIconBytes: 131_072,
  previewTotalBytes: 524_288,
  icons: 16,
  redirects: 3,
  subrequests: 24,
  timeoutMilliseconds: 8_000,
})

type IconSource = 'html' | 'manifest' | 'fallback'

export type FaviconIcon = {
  url: string
  finalUrl?: string
  sources: IconSource[]
  declarations: Array<{
    source: IconSource
    rel?: string
    sizes?: string
    type?: string
    purpose?: string
    media?: string
  }>
  fetch: {
    status: 'ok' | 'http-error' | 'network-error' | 'too-large' | 'not-fetched'
    httpStatus?: number
    contentType?: string
    bytes?: number
    message?: string
  }
  image?: FaviconImage
  preview?: {
    dataUrl: string
    contentType: string
    bytes: number
  }
}

export type FaviconCoverage = {
  state: 'found' | 'issues-found' | 'not-found' | 'needs-review'
  evidence: string[]
}

export type FaviconCheckerResult = {
  schema: 1
  source: {
    requestedUrl: string
    homepageUrl: string
    finalHomepageUrl: string
    dataStatus: 'complete' | 'partial'
    downloadedBytes: number
    subrequests: number
    limits: typeof FAVICON_CHECKER_LIMITS
  }
  page: {
    httpStatus: number
    contentType: string
    bytes: number
    baseUrl: string
    manifestUrl?: string
    manifestStatus: 'not-declared' | 'fetched' | 'failed' | 'too-large'
  }
  icons: FaviconIcon[]
  coverage: {
    googleSearch: FaviconCoverage
    browsers: FaviconCoverage
    ios: FaviconCoverage
    pwa: FaviconCoverage
  }
  actions: string[]
  warnings: string[]
  limitations: string[]
}

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const GOOGLE_RELATIONSHIPS = new Set([
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
])

class FaviconInputError extends Error {}
class FaviconFetchError extends Error {
  readonly httpStatus?: number

  constructor(message: string, httpStatus?: number) {
    super(message)
    this.httpStatus = httpStatus
  }
}
class FaviconLimitError extends Error {}

type FetchBudget = {
  downloadedBytes: number
  subrequests: number
}

type FetchedResource = {
  bytes: Uint8Array
  contentType: string
  finalUrl: URL
  httpStatus: number
}

type IconCandidate = {
  url: URL
  sources: Set<IconSource>
  declarations: FaviconIcon['declarations']
}

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
        throw new FaviconLimitError('The response exceeded its download limit.')
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}

async function readFetchedBytes(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  budget: FetchBudget,
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
      budget.downloadedBytes += chunk.value.byteLength
      if (
        total > maximumBytes ||
        budget.downloadedBytes > FAVICON_CHECKER_LIMITS.totalBytes
      ) {
        await reader.cancel()
        throw new FaviconLimitError('The response exceeded its download limit.')
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}

async function readRequestJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > FAVICON_CHECKER_LIMITS.bodyBytes
  ) {
    throw new FaviconInputError('The request is too large.')
  }
  try {
    const bytes = await readBoundedBytes(
      request.body,
      FAVICON_CHECKER_LIMITS.bodyBytes,
    )
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof FaviconLimitError) {
      throw new FaviconInputError('The request is too large.')
    }
    if (error instanceof SyntaxError) {
      throw new FaviconInputError('Send a valid JSON request.')
    }
    throw error
  }
}

function parseWebsiteUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FaviconInputError('Enter a public website URL or domain.')
  }
  const trimmed = value.trim()
  const complete = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const parsed = parseSitemapUrl(complete)
    return new URL('/', parsed.origin)
  } catch {
    throw new FaviconInputError(
      'Enter a public HTTPS website URL without credentials or a custom port.',
    )
  }
}

async function fetchResource(
  initialUrl: URL,
  fetcher: SitemapFetcher,
  budget: FetchBudget,
  maximumBytes: number,
  accept: string,
): Promise<FetchedResource> {
  let current = initialUrl
  for (
    let redirects = 0;
    redirects <= FAVICON_CHECKER_LIMITS.redirects;
    redirects += 1
  ) {
    if (budget.subrequests >= FAVICON_CHECKER_LIMITS.subrequests) {
      throw new FaviconLimitError('The request limit was reached.')
    }
    const remaining = FAVICON_CHECKER_LIMITS.totalBytes - budget.downloadedBytes
    if (remaining <= 0) {
      throw new FaviconLimitError('The total download limit was reached.')
    }
    budget.subrequests += 1

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      FAVICON_CHECKER_LIMITS.timeoutMilliseconds,
    )
    let response: Response
    try {
      response = await fetcher(current, {
        headers: {
          accept,
          'user-agent':
            'SEO-Favicon-Checker/1.0 (+https://seoskill.dev/tools/favicon-checker)',
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
        throw new FaviconFetchError('The request timed out.')
      }
      throw new FaviconFetchError(
        `The request failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      clearTimeout(timeout)
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new FaviconFetchError('A redirect had no location.')
      if (redirects === FAVICON_CHECKER_LIMITS.redirects) {
        throw new FaviconLimitError('The URL redirected too many times.')
      }
      try {
        current = parseSitemapUrl(new URL(location, current).toString())
      } catch {
        throw new FaviconFetchError(
          'The URL redirected to a location that cannot be fetched.',
        )
      }
      continue
    }

    if (!response.ok) {
      await response.body?.cancel()
      throw new FaviconFetchError(
        `The server returned HTTP ${response.status}.`,
        response.status,
      )
    }
    const allowedBytes = Math.min(maximumBytes, remaining)
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > allowedBytes) {
      await response.body?.cancel()
      throw new FaviconLimitError('The response exceeded its download limit.')
    }
    const bytes = await readFetchedBytes(response.body, allowedBytes, budget)
    return {
      bytes,
      contentType:
        response.headers.get('content-type')?.split(';')[0]?.trim() ?? '',
      finalUrl: current,
      httpStatus: response.status,
    }
  }
  throw new FaviconLimitError('The URL redirected too many times.')
}

function safeResolve(value: string | undefined, base: URL): URL | undefined {
  if (!value || value.length > 2_048) return undefined
  try {
    const decoded = value.replace(
      /&(?:amp|quot|apos|lt|gt);/giu,
      (entity) =>
        ({
          '&amp;': '&',
          '&quot;': '"',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
        })[entity.toLowerCase()] ?? entity,
    )
    return parseSitemapUrl(new URL(decoded, base).toString())
  } catch {
    return undefined
  }
}

function addCandidate(
  candidates: Map<string, IconCandidate>,
  url: URL,
  source: IconSource,
  declaration: FaviconIcon['declarations'][number],
  warnings: string[],
): void {
  const key = url.toString()
  const existing = candidates.get(key)
  if (existing) {
    existing.sources.add(source)
    existing.declarations.push(declaration)
    return
  }
  if (candidates.size >= FAVICON_CHECKER_LIMITS.icons) {
    if (
      !warnings.includes('Only the first 16 unique icon URLs were checked.')
    ) {
      warnings.push('Only the first 16 unique icon URLs were checked.')
    }
    return
  }
  candidates.set(key, {
    url,
    sources: new Set([source]),
    declarations: [declaration],
  })
}

function hasRelationship(icon: FaviconIcon, relationship: string): boolean {
  return icon.declarations.some((declaration) => {
    const rel = declaration.rel?.toLowerCase().trim()
    return (
      rel === relationship ||
      (relationship === 'icon' && rel === 'shortcut icon')
    )
  })
}

function fetched(icon: FaviconIcon): boolean {
  return icon.fetch.status === 'ok' && icon.image?.format !== 'unknown'
}

function knownValidSquare(icon: FaviconIcon): boolean {
  if (!fetched(icon) || !icon.image || icon.image.square !== true) return false
  if (icon.image.scalable) return true
  return (icon.image.width ?? 0) >= 8 && (icon.image.height ?? 0) >= 8
}

function buildCoverage(
  icons: FaviconIcon[],
  manifestStatus: FaviconCheckerResult['page']['manifestStatus'],
): FaviconCheckerResult['coverage'] {
  const declaredGoogle = icons.filter((icon) =>
    icon.declarations.some((declaration) =>
      declaration.rel
        ? GOOGLE_RELATIONSHIPS.has(declaration.rel.toLowerCase())
        : false,
    ),
  )
  const googleUsable = declaredGoogle.filter(knownValidSquare)
  const googleUnknown = declaredGoogle.filter(
    (icon) => fetched(icon) && icon.image?.square === undefined,
  )
  const googleState: FaviconCoverage['state'] =
    declaredGoogle.length === 0
      ? 'not-found'
      : googleUsable.length > 0
        ? 'found'
        : googleUnknown.length > 0
          ? 'needs-review'
          : 'issues-found'
  const googleEvidence =
    declaredGoogle.length === 0
      ? ['The home page does not declare a Google-supported favicon link.']
      : [
          `${declaredGoogle.length} Google-supported favicon declaration${declaredGoogle.length === 1 ? '' : 's'} found on the home page.`,
          `${googleUsable.length} fetched icon${googleUsable.length === 1 ? '' : 's'} passed the checked square and minimum-size rules.`,
        ]

  const browserIcons = icons.filter(
    (icon) =>
      fetched(icon) &&
      (hasRelationship(icon, 'icon') || icon.sources.includes('fallback')),
  )
  const appleIcons = icons.filter(
    (icon) =>
      fetched(icon) &&
      (hasRelationship(icon, 'apple-touch-icon') ||
        hasRelationship(icon, 'apple-touch-icon-precomposed')),
  )
  const manifestIcons = icons.filter(
    (icon) => fetched(icon) && icon.sources.includes('manifest'),
  )
  const maskable = manifestIcons.filter((icon) =>
    icon.declarations.some((declaration) =>
      declaration.purpose?.toLowerCase().split(/\s+/u).includes('maskable'),
    ),
  )

  return {
    googleSearch: { state: googleState, evidence: googleEvidence },
    browsers: {
      state: browserIcons.length ? 'found' : 'not-found',
      evidence: browserIcons.length
        ? [
            `${browserIcons.length} browser favicon candidate${browserIcons.length === 1 ? '' : 's'} fetched successfully.`,
          ]
        : ['No declared icon or /favicon.ico fallback fetched successfully.'],
    },
    ios: {
      state: appleIcons.length ? 'found' : 'not-found',
      evidence: appleIcons.length
        ? [
            `${appleIcons.length} Apple touch icon${appleIcons.length === 1 ? '' : 's'} fetched successfully.`,
          ]
        : ['No Apple touch icon fetched successfully.'],
    },
    pwa: {
      state:
        manifestStatus === 'not-declared'
          ? 'not-found'
          : manifestStatus !== 'fetched'
            ? 'issues-found'
            : manifestIcons.length
              ? 'found'
              : 'issues-found',
      evidence:
        manifestStatus === 'not-declared'
          ? ['The home page does not declare a web app manifest.']
          : manifestStatus !== 'fetched'
            ? ['The declared web app manifest could not be checked.']
            : [
                `${manifestIcons.length} manifest icon${manifestIcons.length === 1 ? '' : 's'} fetched successfully.`,
                `${maskable.length} fetched icon${maskable.length === 1 ? '' : 's'} declared a maskable purpose.`,
              ],
    },
  }
}

function buildActions(
  coverage: FaviconCheckerResult['coverage'],
  icons: FaviconIcon[],
): string[] {
  const actions: string[] = []
  if (coverage.googleSearch.state !== 'found') {
    actions.push(
      'Declare a square favicon in the home page head with rel="icon" and a stable URL.',
    )
  }
  const googleIcons = icons.filter((icon) =>
    icon.declarations.some((declaration) =>
      declaration.rel
        ? GOOGLE_RELATIONSHIPS.has(declaration.rel.toLowerCase())
        : false,
    ),
  )
  if (
    googleIcons.some(
      (icon) =>
        icon.image?.square === true &&
        !icon.image.scalable &&
        (icon.image.width ?? 0) <= 48,
    )
  ) {
    actions.push(
      'Add a square favicon larger than 48 by 48 pixels for clearer rendering across Google surfaces.',
    )
  }
  if (coverage.browsers.state !== 'found') {
    actions.push(
      'Add a browser favicon and confirm the icon URL returns an image response.',
    )
  }
  if (coverage.ios.state !== 'found') {
    actions.push(
      'Add an apple-touch-icon declaration if people save the site to an iOS home screen.',
    )
  }
  if (coverage.pwa.state === 'issues-found') {
    actions.push(
      'Fix the web app manifest or its icon URLs before relying on them for an installed app.',
    )
  }
  if (coverage.pwa.state === 'not-found') {
    actions.push(
      'Add a web app manifest only if the site needs installable app icon coverage.',
    )
  }
  return actions
}

export async function checkFavicons(
  homepageUrl: URL,
  requestedUrl: string,
  fetcher: SitemapFetcher = fetch,
): Promise<FaviconCheckerResult> {
  const budget: FetchBudget = { downloadedBytes: 0, subrequests: 0 }
  const warnings: string[] = []
  const candidates = new Map<string, IconCandidate>()
  const homepage = await fetchResource(
    homepageUrl,
    fetcher,
    budget,
    FAVICON_CHECKER_LIMITS.homepageBytes,
    'text/html, application/xhtml+xml;q=0.9',
  )
  if (
    !/^(?:text\/html|application\/xhtml\+xml)$/iu.test(homepage.contentType)
  ) {
    throw new FaviconFetchError('The home page did not return HTML.')
  }
  const html = new TextDecoder().decode(homepage.bytes)
  const explicitHead = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/iu)
  const bodyIndex = html.search(/<body\b/iu)
  const head =
    explicitHead?.[1] ?? html.slice(0, bodyIndex >= 0 ? bodyIndex : html.length)
  const baseTag = head.match(/<base\b[^>]*>/iu)
  const baseAttributes = baseTag ? parseAttributes(baseTag[0]) : undefined
  const baseUrl =
    safeResolve(baseAttributes?.get('href'), homepage.finalUrl) ??
    homepage.finalUrl

  const fallbackUrl = new URL('/favicon.ico', homepage.finalUrl.origin)
  addCandidate(
    candidates,
    fallbackUrl,
    'fallback',
    { source: 'fallback', rel: 'browser fallback' },
    warnings,
  )

  let manifestUrl: URL | undefined
  for (const match of head.matchAll(/<link\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const rel = attributes.get('rel')?.toLowerCase().trim()
    const href = safeResolve(attributes.get('href'), baseUrl)
    if (!rel || !href) continue
    const relTokens = rel.split(/\s+/u)
    if (!manifestUrl && relTokens.includes('manifest')) manifestUrl = href

    let normalizedRel: string | undefined
    if (relTokens.includes('apple-touch-icon-precomposed')) {
      normalizedRel = 'apple-touch-icon-precomposed'
    } else if (relTokens.includes('apple-touch-icon')) {
      normalizedRel = 'apple-touch-icon'
    } else if (relTokens.includes('mask-icon')) {
      normalizedRel = 'mask-icon'
    } else if (relTokens.includes('icon')) {
      normalizedRel = relTokens.includes('shortcut') ? 'shortcut icon' : 'icon'
    }
    if (!normalizedRel) continue
    addCandidate(
      candidates,
      href,
      'html',
      {
        source: 'html',
        rel: normalizedRel,
        sizes: attributes.get('sizes'),
        type: attributes.get('type'),
        media: attributes.get('media'),
      },
      warnings,
    )
  }

  let manifestStatus: FaviconCheckerResult['page']['manifestStatus'] =
    'not-declared'
  let manifestIncomplete = false
  if (manifestUrl) {
    try {
      const manifest = await fetchResource(
        manifestUrl,
        fetcher,
        budget,
        FAVICON_CHECKER_LIMITS.manifestBytes,
        'application/manifest+json, application/json;q=0.9',
      )
      manifestStatus = 'fetched'
      const parsed = JSON.parse(
        new TextDecoder().decode(manifest.bytes),
      ) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SyntaxError('Manifest root is not an object.')
      }
      const icons = (parsed as { icons?: unknown }).icons
      if (Array.isArray(icons)) {
        for (const value of icons) {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            continue
          const icon = value as Record<string, unknown>
          const src =
            typeof icon.src === 'string'
              ? safeResolve(icon.src, manifest.finalUrl)
              : undefined
          if (!src) continue
          addCandidate(
            candidates,
            src,
            'manifest',
            {
              source: 'manifest',
              sizes: typeof icon.sizes === 'string' ? icon.sizes : undefined,
              type: typeof icon.type === 'string' ? icon.type : undefined,
              purpose:
                typeof icon.purpose === 'string' ? icon.purpose : undefined,
            },
            warnings,
          )
        }
      }
    } catch (error) {
      manifestStatus =
        error instanceof FaviconLimitError ? 'too-large' : 'failed'
      manifestIncomplete =
        error instanceof FaviconLimitError ||
        (error instanceof FaviconFetchError && error.httpStatus === undefined)
      warnings.push(
        `The declared web app manifest was not checked: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const icons: FaviconIcon[] = []
  let previewBytes = 0
  for (const candidate of candidates.values()) {
    const result: FaviconIcon = {
      url: candidate.url.toString(),
      sources: [...candidate.sources],
      declarations: candidate.declarations,
      fetch: { status: 'not-fetched' },
    }
    try {
      const resource = await fetchResource(
        candidate.url,
        fetcher,
        budget,
        FAVICON_CHECKER_LIMITS.iconBytes,
        'image/avif, image/webp, image/svg+xml, image/png, image/jpeg, image/gif, image/x-icon, image/*;q=0.8',
      )
      const image = inspectImage(resource.bytes)
      result.finalUrl = resource.finalUrl.toString()
      result.fetch = {
        status: 'ok',
        httpStatus: resource.httpStatus,
        contentType: resource.contentType,
        bytes: resource.bytes.byteLength,
      }
      result.image = image
      const previewType = previewContentType(image.format)
      if (
        previewType &&
        resource.bytes.byteLength <= FAVICON_CHECKER_LIMITS.previewIconBytes &&
        previewBytes + resource.bytes.byteLength <=
          FAVICON_CHECKER_LIMITS.previewTotalBytes
      ) {
        result.preview = {
          dataUrl: `data:${previewType};base64,${base64(resource.bytes)}`,
          contentType: previewType,
          bytes: resource.bytes.byteLength,
        }
        previewBytes += resource.bytes.byteLength
      }
      const expected = expectedType(image.format)
      if (
        resource.contentType &&
        expected.length > 0 &&
        !expected.includes(resource.contentType.toLowerCase())
      ) {
        warnings.push(
          `${candidate.url.toString()} returned ${resource.contentType}, but its bytes look like ${image.format.toUpperCase()}.`,
        )
      }
      if (image.format === 'unknown') {
        warnings.push(
          `${candidate.url.toString()} did not contain a recognised favicon image format.`,
        )
      }
    } catch (error) {
      result.fetch = {
        status:
          error instanceof FaviconLimitError
            ? 'too-large'
            : error instanceof FaviconFetchError && error.httpStatus
              ? 'http-error'
              : 'network-error',
        httpStatus:
          error instanceof FaviconFetchError ? error.httpStatus : undefined,
        message: error instanceof Error ? error.message : String(error),
      }
      if (result.fetch.status === 'http-error') {
        warnings.push(
          `${candidate.url.toString()} returned HTTP ${result.fetch.httpStatus} and no image was available.`,
        )
      } else if (result.fetch.status === 'too-large') {
        warnings.push(
          `${candidate.url.toString()} was not retained: ${result.fetch.message}`,
        )
      } else {
        warnings.push(
          `${candidate.url.toString()} could not be fetched: ${result.fetch.message}`,
        )
      }
    }
    icons.push(result)
  }

  const coverage = buildCoverage(icons, manifestStatus)
  const actions = buildActions(coverage, icons)
  const partial =
    manifestIncomplete ||
    warnings.includes('Only the first 16 unique icon URLs were checked.') ||
    icons.some((icon) =>
      ['network-error', 'too-large', 'not-fetched'].includes(icon.fetch.status),
    )

  return {
    schema: 1,
    source: {
      requestedUrl,
      homepageUrl: homepageUrl.toString(),
      finalHomepageUrl: homepage.finalUrl.toString(),
      dataStatus: partial ? 'partial' : 'complete',
      downloadedBytes: budget.downloadedBytes,
      subrequests: budget.subrequests,
      limits: FAVICON_CHECKER_LIMITS,
    },
    page: {
      httpStatus: homepage.httpStatus,
      contentType: homepage.contentType,
      bytes: homepage.bytes.byteLength,
      baseUrl: baseUrl.toString(),
      manifestUrl: manifestUrl?.toString(),
      manifestStatus,
    },
    icons,
    coverage,
    actions,
    warnings: [...new Set(warnings)],
    limitations: [
      'The check uses the public home page and does not confirm what Googlebot or Googlebot-Image can crawl.',
      'Passing the checked size and shape rules does not guarantee that Google will show a favicon.',
      'Image content, brand suitability, URL stability, platform rendering, and manifest installability still need human or device testing.',
    ],
  }
}

export async function handleFaviconCheck(
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
      throw new FaviconInputError('Send a JSON object with a website URL.')
    }
    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'url') {
      throw new FaviconInputError('Send only the website URL.')
    }
    const requestedUrl = (body as { url?: unknown }).url
    const homepageUrl = parseWebsiteUrl(requestedUrl)
    return jsonResponse(
      await checkFavicons(homepageUrl, String(requestedUrl).trim(), fetcher),
    )
  } catch (error) {
    if (error instanceof FaviconInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    if (error instanceof FaviconLimitError) {
      return jsonResponse({ error: error.message }, 413)
    }
    if (error instanceof FaviconFetchError) {
      return jsonResponse({ error: error.message }, 422)
    }
    return jsonResponse(
      { error: 'The website favicons could not be checked.' },
      503,
    )
  }
}
