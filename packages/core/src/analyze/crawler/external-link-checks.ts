import type { publicHttpFetch } from '../../fetch/http-client.js'
import { abortController } from './crawl-control.js'
import type { CrawlExternalLinkVerification, CrawlReport } from './report.js'

const EXTERNAL_LINK_SELECTION_LIMIT = 200

type ExternalLinkCandidate = {
  url: string
  sourcePages: string[]
}

type ExternalLinkCheck = {
  url: string
  status?: number
  error?: string
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (const character of value) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619)
  }
  return hash >>> 0
}

function compareStable(left: string, right: string): number {
  const leftHash = stableHash(left)
  const rightHash = stableHash(right)
  if (leftHash !== rightHash) return leftHash - rightHash
  return left < right ? -1 : left > right ? 1 : 0
}

function collectCandidates(pages: CrawlReport['pages']): {
  candidates: ExternalLinkCandidate[]
  discoveredLinkOccurrences: number
  retainedLinkOccurrences: number
} {
  const sourcesByUrl = new Map<string, Set<string>>()
  let discoveredLinkOccurrences = 0
  let retainedLinkOccurrences = 0

  for (const page of pages) {
    const retained = [...new Set(page.sampleExternalLinks ?? [])]
    discoveredLinkOccurrences += page.outgoingExternalCount ?? retained.length
    retainedLinkOccurrences += retained.length
    for (const url of retained) {
      let sourcePages = sourcesByUrl.get(url)
      if (!sourcePages) {
        sourcePages = new Set<string>()
        sourcesByUrl.set(url, sourcePages)
      }
      sourcePages.add(page.url)
    }
  }

  return {
    candidates: [...sourcesByUrl]
      .map(([url, sourcePages]) => ({
        url,
        sourcePages: [...sourcePages].sort(),
      }))
      .sort((left, right) => compareStable(left.url, right.url)),
    discoveredLinkOccurrences,
    retainedLinkOccurrences,
  }
}

function selectCandidateUrls(
  candidates: ExternalLinkCandidate[],
  limit: number,
): string[] {
  const urlsBySource = new Map<string, string[]>()
  for (const candidate of candidates) {
    for (const sourcePage of candidate.sourcePages) {
      const urls = urlsBySource.get(sourcePage) ?? []
      urls.push(candidate.url)
      urlsBySource.set(sourcePage, urls)
    }
  }
  for (const urls of urlsBySource.values()) urls.sort(compareStable)

  const sourcePages = [...urlsBySource.keys()].sort(compareStable)
  const cursors = new Map(sourcePages.map((sourcePage) => [sourcePage, 0]))
  const selected = new Set<string>()
  while (selected.size < limit) {
    let selectedThisRound = false
    for (const sourcePage of sourcePages) {
      const urls = urlsBySource.get(sourcePage) ?? []
      let cursor = cursors.get(sourcePage) ?? 0
      while (cursor < urls.length) {
        const candidate = urls[cursor]
        if (!candidate || !selected.has(candidate)) break
        cursor += 1
      }
      cursors.set(sourcePage, cursor + 1)
      const url = urls[cursor]
      if (!url) continue
      selected.add(url)
      selectedThisRound = true
      if (selected.size === limit) break
    }
    if (!selectedThisRound) break
  }
  return [...selected]
}

async function checkExternalLink(
  url: string,
  timeoutMs: number,
  fetch: typeof publicHttpFetch,
  signal?: AbortSignal,
): Promise<ExternalLinkCheck> {
  const controller = abortController({ timeoutMs, signal })

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)
    return { url, status: response.status }
  } catch (error) {
    return {
      url,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    controller.cleanup()
  }
}

export async function verifyExternalLinks(input: {
  pages: CrawlReport['pages']
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<CrawlExternalLinkVerification> {
  const { candidates, discoveredLinkOccurrences, retainedLinkOccurrences } =
    collectCandidates(input.pages)
  const urls = input.signal?.aborted
    ? []
    : selectCandidateUrls(candidates, EXTERNAL_LINK_SELECTION_LIMIT)

  const checks = new Map<string, ExternalLinkCheck>()
  for (let index = 0; index < urls.length; index += 8) {
    if (input.signal?.aborted) break
    const batch = urls.slice(index, index + 8)
    const results = await Promise.all(
      batch.map((url) =>
        checkExternalLink(url, input.timeoutMs, input.fetch, input.signal),
      ),
    )
    for (const result of results) checks.set(result.url, result)
  }

  for (const page of input.pages) {
    const pageChecks = (page.sampleExternalLinks ?? [])
      .map((url) => checks.get(url))
      .filter((value): value is ExternalLinkCheck => Boolean(value))
    if (pageChecks.length) page.externalLinkChecks = pageChecks
  }

  const fetchedUrls = [...checks.values()].filter(
    (check) => typeof check.status === 'number' && check.status > 0,
  ).length
  const failedUrls = checks.size - fetchedUrls
  const deferredUrls = candidates.length - checks.size
  const warnings: string[] = []
  if (discoveredLinkOccurrences > retainedLinkOccurrences) {
    warnings.push(
      `Retained ${retainedLinkOccurrences} sampled external link occurrence${retainedLinkOccurrences === 1 ? '' : 's'} from ${discoveredLinkOccurrences} observed occurrence${discoveredLinkOccurrences === 1 ? '' : 's'}.`,
    )
  }
  if (candidates.length > urls.length) {
    warnings.push(
      `Selected ${urls.length} of ${candidates.length} retained external URLs using the ${EXTERNAL_LINK_SELECTION_LIMIT}-URL verification limit.`,
    )
  }
  if (checks.size < urls.length) {
    warnings.push(
      `Stopped before checking ${urls.length - checks.size} selected external URL${urls.length - checks.size === 1 ? '' : 's'}.`,
    )
  }
  if (failedUrls) {
    warnings.push(
      `${failedUrls} external URL request${failedUrls === 1 ? '' : 's'} failed before a response was received.`,
    )
  }

  return {
    dataStatus:
      discoveredLinkOccurrences > retainedLinkOccurrences ||
      deferredUrls > 0 ||
      failedUrls > 0
        ? 'partial'
        : 'complete',
    discoveredLinkOccurrences,
    retainedUrls: candidates.length,
    selectedUrls: urls.length,
    fetchedUrls,
    failedUrls,
    deferredUrls,
    limit: EXTERNAL_LINK_SELECTION_LIMIT,
    warnings,
  }
}
