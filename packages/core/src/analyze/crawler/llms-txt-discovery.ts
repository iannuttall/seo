import { createHash } from 'node:crypto'
import PQueue from 'p-queue'
import { publicHttpFetch } from '../../fetch/http-client.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import {
  fetchText,
  headerValue,
  linkEntries,
  normalizedDocumentUrl,
  safeError,
} from './agent-discovery-http.js'
import type {
  CrawlAgentDiscovery,
  LlmsTxtLinkObservation,
} from './agent-discovery-types.js'

const MAX_LLMS_LINKS = 100
const MAX_CURATED_LLMS_BYTES = 100_000

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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

function closingUnescaped(
  value: string,
  start: number,
  target: string,
): number {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
      continue
    }
    if (value[index] === target) return index
  }
  return -1
}

function closingParenthesis(value: string, start: number): number {
  let depth = 1
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1
      continue
    }
    if (value[index] === '(') depth += 1
    if (value[index] !== ')') continue
    depth -= 1
    if (depth === 0) return index
  }
  return -1
}

function parseLlmsLinkLine(line: string):
  | {
      link?: { label: string; url: string }
      invalidValue?: string
    }
  | undefined {
  const bullet = line.match(/^ {0,3}[-+*][\t ]+(.+)$/u)
  if (!bullet?.[1]) return undefined
  const value = bullet[1]
  if (!value.startsWith('[')) return { invalidValue: line.trim() }
  const labelEnd = closingUnescaped(value, 1, ']')
  if (labelEnd < 0 || value[labelEnd + 1] !== '(') {
    return { invalidValue: line.trim() }
  }
  const urlStart = labelEnd + 2
  const urlEnd = closingParenthesis(value, urlStart)
  if (urlEnd < 0) return { invalidValue: line.trim() }
  const destinationValue = value.slice(urlStart, urlEnd).trim()
  const angleEnd = destinationValue.indexOf('>')
  const destination = destinationValue.startsWith('<')
    ? angleEnd > 1
      ? destinationValue.slice(1, angleEnd).trim()
      : undefined
    : destinationValue.match(/^(?:\\.|[^\s])+/u)?.[0]
  const notes = value.slice(urlEnd + 1).trim()
  const label = value
    .slice(1, labelEnd)
    .replace(/\\([\\\]])/gu, '$1')
    .trim()
  if (!label || !destination || (notes && !notes.startsWith(':'))) {
    return { invalidValue: destination || line.trim() }
  }
  try {
    const url = new URL(destination)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { invalidValue: destination }
    }
    return { link: { label, url: url.toString() } }
  } catch {
    return { invalidValue: destination }
  }
}

function markdownLinks(value: string) {
  const links: Array<{ label: string; url: string }> = []
  const invalidLinks: string[] = []
  for (const line of value.split(/\r?\n/u)) {
    const parsed = parseLlmsLinkLine(line)
    if (parsed?.link) links.push(parsed.link)
    else if (parsed?.invalidValue) invalidLinks.push(parsed.invalidValue)
  }
  return { links, invalidLinks }
}

