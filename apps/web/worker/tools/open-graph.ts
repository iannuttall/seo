// Reads a page's Open Graph and X card tags the way a link preview crawler
// does: the raw HTML head, without running JavaScript. It fetches the share
// image too, so the result can state its real size, format and file size
// against each platform's published limits.
import {
  base64,
  type FaviconImage,
  inspectImage,
  parseAttributes,
  previewContentType,
} from './favicon-image.ts'
import {
  cleanText,
  type FetchBudget,
  fetchBounded,
  parsePageUrl,
  readRequest,
  safeResolve,
  ToolFetchError,
  ToolInputError,
  ToolLimitError,
} from './serp-preview.ts'
import { isBrowserRequestFromSameSite, type SitemapFetcher } from './sitemap.ts'

export const OPEN_GRAPH_LIMITS = Object.freeze({
  htmlBytes: 1_048_576,
  // Facebook's own limit, so a larger file can be reported as too large.
  imageBytes: 8_388_608,
  previewBytes: 1_572_864,
  images: 2,
  tags: 80,
  redirects: 3,
  subrequests: 10,
})

const USER_AGENT =
  'SEO-Open-Graph-Checker/1.0 (+https://seoskill.dev/tools/open-graph-checker)'

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type OpenGraphImage = {
  url: string
  usedBy: Array<'open-graph' | 'x'>
  status: 'ok' | 'http-error' | 'too-large' | 'not-image' | 'failed'
  message?: string
  bytes?: number
  contentType?: string
  format?: FaviconImage['format']
  width?: number
  height?: number
  dataUrl?: string
}

export type OpenGraphCheck = {
  id: string
  level: 'pass' | 'warn' | 'fail' | 'info'
  message: string
}

export type OpenGraphResult = {
  schema: 1
  source: {
    requestedUrl: string
    finalUrl: string
    status: number
    redirects: Array<{ from: string; to: string; status: number }>
    htmlBytes: number
    checkedAt: string
  }
  // What a share shows, after each platform's fallbacks.
  preview: {
    title: string
    description: string
    siteName: string
    url: string
    image: string | null
    imageAlt: string
    xTitle: string
    xDescription: string
    xImage: string | null
    xCard: string
  }
  page: { title: string; description: string; canonical: string | null }
  tags: Array<{ key: string; value: string }>
  images: OpenGraphImage[]
  checks: OpenGraphCheck[]
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

type Parsed = {
  tags: Array<{ key: string; value: string }>
  bodyTags: number
  title: string
  description: string
  canonical: string | null
}

export function parseHead(html: string, finalUrl: URL): Parsed {
  const explicitHead = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/iu)
  const bodyIndex = html.search(/<body\b/iu)
  const head =
    explicitHead?.[1] ?? html.slice(0, bodyIndex >= 0 ? bodyIndex : html.length)
  const rest = bodyIndex >= 0 ? html.slice(bodyIndex) : ''
  const tags: Parsed['tags'] = []
  let description = ''
  for (const match of head.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const key = (attributes.get('property') ?? attributes.get('name'))
      ?.trim()
      .toLowerCase()
    const value = attributes.get('content')
    if (!key || value === undefined) continue
    if (key === 'description' && !description) {
      description = cleanText(value, 1_000)
    }
    if (/^(?:og|twitter|article|fb):/u.test(key)) {
      if (tags.length < OPEN_GRAPH_LIMITS.tags) {
        tags.push({ key, value: cleanText(value, 1_000) })
      }
    }
  }
  const bodyTags = [...rest.matchAll(/<meta\b[^>]*>/giu)].filter((match) =>
    /^(?:og|twitter):/u.test(
      (
        parseAttributes(match[0]).get('property') ??
        parseAttributes(match[0]).get('name') ??
        ''
      ).toLowerCase(),
    ),
  ).length
  let canonical: string | null = null
  for (const match of head.matchAll(/<link\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    if (
      attributes.get('rel')?.toLowerCase().split(/\s+/u).includes('canonical')
    ) {
      canonical =
        safeResolve(attributes.get('href'), finalUrl)?.toString() ?? null
      break
    }
  }
  return {
    tags,
    bodyTags,
    title: cleanText(
      head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu)?.[1],
      300,
    ),
    description,
    canonical,
  }
}

