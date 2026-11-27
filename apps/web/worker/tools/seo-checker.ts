// A free one-page SEO check: whether Google can reach and index the page
// (the same checks as the noindex checker), then what the page tells search
// engines and link previews in its HTML. It reads the HTML the server sends,
// before JavaScript runs, and fetches nothing but the page and robots.txt.
import { sameTarget } from '@seo/core/commands'
import { parseAttributes } from './favicon-image.ts'
import {
  type NoindexCheck,
  type NoindexVerdict,
  noindexChecks,
  platformOf,
  robotsFor,
} from './noindex-checker.ts'
import { parseHead } from './open-graph.ts'
import {
  type PageSignals,
  parsePublicUrl,
  readPageSignals,
  stripInert,
  tracePage,
} from './page-signals.ts'
import {
  readRequest,
  ToolFetchError,
  ToolInputError,
  ToolLimitError,
} from './serp-preview.ts'
import { isBrowserRequestFromSameSite, type SitemapFetcher } from './sitemap.ts'

const USER_AGENT = 'SEO-Checker/1.0 (+https://seoskill.dev/tools/seo-checker)'

// Character counts are a rough guide; Google cuts titles and descriptions
// by pixel width, which the title checker measures.
const TITLE_CHARACTERS = 60
const DESCRIPTION_CHARACTERS = 160
const THIN_WORDS = 200
const MAX_LISTED = 5

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type SeoCheck = NoindexCheck & {
  group: 'access' | 'content' | 'markup'
}

export type PageContent = {
  lang: string | null
  viewport: boolean
  h1Count: number
  h2Count: number
  words: number
  images: number
  imagesWithoutAlt: number
  // Up to five of them, to find in the page.
  imagesWithoutAltSample: string[]
  links: { internal: number; external: number; nofollow: number }
  hreflang: number
  structuredData: { types: string[]; invalid: number }
  openGraph: { title: boolean; description: boolean; image: boolean }
}

export type SeoCheckerResult = {
  schema: 1
  checkedAt: string
  requestedUrl: string
  finalUrl: string
  status: number | null
  verdict: NoindexVerdict
  headline: string
  summary: string
  redirects: number
  page: {
    title: string | null
    description: string | null
    h1: string | null
    canonical: string | null
  } & Partial<PageContent>
  counts: Record<SeoCheck['level'], number>
  checks: SeoCheck[]
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

function decodeText(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&[a-z]+;|&#\d+;/giu, ' ')
}

function schemaTypes(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 6 || !value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) schemaTypes(item, into, depth + 1)
    return
  }
  const record = value as Record<string, unknown>
  const type = record['@type']
  for (const name of Array.isArray(type) ? type : [type]) {
    if (typeof name === 'string' && name.length <= 80) into.add(name)
  }
  if (record['@graph']) schemaTypes(record['@graph'], into, depth + 1)
}