export function validateLlmsTxtV2(value: string): string[] {
  const normalized = value.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const lines = normalized.split('\n')
  const errors: string[] = []
  if (!lines[0]?.match(/^ {0,3}#\s+\S/u)) {
    errors.push('The first line must be one level-one heading.')
  }
  if ((normalized.match(/^ {0,3}#\s+\S/gmu)?.length ?? 0) !== 1) {
    errors.push('The file must contain exactly one level-one heading.')
  }
  if (/^ {0,3}#{3,6}\s+\S/gmu.test(normalized)) {
    errors.push('The file can use only level-one and level-two headings.')
  }
  const sectionCount = normalized.match(/^ {0,3}##\s+\S/gmu)?.length ?? 0
  if (sectionCount > 12) {
    errors.push('The file must contain no more than 12 sections.')
  }

  let section: { title: string; links: number } | undefined
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('## ')) {
      if (section && section.links === 0) {
        errors.push(`Section "${section.title}" has no Markdown links.`)
      }
      section = { title: line.slice(3).trim(), links: 0 }
      continue
    }
    if (!section || !line || line.startsWith('>')) continue
    if (parseLlmsLinkLine(rawLine)?.link) {
      section.links += 1
      continue
    }
    errors.push(
      `Section "${section.title}" contains a line that is not a Markdown link entry: ${line.slice(0, 120)}`,
    )
  }
  if (section && section.links === 0) {
    errors.push(`Section "${section.title}" has no Markdown links.`)
  }
  return [...new Set(errors)]
}

function llmsScopePath(value: string): string {
  const pathname = new URL(value).pathname
  const directory = pathname.slice(0, pathname.lastIndexOf('/') + 1)
  return directory || '/'
}

function llmsAppliesToPath(fileUrl: string, startPath: string): boolean {
  const scopePath = llmsScopePath(fileUrl)
  return (
    scopePath === '/' ||
    startPath === scopePath.slice(0, -1) ||
    startPath.startsWith(scopePath)
  )
}

function llmsPathCandidates(startUrl: string): string[] {
  const start = new URL(startUrl)
  const parts = start.pathname.split('/').filter(Boolean)
  if (!start.pathname.endsWith('/') && parts.at(-1)?.includes('.')) parts.pop()
  return Array.from({ length: parts.length + 1 }, (_, offset) => {
    const retained = parts.slice(0, parts.length - offset)
    return new URL(
      `/${retained.length ? `${retained.join('/')}/` : ''}llms.txt`,
      start.origin,
    ).toString()
  }).slice(0, 16)
}

function isLlmsTxtUrl(value: string): boolean {
  return new URL(value).pathname.toLowerCase().endsWith('/llms.txt')
}

function startPageForDiscovery(
  startUrl: string,
  pages: CrawlPageSnapshot[],
): CrawlPageSnapshot | undefined {
  const exact = pages.find(
    (page) =>
      normalizedDocumentUrl(page.finalUrl) === normalizedDocumentUrl(startUrl),
  )
  if (exact) return exact
  const startPath = new URL(startUrl).pathname
  return [...pages]
    .filter(
      (page) => new URL(page.finalUrl).origin === new URL(startUrl).origin,
    )
    .sort((left, right) => {
      const leftPath = new URL(left.finalUrl).pathname
      const rightPath = new URL(right.finalUrl).pathname
      const leftMatch = startPath.startsWith(leftPath) ? leftPath.length : 0
      const rightMatch = startPath.startsWith(rightPath) ? rightPath.length : 0
      return (
        rightMatch - leftMatch || left.finalUrl.localeCompare(right.finalUrl)
      )
    })[0]
}

async function discoverLlmsTxt(input: {
  startUrl: string
  pages: CrawlPageSnapshot[]
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<{
  url: string
  source: 'html-link' | 'http-link' | 'path-probe'
  advertisedUrls: string[]
  htmlUrls: string[]
  httpUrls: string[]
  candidateUrls: string[]
}> {
  const page = startPageForDiscovery(input.startUrl, input.pages)
  const htmlUrls = [...new Set(page?.describedBy ?? [])]
    .filter(isLlmsTxtUrl)
    .sort()
  const httpUrls = linkEntries(
    headerValue(page?.responseHeaders, 'link'),
    page?.finalUrl ?? input.startUrl,
  )
    .filter(
      (entry) =>
        entry.rel.includes('describedby') &&
        (!entry.type || entry.type === 'text/markdown') &&
        isLlmsTxtUrl(entry.url),
    )
    .map((entry) => entry.url)
    .sort()
  const advertisedUrls = [...new Set([...htmlUrls, ...httpUrls])].sort(
    (left, right) =>
      llmsScopePath(right).length - llmsScopePath(left).length ||
      left.localeCompare(right),
  )
  const startPath = new URL(input.startUrl).pathname
  const selectedAdvertisedUrl = advertisedUrls.find((url) =>
    llmsAppliesToPath(url, startPath),
  )
  if (selectedAdvertisedUrl) {
    return {
      url: selectedAdvertisedUrl,
      source: htmlUrls.includes(selectedAdvertisedUrl)
        ? 'html-link'
        : 'http-link',
      advertisedUrls,
      htmlUrls,
      httpUrls,
      candidateUrls: advertisedUrls,
    }
  }

  const candidateUrls = llmsPathCandidates(input.startUrl)
  for (const url of candidateUrls) {
    try {
      const result = await fetchText({
        url,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
        accept: 'text/plain,text/markdown;q=0.9',
      })
      if (result.response.status >= 200 && result.response.status < 300) {
        return {
          url,
          source: 'path-probe',
          advertisedUrls,
          htmlUrls,
          httpUrls,
          candidateUrls,
        }
      }
    } catch {
      // Continue to the next parent scope. The final audit records fetch errors.
    }
  }
  return {
    url:
      candidateUrls.at(-1) ?? new URL('/llms.txt', input.startUrl).toString(),
    source: 'path-probe',
    advertisedUrls,
    htmlUrls,
    httpUrls,
    candidateUrls,
  }
}

export async function inspectLlmsTxt(input: {
  startUrl: string
  origin: string
  pages: CrawlPageSnapshot[]
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<CrawlAgentDiscovery['llmsTxt']> {
  const discovery = await discoverLlmsTxt(input)
  const url = discovery.url
  const startPath = new URL(input.startUrl).pathname
  const scopePath = llmsScopePath(url)
  const discoveryEvidence = {
    ...discovery,
    scopePath,
    appliesToStartUrl: llmsAppliesToPath(url, startPath),
  }
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
    const parsed = markdownLinks(exists ? first.body : '')
    const formatErrors = exists ? validateLlmsTxtV2(first.body) : []
    const links = parsed.links.slice(0, MAX_LLMS_LINKS)
    const linkLimitReached = parsed.links.length > links.length
    const counts = new Map<string, number>()
    for (const link of links) {
      counts.set(link.url, (counts.get(link.url) ?? 0) + 1)
    }
    const duplicateLinks = [...counts]
      .filter(([, count]) => count > 1)
      .map(([link]) => link)
      .sort()
    const crawlRoutes = new Set(
      input.pages.map((page) => normalizedDocumentUrl(page.finalUrl)),
    )
    const linkQueue = new PQueue({ concurrency: 4 })
    const linkObservations = await Promise.all(
      links.map((link) =>
        linkQueue.add(async (): Promise<LlmsTxtLinkObservation> => {
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
      ),
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
      formatValid: exists ? formatErrors.length === 0 : null,
      formatErrors,
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
      discovery: discoveryEvidence,
    }
  } catch (error) {
    return {
      url,
      exists: false,
      repeatedHashStable: null,
      formatValid: null,
      formatErrors: [],
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
      discovery: discoveryEvidence,
      error: safeError(error),
    }
  }
}

export async function inspectLlmsTxtForReport(
  report: { config: { url: string }; pages: CrawlPageSnapshot[] },
  options: {
    timeoutMs?: number
    fetch?: typeof publicHttpFetch
    signal?: AbortSignal
  } = {},
): Promise<CrawlAgentDiscovery['llmsTxt']> {
  return inspectLlmsTxt({
    startUrl: report.config.url,
    origin: new URL(report.config.url).origin,
    pages: report.pages,
    timeoutMs: options.timeoutMs ?? 10_000,
    fetch: options.fetch ?? publicHttpFetch,
    signal: options.signal,
  })
}