async function fetchImage(
  url: URL,
  usedBy: OpenGraphImage['usedBy'],
  fetcher: SitemapFetcher,
  budget: FetchBudget,
): Promise<OpenGraphImage> {
  const image: OpenGraphImage = {
    url: url.toString(),
    usedBy,
    status: 'failed',
  }
  try {
    const resource = await fetchBounded(
      url,
      fetcher,
      budget,
      OPEN_GRAPH_LIMITS.imageBytes,
      'image/*',
      OPEN_GRAPH_LIMITS,
      USER_AGENT,
    )
    const inspected = inspectImage(resource.bytes)
    Object.assign(image, {
      bytes: resource.bytes.byteLength,
      contentType: resource.contentType,
      format: inspected.format,
      width: inspected.width,
      height: inspected.height,
    })
    if (inspected.format === 'unknown') {
      return {
        ...image,
        status: 'not-image',
        message: `The URL returned ${resource.contentType || 'an unknown type'}, not an image.`,
      }
    }
    const contentType = previewContentType(inspected.format)
    if (
      contentType &&
      resource.bytes.byteLength <= OPEN_GRAPH_LIMITS.previewBytes
    ) {
      image.dataUrl = `data:${contentType};base64,${base64(resource.bytes)}`
    }
    return { ...image, status: 'ok' }
  } catch (error) {
    if (error instanceof ToolLimitError) {
      return {
        ...image,
        status: 'too-large',
        message: error.message.includes('size')
          ? 'The image is larger than 8 MB.'
          : error.message,
      }
    }
    return {
      ...image,
      status:
        error instanceof ToolFetchError && /HTTP/u.test(error.message)
          ? 'http-error'
          : 'failed',
      message:
        error instanceof Error
          ? error.message
          : 'The image could not be fetched.',
    }
  }
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

export function checkTags(
  parsed: Parsed,
  finalUrl: URL,
  images: OpenGraphImage[],
): { checks: OpenGraphCheck[]; preview: OpenGraphResult['preview'] } {
  const first = (key: string) =>
    parsed.tags.find((tag) => tag.key === key)?.value ?? ''
  const count = (key: string) =>
    parsed.tags.filter((tag) => tag.key === key).length
  const checks: OpenGraphCheck[] = []
  const add = (id: string, level: OpenGraphCheck['level'], message: string) =>
    checks.push({ id, level, message })

  const ogTitle = first('og:title')
  const ogDescription = first('og:description')
  const ogImageRaw =
    first('og:image') || first('og:image:url') || first('og:image:secure_url')
  const ogImage = safeResolve(ogImageRaw, finalUrl)?.toString() ?? null
  const xImageRaw = first('twitter:image') || first('twitter:image:src')
  const xImage = xImageRaw
    ? (safeResolve(xImageRaw, finalUrl)?.toString() ?? null)
    : ogImage
  const ogUrl = first('og:url')
  const xCard = first('twitter:card')

  add(
    'og-title',
    ogTitle ? 'pass' : parsed.title ? 'warn' : 'fail',
    ogTitle
      ? 'og:title is set.'
      : parsed.title
        ? 'No og:title. Most platforms fall back to the page title, which may be longer or carry the site name twice.'
        : 'No og:title and no page title, so shares have no headline.',
  )
  add(
    'og-description',
    ogDescription ? 'pass' : 'warn',
    ogDescription
      ? 'og:description is set.'
      : parsed.description
        ? 'No og:description. Some platforms use the meta description instead, some show nothing.'
        : 'No og:description and no meta description, so shares have no summary text.',
  )
  if (!ogImageRaw) {
    add(
      'og-image',
      'fail',
      'No og:image. Shares show no picture, or one the platform picks from the page.',
    )
  } else if (!ogImage) {
    add(
      'og-image',
      'fail',
      'og:image is not a URL that can be fetched over HTTPS.',
    )
  } else {
    add(
      'og-image',
      /^https?:\/\//iu.test(ogImageRaw) ? 'pass' : 'warn',
      /^https?:\/\//iu.test(ogImageRaw)
        ? 'og:image is set to a full URL.'
        : 'og:image is a relative URL. Facebook asks for a full URL, so write it with https:// and the host.',
    )
  }
  if (count('og:title') > 1 || count('og:image') > 1) {
    add(
      'duplicates',
      'info',
      'The page has more than one og:title or og:image. Platforms usually take the first one.',
    )
  }
  if (parsed.bodyTags > 0) {
    add(
      'outside-head',
      'warn',
      `${parsed.bodyTags} Open Graph or X tags sit outside the head. Crawlers read the head, so these may be ignored.`,
    )
  }

  for (const image of images) {
    const who = image.usedBy.includes('open-graph')
      ? 'The share image'
      : 'The X image'
    if (image.status !== 'ok') {
      add(
        `image-${image.usedBy[0]}`,
        'fail',
        `${who} could not be used: ${image.message ?? 'it did not load.'}`,
      )
      continue
    }
    const { width, height, bytes = 0, format } = image
    if (format === 'svg') {
      add(
        'image-format',
        'fail',
        `${who} is an SVG. Facebook and X do not show SVG images, so use PNG, JPEG or WebP.`,
      )
    } else if (format === 'avif') {
      add(
        'image-format',
        'warn',
        `${who} is AVIF, which not every platform shows. PNG, JPEG or WebP is safer.`,
      )
    }
    if (bytes > 5_242_880) {
      add(
        'image-bytes',
        'warn',
        `${who} is ${megabytes(bytes)}. X and LinkedIn accept up to 5 MB, and smaller files load faster in chat apps.`,
      )
    }
    if (width && height) {
      const ratio = width / height
      if (width < 200 || height < 200) {
        add(
          'image-dimensions',
          'fail',
          `${who} is ${width}×${height}. Facebook needs at least 200×200.`,
        )
      } else if (width < 600 || height < 315) {
        add(
          'image-dimensions',
          'warn',
          `${who} is ${width}×${height}. Below 600×315, Facebook shows it as a small thumbnail instead of a large card.`,
        )
      } else if (width < 1200) {
        add(
          'image-dimensions',
          'warn',
          `${who} is ${width}×${height}. It shows as a large card, but 1200×630 looks sharper on high-resolution screens.`,
        )
      } else {
        add('image-dimensions', 'pass', `${who} is ${width}×${height}.`)
      }
      if (ratio < 1.8 || ratio > 2.05) {
        add(
          'image-ratio',
          'warn',
          `${who} has a ${ratio.toFixed(2)}:1 shape. Large cards are about 1.91:1, so it is cropped when shown large.`,
        )
      }
      const declaredWidth = Number(first('og:image:width'))
      const declaredHeight = Number(first('og:image:height'))
      if (
        image.usedBy.includes('open-graph') &&
        declaredWidth &&
        declaredHeight &&
        (declaredWidth !== width || declaredHeight !== height)
      ) {
        add(
          'image-declared',
          'warn',
          `og:image:width and og:image:height say ${declaredWidth}×${declaredHeight}, but the file is ${width}×${height}.`,
        )
      }
    } else {
      add(
        'image-dimensions',
        'info',
        `The size of ${who.toLowerCase()} could not be read from the file.`,
      )
    }
  }
  if (ogImage && !(first('og:image:width') && first('og:image:height'))) {
    add(
      'image-size-tags',
      'info',
      'No og:image:width and og:image:height. Facebook shows the image on the first share only when it knows the size in advance.',
    )
  }
  if (ogImage && !first('og:image:alt')) {
    add(
      'image-alt',
      'warn',
      'No og:image:alt, so people using screen readers get no description of the image.',
    )
  }

  if (!ogUrl) {
    add(
      'og-url',
      'warn',
      'No og:url. Platforms use the shared address, so likes and shares can split across URL versions.',
    )
  } else {
    const resolved = safeResolve(ogUrl, finalUrl)?.toString()
    if (parsed.canonical && resolved && resolved !== parsed.canonical) {
      add(
        'og-url',
        'warn',
        `og:url (${resolved}) is not the canonical URL (${parsed.canonical}).`,
      )
    } else {
      add('og-url', 'pass', 'og:url is set.')
    }
  }
  if (!first('og:type')) {
    add(
      'og-type',
      'info',
      'No og:type. Facebook treats the page as website, which is right for most pages.',
    )
  }
  if (!xCard) {
    add(
      'twitter-card',
      'warn',
      'No twitter:card. X reads your Open Graph text and image, but this tag picks the card layout.',
    )
  } else if (xCard === 'summary' && xImage) {
    add(
      'twitter-card',
      'info',
      'twitter:card is summary, so X shows a small square thumbnail. Use summary_large_image for a full-width image.',
    )
  } else {
    add('twitter-card', 'pass', `twitter:card is ${xCard}.`)
  }

  const order = { fail: 0, warn: 1, info: 2, pass: 3 }
  checks.sort((a, b) => order[a.level] - order[b.level])
  return {
    checks,
    preview: {
      title: ogTitle || parsed.title,
      description: ogDescription || parsed.description,
      siteName:
        first('og:site_name') || finalUrl.hostname.replace(/^www\./u, ''),
      url: finalUrl.hostname.replace(/^www\./u, ''),
      image: ogImage,
      imageAlt: first('og:image:alt'),
      xTitle: first('twitter:title') || ogTitle || parsed.title,
      xDescription:
        first('twitter:description') || ogDescription || parsed.description,
      xImage,
      xCard: xCard || 'summary',
    },
  }
}

export async function checkOpenGraph(
  pageUrl: URL,
  requestedUrl: string,
  fetcher: SitemapFetcher = fetch,
  now = new Date(),
): Promise<OpenGraphResult> {
  const budget: FetchBudget = { subrequests: 0 }
  const page = await fetchBounded(
    pageUrl,
    fetcher,
    budget,
    OPEN_GRAPH_LIMITS.htmlBytes,
    'text/html, application/xhtml+xml;q=0.9',
    OPEN_GRAPH_LIMITS,
    USER_AGENT,
  )
  if (!/^(?:text\/html|application\/xhtml\+xml)$/iu.test(page.contentType)) {
    throw new ToolFetchError('The URL did not return an HTML page.')
  }
  const parsed = parseHead(new TextDecoder().decode(page.bytes), page.finalUrl)
  const { preview } = checkTags(parsed, page.finalUrl, [])

  const targets: Array<{ url: string; usedBy: OpenGraphImage['usedBy'] }> = []
  if (preview.image)
    targets.push({ url: preview.image, usedBy: ['open-graph'] })
  if (preview.xImage) {
    const same = targets.find((target) => target.url === preview.xImage)
    if (same) same.usedBy.push('x')
    else targets.push({ url: preview.xImage, usedBy: ['x'] })
  }
  const images: OpenGraphImage[] = []
  for (const target of targets.slice(0, OPEN_GRAPH_LIMITS.images)) {
    images.push(
      await fetchImage(new URL(target.url), target.usedBy, fetcher, budget),
    )
  }
  const { checks } = checkTags(parsed, page.finalUrl, images)

  return {
    schema: 1,
    source: {
      requestedUrl,
      finalUrl: page.finalUrl.toString(),
      status: page.status,
      redirects: page.redirects,
      htmlBytes: page.bytes.byteLength,
      checkedAt: now.toISOString(),
    },
    preview,
    page: {
      title: parsed.title,
      description: parsed.description,
      canonical: parsed.canonical,
    },
    tags: parsed.tags,
    images,
    checks,
  }
}

export async function handleOpenGraphCheck(
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
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).join() !== 'url'
    ) {
      throw new ToolInputError('Send only the page URL.')
    }
    const requestedUrl = (body as { url?: unknown }).url
    const pageUrl = parsePageUrl(requestedUrl)
    return jsonResponse(
      await checkOpenGraph(pageUrl, String(requestedUrl).trim(), fetcher),
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
    return jsonResponse({ error: 'The page could not be checked.' }, 503)
  }
}
