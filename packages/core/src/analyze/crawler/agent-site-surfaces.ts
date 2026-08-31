import type { publicHttpFetch } from '../../fetch/http-client.js'
import { fetchText, safeError } from './agent-discovery-http.js'
import type {
  AgentPublicPageObservation,
  AgentSiteSurfaceObservation,
} from './agent-discovery-types.js'

const SITE_SURFACE_MAX_BODY_BYTES = 250_000
const MISSING_PAGE_PATH = '/__seo_agent_readiness_missing__'
const TRUST_ANCHORS = [
  { id: 'about' as const, path: '/about' },
  { id: 'contact' as const, path: '/contact' },
  { id: 'privacy' as const, path: '/privacy' },
]

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function wordCount(value: string): number {
  const text = normalizedText(value)
  return text ? text.split(' ').length : 0
}

function headingSkip(levels: number[]): number {
  let maximum = 0
  for (let index = 1; index < levels.length; index += 1) {
    maximum = Math.max(maximum, (levels[index] ?? 0) - (levels[index - 1] ?? 0))
  }
  return maximum
}

function decodeHtmlText(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu,
    (entity, decimal: string, hexadecimal: string, name: string) => {
      const codepoint = decimal
        ? Number.parseInt(decimal, 10)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined
      if (codepoint !== undefined) {
        try {
          return String.fromCodePoint(codepoint)
        } catch {
          return entity
        }
      }
      return named[name?.toLowerCase()] ?? entity
    },
  )
}

function htmlObservation(value: string, base: string) {
  const visible = value
    .replace(
      /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      ' ',
    )
    .replace(/<!--[\s\S]*?-->/gu, ' ')
  const headingLevels = [...visible.matchAll(/<h([1-6])\b[^>]*>/giu)].map(
    (match) => Number(match[1]),
  )
  const links = [
    ...visible.matchAll(
      /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu,
    ),
  ]
    .flatMap((match) => {
      const href = decodeHtmlText(match[1] ?? match[2] ?? match[3] ?? '')
      try {
        return [new URL(href, base).toString()]
      } catch {
        return []
      }
    })
    .sort()
  const text = decodeHtmlText(visible.replace(/<[^>]*>/gu, ' '))
  return { text, headingLevels, links }
}

function markdownLinks(value: string, base: string): string[] {
  const links: string[] = []
  for (const match of value.matchAll(
    /\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu,
  )) {
    try {
      links.push(new URL(match[1] ?? '', base).toString())
    } catch {
      // Invalid links are handled by the llms.txt and Markdown quality checks.
    }
  }
  return [...new Set(links)].sort()
}

function responseObservation(input: {
  requestedUrl: string
  response: Response
  body: string
}): AgentPublicPageObservation {
  const contentType = input.response.headers.get('content-type') ?? undefined
  const isHtml = /\b(?:text\/html|application\/xhtml\+xml)\b/iu.test(
    contentType ?? '',
  )
  const isMarkdown = /\btext\/markdown\b/iu.test(contentType ?? '')
  let text = input.body
  let headingLevels: number[] = []
  let links: string[] = []
  if (isHtml) {
    const observation = htmlObservation(
      input.body,
      input.response.url || input.requestedUrl,
    )
    text = observation.text
    headingLevels = observation.headingLevels
    links = observation.links
  } else if (isMarkdown) {
    headingLevels = [...input.body.matchAll(/^ {0,3}(#{1,6})\s+\S/gmu)].map(
      (match) => match[1]?.length ?? 0,
    )
    links = markdownLinks(input.body, input.response.url || input.requestedUrl)
  }
  const normalized = normalizedText(text)
  return {
    requestedUrl: input.requestedUrl,
    finalUrl: input.response.url || input.requestedUrl,
    status: input.response.status,
    contentType,
    characters: normalized.length,
    wordCount: wordCount(normalized),
    h1Count: headingLevels.filter((level) => level === 1).length,
    headingLevels,
    maximumHeadingSkip: headingSkip(headingLevels),
    links: [...new Set(links)].slice(0, 50),
  }
}

async function inspectPage(input: {
  url: string
  accept: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
  redirect?: 'follow' | 'manual'
}): Promise<AgentPublicPageObservation> {
  try {
    const result = await fetchText({
      url: input.url,
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
      accept: input.accept,
      redirect: input.redirect,
      maxBytes: SITE_SURFACE_MAX_BODY_BYTES,
      returnOnBodyLimit: true,
    })
    if (result.bodyLimitExceeded) {
      return {
        requestedUrl: input.url,
        finalUrl: result.response.url || input.url,
        status: result.response.status,
        contentType: result.response.headers.get('content-type') ?? undefined,
        bodyLimitExceeded: true,
        bodyLimitBytes: result.bodyLimitBytes,
      }
    }
    return responseObservation({
      requestedUrl: input.url,
      response: result.response,
      body: result.body,
    })
  } catch (error) {
    return { requestedUrl: input.url, error: safeError(error) }
  }
}

export async function inspectAgentSiteSurfaces(input: {
  startUrl: string
  origin: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<AgentSiteSurfaceObservation> {
  const missingUrl = new URL(MISSING_PAGE_PATH, input.origin).toString()
  const [startPage, missingHtml, missingMarkdown, ...trustPages] =
    await Promise.all([
      inspectPage({
        ...input,
        url: input.startUrl,
        accept: 'text/html,application/xhtml+xml;q=0.9',
      }),
      inspectPage({
        ...input,
        url: missingUrl,
        accept: 'text/html,application/xhtml+xml;q=0.9',
        redirect: 'manual',
      }),
      inspectPage({
        ...input,
        url: missingUrl,
        accept: 'text/markdown,text/plain;q=0.9',
        redirect: 'manual',
      }),
      ...TRUST_ANCHORS.map(({ path }) =>
        inspectPage({
          ...input,
          url: new URL(path, input.origin).toString(),
          accept: 'text/html,application/xhtml+xml;q=0.9,text/markdown;q=0.8',
        }),
      ),
    ])

  return {
    rawStartPage: startPage,
    notFound: {
      path: MISSING_PAGE_PATH,
      html: missingHtml,
      markdown: missingMarkdown,
    },
    trustAnchors: TRUST_ANCHORS.map((anchor, index) => ({
      id: anchor.id,
      ...(trustPages[index] ?? {
        requestedUrl: new URL(anchor.path, input.origin).toString(),
        error: 'The trust-page observation was not returned.',
      }),
    })),
    limits: {
      bodyBytesPerResponse: SITE_SURFACE_MAX_BODY_BYTES,
      trustAnchorPages: TRUST_ANCHORS.length,
    },
  }
}