export function readPageContent(html: string, pageUrl: string): PageContent {
  const page = new URL(pageUrl)
  const source = stripInert(html)
  const bodyStart = source.search(/<body\b/iu)
  const body = bodyStart >= 0 ? source.slice(bodyStart) : source

  const htmlTag = source.match(/<html\b[^>]*>/iu)?.[0]
  const lang = htmlTag
    ? (parseAttributes(htmlTag).get('lang')?.trim() ?? null)
    : null

  let viewport = false
  let hreflang = 0
  for (const match of source.matchAll(/<(meta|link)\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    if (match[1]?.toLowerCase() === 'meta') {
      if (attributes.get('name')?.trim().toLowerCase() === 'viewport') {
        viewport = true
      }
      continue
    }
    const rel = attributes.get('rel')?.toLowerCase().split(/\s+/u) ?? []
    if (rel.includes('alternate') && attributes.has('hreflang')) hreflang += 1
  }

  const text = decodeText(
    body
      .replace(/<style\b[\s\S]*?<\/style\s*>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0

  let images = 0
  let imagesWithoutAlt = 0
  const imagesWithoutAltSample: string[] = []
  for (const match of body.matchAll(/<img\b[^>]*>/giu)) {
    images += 1
    const attributes = parseAttributes(match[0])
    if (attributes.has('alt')) continue
    imagesWithoutAlt += 1
    const src = attributes.get('src') ?? attributes.get('data-src')
    if (src && imagesWithoutAltSample.length < MAX_LISTED) {
      imagesWithoutAltSample.push(src.slice(0, 200))
    }
  }

  const links = { internal: 0, external: 0, nofollow: 0 }
  for (const match of body.matchAll(/<a\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0])
    const href = attributes.get('href')?.trim()
    if (!href || /^(?:#|javascript:|mailto:|tel:)/iu.test(href)) continue
    let target: URL
    try {
      target = new URL(href, page)
    } catch {
      continue
    }
    if (!/^https?:$/u.test(target.protocol)) continue
    const sameSite =
      target.hostname.replace(/^www\./u, '') ===
      page.hostname.replace(/^www\./u, '')
    if (sameSite) links.internal += 1
    else links.external += 1
    if (
      attributes.get('rel')?.toLowerCase().split(/\s+/u).includes('nofollow')
    ) {
      links.nofollow += 1
    }
  }

  // JSON-LD lives in script tags, which stripInert removes, so read the
  // original HTML here.
  const types = new Set<string>()
  let invalid = 0
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/giu,
  )) {
    try {
      schemaTypes(JSON.parse(match[1] ?? ''), types)
    } catch {
      invalid += 1
    }
  }

  const head = parseHead(html, page)
  const tag = (key: string) =>
    head.tags.some((item) => item.key === key && item.value.trim())

  return {
    lang,
    viewport,
    h1Count: [...body.matchAll(/<h1\b/giu)].length,
    h2Count: [...body.matchAll(/<h2\b/giu)].length,
    words,
    images,
    imagesWithoutAlt,
    imagesWithoutAltSample,
    links,
    hreflang,
    structuredData: { types: [...types].sort(), invalid },
    openGraph: {
      title: tag('og:title'),
      description: tag('og:description'),
      image: tag('og:image'),
    },
  }
}

export function contentChecks(
  signals: PageSignals,
  content: PageContent,
  finalUrl: string,
): SeoCheck[] {
  const checks: SeoCheck[] = []
  const add = (
    group: SeoCheck['group'],
    id: string,
    level: SeoCheck['level'],
    message: string,
    fix?: string,
  ) => checks.push({ group, id, level, message, ...(fix ? { fix } : {}) })

  const title = signals.title.value
  if (title === null) {
    add(
      'content',
      'title',
      'fail',
      'The page has no title tag. Google will write its own title link from the headings and links.',
      'Add a short, accurate title that names the page.',
    )
  } else if (!title.trim()) {
    add(
      'content',
      'title',
      'fail',
      'The title tag is empty. Google treats it as missing.',
      'Fill in the title. An empty tag usually comes from a template or SEO plugin field.',
    )
  } else if (title.length > TITLE_CHARACTERS) {
    add(
      'content',
      'title',
      'warn',
      `The title is ${title.length} characters. Google cuts titles by width, and past about ${TITLE_CHARACTERS} characters most are cut or rewritten.`,
      'Put the words people search for first, then measure it in the title checker.',
    )
  } else {
    add(
      'content',
      'title',
      'pass',
      `The title is ${title.length} characters: "${title}".`,
    )
  }
  if (signals.title.count > 1) {
    add(
      'content',
      'title-count',
      'warn',
      `The head has ${signals.title.count} title tags. Google uses one, and may not pick the one you meant.`,
      'Keep one title tag.',
    )
  }

  const description = signals.description.value
  if (description === null) {
    add(
      'content',
      'description',
      'warn',
      'The page has no meta description. Google builds the snippet from page text.',
      'Write one for pages that matter. It does not change rankings, but it can change who clicks.',
    )
  } else if (!description.trim()) {
    add(
      'content',
      'description',
      'warn',
      'The meta description is empty. Google treats it as missing.',
      'Fill in the description field in the template or SEO plugin.',
    )
  } else if (description.length > DESCRIPTION_CHARACTERS) {
    add(
      'content',
      'description',
      'info',
      `The meta description is ${description.length} characters. Google usually shows about ${DESCRIPTION_CHARACTERS} on desktop and less on mobile.`,
      'Say the useful part first.',
    )
  } else {
    add(
      'content',
      'description',
      'pass',
      `The meta description is ${description.length} characters.`,
    )
  }

  if (content.h1Count === 0) {
    add(
      'content',
      'h1',
      'warn',
      'The HTML has no H1. Pages without a clear main heading are more likely to have their title rewritten.',
      'Add one H1 that names the page and matches the title.',
    )
  } else if (content.h1Count > 1) {
    add(
      'content',
      'h1',
      'info',
      `The page has ${content.h1Count} H1 headings. Google says several are fine, but one clear main heading is easier to read.`,
    )
  } else {
    add('content', 'h1', 'pass', `One H1: "${signals.h1 ?? ''}".`)
  }

  if (content.words < THIN_WORDS) {
    add(
      'content',
      'words',
      'info',
      `The HTML has about ${content.words} words of text. If the page builds its text with JavaScript, Google sees it only after rendering, and many AI crawlers never run JavaScript.`,
      'Check that the main text is in the HTML the server sends.',
    )
  } else {
    add(
      'content',
      'words',
      'pass',
      `The HTML has about ${content.words} words of text.`,
    )
  }

  if (content.imagesWithoutAlt) {
    const listed = content.imagesWithoutAltSample
    add(
      'content',
      'image-alt',
      'warn',
      `${content.imagesWithoutAlt} of ${content.images} images have no alt attribute${listed.length ? `, such as ${listed.join(', ')}` : ''}.`,
      'Describe each image that carries meaning. Decorative images can have alt="".',
    )
  } else if (content.images) {
    add(
      'content',
      'image-alt',
      'pass',
      `All ${content.images} images have an alt attribute.`,
    )
  }

  add(
    'content',
    'links',
    content.links.internal ? 'info' : 'warn',
    `The page links to ${content.links.internal} pages on the same site and ${content.links.external} elsewhere${content.links.nofollow ? `, ${content.links.nofollow} of them nofollow` : ''}.`,
    content.links.internal
      ? undefined
      : 'Link to related pages on your site so Google and visitors can find them.',
  )

  const canonical = signals.canonical.href ?? signals.canonical.header
  if (signals.canonical.count > 1) {
    add(
      'markup',
      'canonical-count',
      'warn',
      `The head has ${signals.canonical.count} canonical links. When they disagree, Google ignores them all.`,
      'Keep one canonical link.',
    )
  }
  if (!canonical) {
    add(
      'markup',
      'canonical',
      'info',
      'The page has no canonical link. Google picks the main URL itself, which is usually fine for a page with one address.',
    )
  } else if (sameTarget(canonical, finalUrl)) {
    add(
      'markup',
      'canonical',
      'pass',
      'The canonical points to the page itself.',
    )
  }

  if (!content.lang) {
    add(
      'markup',
      'lang',
      'info',
      'The html tag has no lang attribute. Google detects the language from the text, but screen readers and translation tools use it.',
      'Add lang="en" or your language to the html tag.',
    )
  } else {
    add('markup', 'lang', 'pass', `The page language is ${content.lang}.`)
  }
  if (!content.viewport) {
    add(
      'markup',
      'viewport',
      'warn',
      'The page has no viewport meta tag, so phones show it as a shrunken desktop page. Google indexes the mobile version.',
      'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    )
  } else {
    add(
      'markup',
      'viewport',
      'pass',
      'The page has a viewport meta tag for phones.',
    )
  }

  const { types, invalid } = content.structuredData
  if (invalid) {
    add(
      'markup',
      'schema-invalid',
      'fail',
      `${invalid} JSON-LD block${invalid === 1 ? ' is' : 's are'} not valid JSON, so Google ignores ${invalid === 1 ? 'it' : 'them'}.`,
      'Run the block through the schema markup validator.',
    )
  }
  if (types.length) {
    add(
      'markup',
      'schema',
      'pass',
      `Structured data in JSON-LD: ${types.join(', ')}.`,
    )
  } else if (!invalid) {
    add(
      'markup',
      'schema',
      'info',
      'No JSON-LD structured data was found in the HTML. It is optional, and only some types can show as rich results.',
    )
  }

  const og = content.openGraph
  const missing = [
    og.title ? '' : 'og:title',
    og.description ? '' : 'og:description',
    og.image ? '' : 'og:image',
  ].filter(Boolean)
  if (missing.length) {
    add(
      'markup',
      'open-graph',
      og.image ? 'info' : 'warn',
      `Open Graph tags missing: ${missing.join(', ')}. Links shared on social sites and in chat apps ${og.image ? 'fall back to other text' : 'show no image'}.`,
      'Add the missing tags, then check the share preview in the Open Graph checker.',
    )
  } else {
    add(
      'markup',
      'open-graph',
      'pass',
      'Open Graph title, description and image are set.',
    )
  }
  if (content.hreflang) {
    add(
      'markup',
      'hreflang',
      'info',
      `The page lists ${content.hreflang} hreflang alternates. Each one must link back to this page for Google to use them.`,
    )
  }
  return checks
}

export async function checkSeo(
  pageUrl: URL,
  requestedUrl: string,
  fetcher: SitemapFetcher = fetch,
  now = new Date(),
): Promise<SeoCheckerResult> {
  const trace = await tracePage(pageUrl, fetcher, {
    userAgent: USER_AGENT,
    readBody: true,
  })
  const signals = readPageSignals(
    trace.html,
    trace.finalUrl,
    trace.headers,
    now,
  )
  const robots =
    trace.outcome === 'done'
      ? await robotsFor(
          trace.hops.map((hop) => hop.url),
          fetcher,
        )
      : new Map()
  const access = noindexChecks(
    trace,
    signals,
    robots,
    platformOf(trace, signals),
  )
  const checks: SeoCheck[] = access.checks
    // The noindex checker's note on JavaScript is repeated by the word
    // count check here.
    .filter((check) => check.id !== 'javascript')
    .map((check) => ({ ...check, group: 'access' as const }))
  const content = trace.html
    ? readPageContent(trace.html, trace.finalUrl)
    : null
  if (content) checks.push(...contentChecks(signals, content, trace.finalUrl))
  else if (trace.outcome === 'done' && trace.finalStatus === 200) {
    checks.push({
      group: 'content',
      id: 'not-html',
      level: 'info',
      message: `The URL returned ${trace.contentType ?? 'something other than HTML'}, so there is no page to read.`,
    })
  }

  const counts = { fail: 0, warn: 0, info: 0, pass: 0 }
  for (const check of checks) counts[check.level] += 1
  const reachable = access.verdict === 'indexable'
  return {
    schema: 1,
    checkedAt: now.toISOString(),
    requestedUrl,
    finalUrl: trace.finalUrl,
    status: trace.finalStatus,
    verdict: access.verdict,
    headline: reachable
      ? counts.fail
        ? `${counts.fail} ${counts.fail === 1 ? 'problem' : 'problems'} to fix`
        : counts.warn
          ? `${counts.warn} ${counts.warn === 1 ? 'thing' : 'things'} to check`
          : 'No problems found'
      : access.headline,
    summary: reachable
      ? `Google may index this page. ${counts.pass} checks passed, ${counts.warn} need a look and ${counts.fail} need a fix.`
      : trace.finalStatus === 404 || trace.finalStatus === 410
        ? 'Google drops pages that return this status, so the page itself was not checked. Fix the URL or redirect it first.'
        : access.summary,
    redirects: trace.redirects,
    page: {
      title: signals.title.value,
      description: signals.description.value,
      h1: signals.h1,
      canonical: signals.canonical.href ?? signals.canonical.header,
      ...(content ?? {}),
    },
    counts,
    checks,
  }
}

export async function handleSeoCheck(
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
    const pageUrl = parsePublicUrl(requestedUrl)
    return jsonResponse(
      await checkSeo(pageUrl, String(requestedUrl).trim(), fetcher),
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
