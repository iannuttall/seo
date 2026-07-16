import { createHash } from 'node:crypto'
import PQueue from 'p-queue'
import type { publicHttpFetch } from '../../fetch/http-client.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type {
  AgentRepresentationResponse,
  AgentSkillObservation,
  CrawlAgentDiscovery,
  LlmsTxtLinkObservation,
  MarkdownAlternateObservation,
  MarkdownQualityObservation,
} from './agent-discovery-types.js'

export type {
  AgentDiscoveryDataStatus,
  AgentReadinessProfile,
  AgentRepresentationResponse,
  AgentSkillObservation,
  CrawlAgentDiscovery,
  LlmsTxtLinkObservation,
  MarkdownAlternateObservation,
  MarkdownQualityObservation,
} from './agent-discovery-types.js'

const MAX_BODY_BYTES = 2_000_000
const MAX_LLMS_LINKS = 100
const MAX_CURATED_LLMS_BYTES = 100_000
const MAX_SKILLS = 25

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined
  const target = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === target,
  )?.[1]
}

function linkEntries(value: string | undefined, base: string) {
  if (!value) return []
  return value
    .split(/,(?=\s*<)/u)
    .map((entry) => {
      const match = entry.match(/^\s*<([^>]+)>\s*(.*)$/u)
      if (!match?.[1]) return undefined
      try {
        const url = new URL(match[1], base).toString()
        const parameters = match[2] ?? ''
        const rel = parameters.match(/(?:^|;)\s*rel=(?:"([^"]+)"|([^;\s]+))/iu)
        const type = parameters.match(
          /(?:^|;)\s*type=(?:"([^"]+)"|([^;\s]+))/iu,
        )
        return {
          url,
          rel: (rel?.[1] ?? rel?.[2] ?? '').toLowerCase().split(/\s+/u),
          type: (type?.[1] ?? type?.[2] ?? '').toLowerCase(),
        }
      } catch {
        return undefined
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function normalizedDocumentUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/u, '')
  return url.toString()
}

function sameDocument(left?: string, right?: string): boolean | null {
  if (!left || !right) return null
  try {
    return normalizedDocumentUrl(left) === normalizedDocumentUrl(right)
  } catch {
    return false
  }
}

function bodyWordCount(value: string): number {
  return value
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/[#>*_`[\]()|:-]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean).length
}

function repeatedProseLines(markdown: string): number {
  const counts = new Map<string, number>()
  let inFrontmatter = false
  let fence: '```' | '~~~' | undefined

  for (const [index, rawLine] of markdown.split(/\r?\n/u).entries()) {
    const line = rawLine.trim()

    if (index === 0 && line === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      continue
    }

    if (!fence && (line.startsWith('```') || line.startsWith('~~~'))) {
      fence = line.startsWith('```') ? '```' : '~~~'
      continue
    }
    if (fence) {
      if (line.startsWith(fence)) fence = undefined
      continue
    }

    if (
      line.length < 40 ||
      /^(?:#{1,6}\s|[-+*]\s|\d+[.)]\s|>|\||`|\]\()/u.test(line)
    ) {
      continue
    }

    counts.set(line, (counts.get(line) ?? 0) + 1)
  }

  return [...counts.values()].reduce(
    (duplicates, count) => duplicates + Math.max(0, count - 1),
    0,
  )
}

function responseIsNoindex(response: Response, body: string): boolean {
  if (
    (response.headers.get('x-robots-tag') ?? '')
      .toLowerCase()
      .includes('noindex')
  ) {
    return true
  }
  return [...body.matchAll(/<meta\s+[^>]*>/giu)].some((match) => {
    const tag = match[0]
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/iu)?.[1]
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/iu)?.[1]
    return (
      name?.toLowerCase() === 'robots' && /\bnoindex\b/iu.test(content ?? '')
    )
  })
}

function markdownQuality(
  markdown: string,
  page: CrawlPageSnapshot,
): MarkdownQualityObservation {
  const intro = page.contentSample?.replace(/\s+/gu, ' ').trim()
  const introProbe = intro?.split(' ').slice(0, 10).join(' ')
  const normalizedMarkdown = markdown.replace(/\s+/gu, ' ')
  const codeFences = markdown.match(/^```/gmu)?.length ?? 0
  const wordCount = bodyWordCount(markdown)
  const sourceWordCount = page.wordCount ?? 0
  return {
    frontmatterTitle: /^---[\s\S]*?^title:\s*.+$/mu.test(markdown),
    h1Count: markdown.match(/^#\s+\S.+$/gmu)?.length ?? 0,
    codeFenceBalanced: codeFences % 2 === 0,
    tableRows: markdown.match(/^\s*\|.*\|\s*$/gmu)?.length ?? 0,
    links: markdown.match(/\[[^\]]+\]\([^)]+\)/gu)?.length ?? 0,
    wordCount,
    rawHtmlTags:
      markdown.match(/<(?:div|span|section|article|nav|button)\b/giu)?.length ??
      0,
    rawSvgTags: markdown.match(/<svg\b/giu)?.length ?? 0,
    rawScriptTags: markdown.match(/<script\b/giu)?.length ?? 0,
    rawStyleTags: markdown.match(/<style\b/giu)?.length ?? 0,
    suspiciousConcatenations:
      markdown.match(/\b[a-z]{4,}[A-Z][A-Za-z]{3,}\b/gu)?.length ?? 0,
    repeatedLines: repeatedProseLines(markdown),
    sourceWordCount,
    wordRetentionRatio:
      sourceWordCount > 0
        ? Math.round((wordCount / sourceWordCount) * 1_000) / 1_000
        : null,
    introductoryCopyRetained: introProbe
      ? normalizedMarkdown.includes(introProbe)
      : null,
    navigationOnly: bodyWordCount(markdown) < 25,
  }
}

function combinedSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, timeoutMs)
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    },
  }
}

async function readBoundedText(
  response: Awaited<ReturnType<typeof publicHttpFetch>>,
): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_BODY_BYTES) {
        throw new Error(`Response exceeds ${MAX_BODY_BYTES} bytes.`)
      }
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function fetchRepresentation(input: {
  url: string
  accept: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<{ observation: AgentRepresentationResponse; body?: string }> {
  const controller = combinedSignal(input.timeoutMs, input.signal)
  try {
    const response = await input.fetch(input.url, {
      profile: 'bot',
      redirect: 'follow',
      headers: { accept: input.accept },
      signal: controller.signal,
    })
    const body = await readBoundedText(response)
    const link = linkEntries(
      response.headers.get('link') ?? undefined,
      input.url,
    )
    const tokens = Number(response.headers.get('x-markdown-tokens'))
    return {
      observation: {
        requestedUrl: input.url,
        finalUrl: response.url || input.url,
        status: response.status,
        contentType: response.headers.get('content-type') ?? undefined,
        bytes: Buffer.byteLength(body),
        sha256: sha256(body),
        canonicalUrl: link.find((entry) => entry.rel.includes('canonical'))
          ?.url,
        alternateUrl: link.find(
          (entry) =>
            entry.rel.includes('alternate') && entry.type === 'text/markdown',
        )?.url,
        varyAccept: (response.headers.get('vary') ?? '')
          .split(',')
          .some((value) => value.trim().toLowerCase() === 'accept'),
        ...(Number.isInteger(tokens) && tokens >= 0
          ? { markdownTokens: tokens }
          : {}),
        contentSignal: response.headers.get('content-signal') ?? undefined,
      },
      body,
    }
  } catch (error) {
    return {
      observation: {
        requestedUrl: input.url,
        varyAccept: false,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  } finally {
    controller.cleanup()
  }
}

async function inspectMarkdownPage(input: {
  page: CrawlPageSnapshot
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<MarkdownAlternateObservation> {
  const advertisedUrls = [
    ...new Set(input.page.markdownAlternates ?? []),
  ].sort()
  const httpAlternateUrls = linkEntries(
    headerValue(input.page.responseHeaders, 'link'),
    input.page.finalUrl,
  )
    .filter(
      (entry) =>
        entry.rel.includes('alternate') && entry.type === 'text/markdown',
    )
    .map((entry) => entry.url)
    .sort()
  const observation: MarkdownAlternateObservation = {
    htmlUrl: input.page.finalUrl,
    advertisedUrls,
    htmlAlternateUnique: advertisedUrls.length === 1,
    httpAlternateUrls,
    explicitMatchesNegotiated: null,
    repeatedHashStable: null,
    markdownCanonicalMatchesHtml: null,
  }
  const explicitUrl =
    advertisedUrls.length === 1 ? advertisedUrls[0] : undefined
  const [explicit, negotiated, repeated] = await Promise.all([
    explicitUrl
      ? fetchRepresentation({
          url: explicitUrl,
          accept: 'text/markdown',
          timeoutMs: input.timeoutMs,
          fetch: input.fetch,
          signal: input.signal,
        })
      : Promise.resolve(undefined),
    fetchRepresentation({
      url: input.page.finalUrl,
      accept: 'text/markdown',
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
    }),
    fetchRepresentation({
      url: explicitUrl ?? input.page.finalUrl,
      accept: 'text/markdown',
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
    }),
  ])
  if (explicit) observation.explicit = explicit.observation
  observation.negotiated = negotiated.observation
  observation.repeated = repeated.observation
  observation.explicitMatchesNegotiated =
    explicit?.observation.sha256 && negotiated.observation.sha256
      ? explicit.observation.sha256 === negotiated.observation.sha256
      : null
  const primary = explicit ?? negotiated
  observation.repeatedHashStable =
    primary.observation.sha256 && repeated.observation.sha256
      ? primary.observation.sha256 === repeated.observation.sha256
      : null
  observation.markdownCanonicalMatchesHtml = sameDocument(
    primary.observation.canonicalUrl,
    input.page.finalUrl,
  )
  if (primary.body) {
    observation.quality = markdownQuality(primary.body, input.page)
  }
  return observation
}

async function fetchText(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
  redirect?: 'follow' | 'manual'
  accept?: string
}) {
  const controller = combinedSignal(input.timeoutMs, input.signal)
  try {
    const response = await input.fetch(input.url, {
      profile: 'bot',
      redirect: input.redirect ?? 'follow',
      headers: input.accept ? { accept: input.accept } : undefined,
      signal: controller.signal,
    })
    return { response, body: await readBoundedText(response) }
  } finally {
    controller.cleanup()
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function inspectAgentSkills(input: {
  origin: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<CrawlAgentDiscovery['agentSkills']> {
  const indexUrl = new URL(
    '/.well-known/agent-skills/index.json',
    input.origin,
  ).toString()
  try {
    const { response, body } = await fetchText({
      url: indexUrl,
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
      accept: 'application/json',
    })
    const contentType = response.headers.get('content-type') ?? undefined
    const cors =
      response.headers.get('access-control-allow-origin') ?? undefined
    if (response.status < 200 || response.status >= 300) {
      return {
        indexUrl,
        status: response.status,
        contentType,
        validIndex: false,
        skills: [],
      }
    }
    const parsed = JSON.parse(body) as {
      $schema?: unknown
      skills?: Array<Record<string, unknown>>
    }
    const entries = Array.isArray(parsed.skills)
      ? parsed.skills.slice(0, MAX_SKILLS)
      : []
    const skills = await Promise.all(
      entries.map(async (entry): Promise<AgentSkillObservation> => {
        const name = typeof entry.name === 'string' ? entry.name : undefined
        const declaredDigest =
          typeof entry.digest === 'string' ? entry.digest : undefined
        const relativeUrl =
          typeof entry.url === 'string' ? entry.url : undefined
        if (!relativeUrl) {
          return {
            name,
            declaredDigest,
            digestMatches: null,
            frontmatterValid: null,
            sameOrigin: false,
            error: 'Skill URL is missing.',
          }
        }
        const url = new URL(relativeUrl, indexUrl).toString()
        const sameOrigin = new URL(url).origin === new URL(input.origin).origin
        if (!sameOrigin) {
          return {
            name,
            url,
            declaredDigest,
            digestMatches: null,
            frontmatterValid: null,
            sameOrigin,
            error: 'Skill URL is off origin.',
          }
        }
        try {
          const skill = await fetchText({
            url,
            timeoutMs: input.timeoutMs,
            fetch: input.fetch,
            signal: input.signal,
            accept: 'text/markdown,text/plain;q=0.9',
          })
          const observedDigest = `sha256:${sha256(skill.body)}`
          const frontmatterValid =
            /^---\s*\n[\s\S]*?^name:\s*\S.+$[\s\S]*?^description:\s*\S.+$[\s\S]*?^---\s*$/mu.test(
              skill.body,
            )
          return {
            name,
            url,
            status: skill.response.status,
            contentType:
              skill.response.headers.get('content-type') ?? undefined,
            cors:
              skill.response.headers.get('access-control-allow-origin') ??
              undefined,
            declaredDigest,
            observedDigest,
            digestMatches: declaredDigest
              ? declaredDigest === observedDigest
              : null,
            frontmatterValid,
            sameOrigin,
          }
        } catch (error) {
          return {
            name,
            url,
            declaredDigest,
            digestMatches: null,
            frontmatterValid: null,
            sameOrigin,
            error: safeError(error),
          }
        }
      }),
    )
    return {
      indexUrl,
      status: response.status,
      contentType,
      cors,
      validIndex:
        typeof parsed.$schema === 'string' && Array.isArray(parsed.skills),
      skills,
    }
  } catch (error) {
    return {
      indexUrl,
      validIndex: false,
      skills: [],
      error: safeError(error),
    }
  }
}

function markdownLinks(value: string, base: string) {
  const links: Array<{ label: string; url: string }> = []
  const invalidLinks: string[] = []
  for (const match of value.matchAll(
    /\[([^\u005d]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu,
  )) {
    if (!match[1] || !match[2]) continue
    try {
      links.push({ label: match[1], url: new URL(match[2], base).toString() })
    } catch {
      invalidLinks.push(match[2])
    }
  }
  return { links, invalidLinks }
}

async function inspectLlmsTxt(input: {
  origin: string
  pages: CrawlPageSnapshot[]
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<CrawlAgentDiscovery['llmsTxt']> {
  const url = new URL('/llms.txt', input.origin).toString()
  try {
    const [first, second] = await Promise.all([
      fetchText({
        url,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
        accept: 'text/plain,text/markdown;q=0.9',
      }),
      fetchText({
        url,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
        accept: 'text/plain,text/markdown;q=0.9',
      }),
    ])
    const exists = first.response.status >= 200 && first.response.status < 300
    const parsed = markdownLinks(first.body, url)
    const links = parsed.links.slice(0, MAX_LLMS_LINKS)
    const linkLimitReached = parsed.links.length > links.length
    const counts = new Map<string, number>()
    for (const link of links)
      counts.set(link.url, (counts.get(link.url) ?? 0) + 1)
    const duplicateLinks = [...counts]
      .filter(([, count]) => count > 1)
      .map(([link]) => link)
      .sort()
    const crawlRoutes = new Set(
      input.pages.map((page) => normalizedDocumentUrl(page.finalUrl)),
    )
    const linkObservations = await Promise.all(
      links.map(async (link): Promise<LlmsTxtLinkObservation> => {
        const sameOrigin =
          new URL(link.url).origin === new URL(input.origin).origin
        try {
          const target = await fetchText({
            url: link.url,
            timeoutMs: input.timeoutMs,
            fetch: input.fetch,
            signal: input.signal,
          })
          const indexableTarget =
            sameOrigin &&
            target.response.status >= 200 &&
            target.response.status < 300
              ? !responseIsNoindex(target.response, target.body)
              : undefined
          const finalUrl = target.response.url || undefined
          return {
            ...link,
            sameOrigin,
            status: target.response.status,
            finalUrl,
            redirected: target.response.redirected,
            ...(indexableTarget === undefined ? {} : { indexableTarget }),
          }
        } catch (error) {
          return {
            ...link,
            sameOrigin,
            redirected: false,
            error: safeError(error),
          }
        }
      }),
    )
    const linkedCrawlRoutes = new Set(
      linkObservations
        .filter(
          (link) =>
            link.sameOrigin &&
            !new URL(link.url).pathname.startsWith('/.well-known/') &&
            !new URL(link.url).pathname.endsWith('.md'),
        )
        .map((link) => normalizedDocumentUrl(link.url)),
    )
    return {
      url,
      exists,
      status: first.response.status,
      contentType: first.response.headers.get('content-type') ?? undefined,
      bytes: Buffer.byteLength(first.body),
      sha256: sha256(first.body),
      repeatedHashStable: sha256(first.body) === sha256(second.body),
      headingCount: first.body.match(/^#{1,2}\s+\S/gmu)?.length ?? 0,
      totalParsedLinks: parsed.links.length,
      linkLimitReached,
      links: linkObservations,
      invalidLinks: parsed.invalidLinks.sort(),
      duplicateLinks,
      offSiteLinks: linkObservations
        .filter((link) => !link.sameOrigin)
        .map((link) => link.url)
        .sort(),
      redirectedLinks: linkObservations
        .filter((link) => link.redirected)
        .map((link) => link.url)
        .sort(),
      nonIndexableLinks: linkObservations
        .filter((link) => link.indexableTarget === false)
        .map((link) => link.url)
        .sort(),
      missingCrawlRoutes: [...linkedCrawlRoutes]
        .filter((route) => !crawlRoutes.has(route))
        .sort(),
      oversized: Buffer.byteLength(first.body) > MAX_CURATED_LLMS_BYTES,
    }
  } catch (error) {
    return {
      url,
      exists: false,
      repeatedHashStable: null,
      headingCount: 0,
      totalParsedLinks: 0,
      linkLimitReached: false,
      links: [],
      invalidLinks: [],
      duplicateLinks: [],
      offSiteLinks: [],
      redirectedLinks: [],
      nonIndexableLinks: [],
      missingCrawlRoutes: [],
      oversized: false,
      error: safeError(error),
    }
  }
}

async function inspectRouteManifest(input: {
  origin: string
  pages: CrawlPageSnapshot[]
  observations: MarkdownAlternateObservation[]
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<CrawlAgentDiscovery['routeManifest']> {
  const url = new URL('/agent-routes.json', input.origin).toString()
  try {
    const result = await fetchText({
      url,
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
      accept: 'application/json',
    })
    const parsed = JSON.parse(result.body) as {
      pages?: Array<{ htmlPath?: unknown; markdownPath?: unknown }>
    }
    const declared = Array.isArray(parsed.pages) ? parsed.pages : []
    const declaredHtmlRoutes = declared
      .map((page) => page.htmlPath)
      .filter((path): path is string => typeof path === 'string')
      .sort()
    const declaredMarkdownRoutes = declared
      .map((page) => page.markdownPath)
      .filter((path): path is string => typeof path === 'string')
      .sort()
    const crawledHtmlRoutes = new Set(
      input.pages.map(
        (page) => new URL(page.finalUrl).pathname.replace(/\/$/u, '') || '/',
      ),
    )
    const observedMarkdownRoutes = new Set(
      input.observations.flatMap((page) =>
        page.advertisedUrls.map((value) => new URL(value).pathname),
      ),
    )
    return {
      url,
      status: result.response.status,
      valid: Array.isArray(parsed.pages),
      declaredHtmlRoutes,
      declaredMarkdownRoutes,
      missingHtmlRoutes: declaredHtmlRoutes
        .filter(
          (path) => !crawledHtmlRoutes.has(path.replace(/\/$/u, '') || '/'),
        )
        .sort(),
      missingMarkdownRoutes: declaredMarkdownRoutes
        .filter((path) => !observedMarkdownRoutes.has(path))
        .sort(),
      orphanMarkdownRoutes: [...observedMarkdownRoutes]
        .filter((path) => !declaredMarkdownRoutes.includes(path))
        .sort(),
    }
  } catch (error) {
    return {
      url,
      valid: false,
      declaredHtmlRoutes: [],
      declaredMarkdownRoutes: [],
      missingHtmlRoutes: [],
      missingMarkdownRoutes: [],
      orphanMarkdownRoutes: [],
      error: safeError(error),
    }
  }
}

async function inspectProtocolVariant(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}) {
  try {
    const result = await fetchText({
      url: input.url,
      timeoutMs: input.timeoutMs,
      fetch: input.fetch,
      signal: input.signal,
      redirect: 'manual',
    })
    return {
      status: result.response.status,
      location: result.response.headers.get('location') ?? undefined,
    }
  } catch (error) {
    return { error: safeError(error) }
  }
}

export async function collectAgentDiscovery(input: {
  startUrl: string
  pages: CrawlPageSnapshot[]
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
  concurrency?: number
}): Promise<CrawlAgentDiscovery> {
  const origin = new URL(input.startUrl).origin
  const pages = input.pages
    .filter(
      (page) =>
        page.status >= 200 &&
        page.status < 300 &&
        /^\s*(?:text\/html|application\/xhtml\+xml)\b/iu.test(
          page.contentType ?? '',
        ),
    )
    .sort((left, right) => left.finalUrl.localeCompare(right.finalUrl))
  const queue = new PQueue({ concurrency: input.concurrency ?? 4 })
  const observations = await Promise.all(
    pages.map((page) =>
      queue.add(() =>
        inspectMarkdownPage({
          page,
          timeoutMs: input.timeoutMs,
          fetch: input.fetch,
          signal: input.signal,
        }),
      ),
    ),
  )
  const [agentSkills, llmsTxt, routeManifest] = await Promise.all([
    inspectAgentSkills({ ...input, origin }),
    inspectLlmsTxt({ ...input, origin, pages }),
    inspectRouteManifest({ ...input, origin, pages, observations }),
  ])
  const qZero = await fetchRepresentation({
    url: input.startUrl,
    accept: 'text/markdown;q=0,text/html;q=1',
    timeoutMs: input.timeoutMs,
    fetch: input.fetch,
    signal: input.signal,
  })
  const start = new URL(input.startUrl)
  const httpUrl = new URL(start)
  httpUrl.protocol = 'http:'
  const wwwUrl = new URL(start)
  wwwUrl.hostname = start.hostname.startsWith('www.')
    ? start.hostname.slice(4)
    : `www.${start.hostname}`
  const [http, www] = await Promise.all([
    inspectProtocolVariant({ ...input, url: httpUrl.toString() }),
    inspectProtocolVariant({ ...input, url: wwwUrl.toString() }),
  ])
  const httpLocation = http.location
    ? new URL(http.location, httpUrl).toString()
    : undefined
  const wwwLocation = www.location
    ? new URL(www.location, wwwUrl).toString()
    : undefined
  const qZeroContentType = qZero.observation.contentType
  const advertisedPages = observations.filter(
    (observation) => observation.htmlAlternateUnique,
  ).length
  const evaluatedPages = observations.filter((observation) => {
    const representation = observation.explicit ?? observation.negotiated
    return (
      representation?.status !== undefined &&
      representation.status >= 200 &&
      representation.status < 300 &&
      /^\s*text\/markdown\b/iu.test(representation.contentType ?? '')
    )
  }).length
  const warnings = [
    ...(pages.length !== input.pages.length
      ? [
          `Agent representations were evaluated for ${pages.length} successful HTML pages from ${input.pages.length} retained documents.`,
        ]
      : []),
    ...(routeManifest.valid
      ? []
      : [
          'No valid public agent route manifest was available for orphan checks.',
        ]),
  ].sort()
  const htmlContentSignals = pages
    .map((page) => headerValue(page.responseHeaders, 'content-signal'))
    .filter((value): value is string => Boolean(value))
  const markdownContentSignals = observations
    .map(
      (observation) =>
        observation.explicit?.contentSignal ??
        observation.negotiated?.contentSignal,
    )
    .filter((value): value is string => Boolean(value))
  const contentSignalValues = [
    ...new Set([...htmlContentSignals, ...markdownContentSignals]),
  ].sort()
  return {
    profile: 'content',
    profileApplicability: {
      content: {
        status: 'evaluated',
        reason:
          'This site publishes documents, so access, representations, discovery, identity, and extraction quality were evaluated.',
      },
      api: {
        status: 'notApplicable',
        reason: 'No public API surface was selected for this content-site run.',
      },
      application: {
        status: 'notApplicable',
        reason:
          'A local MCP product does not make this website a public remote agent endpoint.',
      },
      commerce: {
        status: 'notApplicable',
        reason: 'No product checkout or transactional surface was selected.',
      },
    },
    dataStatus:
      pages.length === 0
        ? 'unavailable'
        : evaluatedPages === pages.length
          ? 'complete'
          : 'partial',
    markdownAlternates: {
      eligibleHtmlPages: pages.length,
      advertisedPages,
      evaluatedPages,
      exactByteMatches: observations.filter(
        (observation) => observation.explicitMatchesNegotiated,
      ).length,
      stableResponses: observations.filter(
        (observation) => observation.repeatedHashStable,
      ).length,
      pages: observations,
    },
    contentNegotiation: {
      qZeroHonoured:
        qZeroContentType !== undefined
          ? !/^\s*text\/markdown\b/iu.test(qZeroContentType)
          : null,
      qZeroStatus: qZero.observation.status,
      qZeroContentType,
      error: qZero.observation.error,
    },
    routeManifest,
    agentSkills,
    llmsTxt,
    contentSignals: {
      htmlValues: [...new Set(htmlContentSignals)].sort(),
      markdownValues: [...new Set(markdownContentSignals)].sort(),
      missingHtmlPages: pages.length - htmlContentSignals.length,
      missingMarkdownPages: observations.length - markdownContentSignals.length,
      consistent:
        pages.length > 0 && observations.length > 0
          ? contentSignalValues.length === 1 &&
            htmlContentSignals.length === pages.length &&
            markdownContentSignals.length === observations.length
          : null,
    },
    protocolVariants: {
      http: {
        url: httpUrl.toString(),
        status: http.status,
        location: httpLocation,
        permanentRedirectToHttps:
          http.status !== undefined
            ? [301, 308].includes(http.status) &&
              Boolean(httpLocation?.startsWith('https://'))
            : null,
        error: http.error,
      },
      www: {
        url: wwwUrl.toString(),
        status: www.status,
        location: wwwLocation,
        redirectsToPreferredHost:
          www.status !== undefined
            ? [301, 308].includes(www.status) &&
              Boolean(
                wwwLocation &&
                  new URL(wwwLocation).hostname === start.hostname &&
                  new URL(wwwLocation).protocol === 'https:',
              )
            : null,
        error: www.error,
      },
      hstsOnStartPage:
        pages.find(
          (page) =>
            normalizedDocumentUrl(page.finalUrl) ===
            normalizedDocumentUrl(input.startUrl),
        )?.hasHsts ?? null,
    },
    warnings,
  }
}
