import { createHash } from 'node:crypto'
import { registrableDomain } from '../../brand.js'
import type { FetchRateControls } from '../../fetch/page-fetcher/types.js'
import { explainRule } from '../../rules.js'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import type { CrawlIssue } from './report.js'

export type CrawlSiteChecks = {
  soft404: {
    status: 'pass' | 'warning' | 'unknown'
    probes: Probe[]
    probeLimit: number
    complete: boolean
  }
  // The home page on the start host and on its www or bare domain twin.
  // Absent when the start host is a subdomain, an IP address or localhost.
  hostVariant?: {
    status: 'pass' | 'warning' | 'unknown'
    probes: Probe[]
  }
}

// Root, nested and reserved paths: a site can return 404 under one prefix
// and a blank 200 for any made-up root path, where profile routes live.
const PROBE_COUNT = 3

function probeUrls(startUrl: string): string[] {
  const origin = new URL(startUrl).origin
  const seed = createHash('sha256').update(origin).digest('hex').slice(0, 12)
  return [
    `/${seed}-not-found`,
    `/${seed}-not-found/${seed}-missing`,
    `/.well-known/seo-audit/not-found-${seed}-1`,
  ].map((path) => new URL(path, origin).toString())
}

function probeObservation(url: string, result: CrawlOneResult) {
  const request = result.request
  if (!request) return { url, error: result.warning ?? 'No response evidence.' }
  if (request.outcome === 'response') {
    return {
      url,
      status: request.status,
      finalUrl: request.finalUrl,
      redirected: request.finalUrl !== url,
      accessBlocked: Boolean(request.accessBlock),
    }
  }
  return {
    url,
    error:
      request.outcome === 'failure'
        ? request.error
        : `Probe skipped: ${request.reason}`,
  }
}

type Probe = {
  url: string
  status?: number
  finalUrl?: string
  redirected?: boolean
  accessBlocked?: boolean
  error?: string
}

// The start host's home page and its twin: www.example.com for
// example.com, and the reverse.
function hostVariantUrls(startUrl: string): [string, string] | undefined {
  const home = new URL('/', startUrl)
  const domain = registrableDomain(home.hostname)?.domain
  if (!domain) return undefined
  const twin = new URL(home)
  if (home.hostname === domain) twin.hostname = `www.${domain}`
  else if (home.hostname === `www.${domain}`) twin.hostname = domain
  else return undefined
  return [home.toString(), twin.toString()]
}

// A host serves the site when its home page answers 2xx without leaving it.
function servesOwnHost(probe: Probe): boolean {
  if (!isConclusive(probe)) return false
  const status = probe.status ?? 0
  if (status < 200 || status >= 300) return false
  return (
    new URL(probe.finalUrl ?? probe.url).hostname ===
    new URL(probe.url).hostname
  )
}

// A skipped, failed, blocked or rate-limited probe says nothing about how
// the site answers a missing path.
function isConclusive(probe: Probe): boolean {
  return (
    probe.status !== undefined &&
    !probe.accessBlocked &&
    probe.status !== 429 &&
    probe.status !== 503
  )
}

export async function collectCrawlSiteChecks(input: {
  startUrl: string
  timeoutMs: number
  respectRobots: boolean
  signal?: AbortSignal
  rate?: FetchRateControls
  /** Inconclusive probes are retried once after this cool-down. */
  retryDelayMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  fetchStatusPage: typeof import('../monitoring/crawl-page.js').crawlStatusOnly
}): Promise<{ checks: CrawlSiteChecks; issues: CrawlIssue[] }> {
  const probe = async (url: string): Promise<Probe> =>
    probeObservation(
      url,
      await input.fetchStatusPage(url, {
        js: 'off',
        refresh: true,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        writeCache: false,
        respectRobots: input.respectRobots,
        ...(input.rate ? { rate: input.rate } : {}),
      }),
    )
  const hostUrls = hostVariantUrls(input.startUrl) ?? []
  const probes: Probe[] = []
  for (const url of [...probeUrls(input.startUrl), ...hostUrls]) {
    if (input.signal?.aborted) break
    probes.push(await probe(url))
  }
  if (
    input.sleep &&
    !input.signal?.aborted &&
    probes.some((item) => !isConclusive(item))
  ) {
    await input.sleep(input.retryDelayMs ?? 2_000, input.signal)
    for (const [index, item] of probes.entries()) {
      if (input.signal?.aborted) break
      if (!isConclusive(item)) probes[index] = await probe(item.url)
    }
  }

  const hostProbes = probes.splice(PROBE_COUNT)
  const hostVariant = hostUrls.length
    ? {
        status: (hostProbes.length === 2 && hostProbes.every(servesOwnHost)
          ? 'warning'
          : hostProbes.length === 2 && hostProbes.every(isConclusive)
            ? 'pass'
            : 'unknown') as 'pass' | 'warning' | 'unknown',
        probes: hostProbes,
      }
    : undefined
  const conclusive = probes.filter(isConclusive)
  const successful = conclusive.filter(
    (probe) => (probe.status ?? 0) >= 200 && (probe.status ?? 0) < 400,
  )
  const correctMissing = conclusive.filter(
    (probe) => probe.status === 404 || probe.status === 410,
  )
  const status: CrawlSiteChecks['soft404']['status'] =
    successful.length > 0
      ? 'warning'
      : correctMissing.length === PROBE_COUNT
        ? 'pass'
        : 'unknown'
  const checks: CrawlSiteChecks = {
    soft404: {
      status,
      probes,
      probeLimit: PROBE_COUNT,
      complete: conclusive.length === PROBE_COUNT,
    },
    ...(hostVariant ? { hostVariant } : {}),
  }
  const issues: CrawlIssue[] = []
  if (status === 'warning') {
    issues.push(
      siteIssue(
        'soft_404',
        new URL('/', input.startUrl).toString(),
        `${successful.length} of ${probes.length} made-up paths returned a successful response or redirect: ${successful
          .map((probe) => `${new URL(probe.url).pathname} (${probe.status})`)
          .join(', ')}.`,
        checks.soft404,
      ),
    )
  }
  if (hostVariant?.status === 'warning') {
    issues.push(
      siteIssue(
        'host_variant_not_redirected',
        hostUrls[1] ?? input.startUrl,
        `${hostVariant.probes.map((probe) => `${probe.url} (${probe.status})`).join(' and ')} both answered without redirecting to the other host.`,
        hostVariant,
      ),
    )
  }
  return { checks, issues }
}

function siteIssue(
  ruleId: 'soft_404' | 'host_variant_not_redirected',
  url: string,
  detail: string,
  evidence: CrawlIssue['evidence'],
): CrawlIssue {
  const rule = explainRule(ruleId)
  if (!rule) throw new Error(`Missing rule guidance for ${ruleId}`)
  return {
    ruleId,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    url,
    detail,
    evidence,
  }
}
