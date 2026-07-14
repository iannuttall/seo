import type { publicHttpFetch } from '../../fetch/http-client.js'
import type {
  ExternalLinkCheck,
  ExternalLinkCheckAttempt,
  ExternalLinkCheckState,
} from '../monitoring/types.js'
import { abortController } from './crawl-control.js'
import type { CrawlExternalLinkVerification, CrawlReport } from './report.js'

const EXTERNAL_LINK_SELECTION_LIMIT = 200

type ExternalLinkCandidate = {
  url: string
  sourcePages: string[]
}

const EXTERNAL_LINK_STATES: ExternalLinkCheckState[] = [
  'available',
  'confirmed-broken',
  'transient',
  'provider-blocked',
  'rate-limited',
  'method-rejected',
  'unavailable',
]

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

function isAvailableStatus(status?: number): boolean {
  return status !== undefined && status >= 200 && status < 400
}

function isBrokenStatus(status?: number): boolean {
  return status === 404 || status === 410
}

function isMethodRejectedStatus(status?: number): boolean {
  return status === 405 || status === 501
}

function isProviderBlockedStatus(status?: number): boolean {
  return status === 401 || status === 403 || status === 451
}

function isTransientStatus(status?: number): boolean {
  return (
    status === 408 || status === 425 || (status !== undefined && status >= 500)
  )
}

function stateForAttempts(
  attempts: ExternalLinkCheckAttempt[],
): ExternalLinkCheckState {
  const last = attempts.at(-1)
  const statuses = attempts
    .map((attempt) => attempt.status)
    .filter((status): status is number => status !== undefined)

  if (isAvailableStatus(last?.status)) {
    return isMethodRejectedStatus(attempts[0]?.status)
      ? 'method-rejected'
      : attempts.length > 1
        ? 'transient'
        : 'available'
  }
  if (
    attempts.length >= 2 &&
    isBrokenStatus(last?.status) &&
    attempts.at(-2)?.status === last?.status
  ) {
    return 'confirmed-broken'
  }
  if (last?.status === 429) return 'rate-limited'
  if (isProviderBlockedStatus(last?.status)) return 'provider-blocked'
  if (isMethodRejectedStatus(last?.status)) return 'method-rejected'
  if (
    isTransientStatus(last?.status) ||
    statuses.some(isBrokenStatus) ||
    (statuses.length > 0 && attempts.some((attempt) => attempt.error))
  ) {
    return 'transient'
  }
  return 'unavailable'
}

async function requestExternalLink(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  fetch: typeof publicHttpFetch,
  signal?: AbortSignal,
): Promise<ExternalLinkCheckAttempt> {
  const controller = abortController({ timeoutMs, signal })

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)
    return { method, status: response.status }
  } catch (error) {
    return {
      method,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    controller.cleanup()
  }
}

async function checkExternalLink(
  url: string,
  timeoutMs: number,
  fetch: typeof publicHttpFetch,
  signal?: AbortSignal,
): Promise<ExternalLinkCheck> {
  const attempts: ExternalLinkCheckAttempt[] = []
  attempts.push(
    await requestExternalLink(url, 'HEAD', timeoutMs, fetch, signal),
  )

  const head = attempts[0]
  if (
    !signal?.aborted &&
    !isAvailableStatus(head?.status) &&
    head?.status !== 429 &&
    !isProviderBlockedStatus(head?.status)
  ) {
    attempts.push(
      await requestExternalLink(url, 'GET', timeoutMs, fetch, signal),
    )
  }

  const last = attempts.at(-1)
  if (
    !signal?.aborted &&
    isBrokenStatus(last?.status) &&
    attempts.at(-2)?.status !== last?.status
  ) {
    attempts.push(
      await requestExternalLink(url, 'GET', timeoutMs, fetch, signal),
    )
  }

  const finalAttempt = attempts.at(-1)
  return {
    url,
    ...(finalAttempt?.status !== undefined
      ? { status: finalAttempt.status }
      : {}),
    ...(finalAttempt?.error ? { error: finalAttempt.error } : {}),
    state: stateForAttempts(attempts),
    attempts,
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

  const fetchedUrls = [...checks.values()].filter((check) =>
    check.attempts?.some((attempt) => attempt.status !== undefined),
  ).length
  const failedUrls = [...checks.values()].filter(
    (check) => check.state === 'unavailable',
  ).length
  const unresolvedMethodRejectedUrls = [...checks.values()].filter(
    (check) =>
      check.state === 'method-rejected' && !isAvailableStatus(check.status),
  ).length
  const deferredUrls = candidates.length - checks.size
  const outcomes = Object.fromEntries(
    EXTERNAL_LINK_STATES.map((state) => [
      state,
      [...checks.values()].filter((check) => check.state === state).length,
    ]),
  ) as Record<ExternalLinkCheckState, number>
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
      `${failedUrls} external URL${failedUrls === 1 ? '' : 's'} could not be reached after bounded verification.`,
    )
  }
  if (outcomes.transient) {
    warnings.push(
      `${outcomes.transient} external URL${outcomes.transient === 1 ? '' : 's'} returned inconsistent or temporary responses. Recheck ${outcomes.transient === 1 ? 'it' : 'them'} before changing the source page.`,
    )
  }
  if (outcomes['provider-blocked']) {
    warnings.push(
      `${outcomes['provider-blocked']} external URL${outcomes['provider-blocked'] === 1 ? '' : 's'} blocked automated verification. Open ${outcomes['provider-blocked'] === 1 ? 'it' : 'them'} manually before changing the source page.`,
    )
  }
  if (outcomes['rate-limited']) {
    warnings.push(
      `${outcomes['rate-limited']} external URL${outcomes['rate-limited'] === 1 ? '' : 's'} rate-limited verification. Recheck ${outcomes['rate-limited'] === 1 ? 'it' : 'them'} later.`,
    )
  }
  if (unresolvedMethodRejectedUrls) {
    warnings.push(
      `${unresolvedMethodRejectedUrls} external URL${unresolvedMethodRejectedUrls === 1 ? '' : 's'} rejected both verification methods. Open ${unresolvedMethodRejectedUrls === 1 ? 'it' : 'them'} manually before changing the source page.`,
    )
  }

  return {
    dataStatus:
      discoveredLinkOccurrences > retainedLinkOccurrences ||
      deferredUrls > 0 ||
      failedUrls > 0 ||
      outcomes.transient > 0 ||
      outcomes['provider-blocked'] > 0 ||
      outcomes['rate-limited'] > 0 ||
      unresolvedMethodRejectedUrls > 0
        ? 'partial'
        : 'complete',
    discoveredLinkOccurrences,
    retainedUrls: candidates.length,
    selectedUrls: urls.length,
    fetchedUrls,
    failedUrls,
    deferredUrls,
    limit: EXTERNAL_LINK_SELECTION_LIMIT,
    outcomes,
    warnings,
  }
}
