import { createHash } from 'node:crypto'
import { explainRule } from '../../rules.js'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import type { CrawlIssue } from './report.js'

export type CrawlSiteChecks = {
  soft404: {
    status: 'pass' | 'warning' | 'unknown'
    probes: Array<{
      url: string
      status?: number
      finalUrl?: string
      redirected?: boolean
      accessBlocked?: boolean
      error?: string
    }>
    probeLimit: number
    complete: boolean
  }
}

const PROBE_COUNT = 2

function probeUrls(startUrl: string): string[] {
  const origin = new URL(startUrl).origin
  const seed = createHash('sha256').update(origin).digest('hex').slice(0, 12)
  return Array.from({ length: PROBE_COUNT }, (_, index) =>
    new URL(
      `/.well-known/seo-audit/not-found-${seed}-${index + 1}`,
      origin,
    ).toString(),
  )
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

export async function collectCrawlSiteChecks(input: {
  startUrl: string
  timeoutMs: number
  respectRobots: boolean
  signal?: AbortSignal
  fetchStatusPage: typeof import('../monitoring/crawl-page.js').crawlStatusOnly
}): Promise<{ checks: CrawlSiteChecks; issues: CrawlIssue[] }> {
  const probes: CrawlSiteChecks['soft404']['probes'] = []
  for (const url of probeUrls(input.startUrl)) {
    if (input.signal?.aborted) break
    const result = await input.fetchStatusPage(url, {
      js: 'off',
      refresh: true,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      writeCache: false,
      respectRobots: input.respectRobots,
    })
    probes.push(probeObservation(url, result))
  }

  const conclusive = probes.filter(
    (probe) => probe.status !== undefined && !probe.accessBlocked,
  )
  const successful = conclusive.filter(
    (probe) => (probe.status ?? 0) >= 200 && (probe.status ?? 0) < 400,
  )
  const correctMissing = conclusive.filter(
    (probe) => probe.status === 404 || probe.status === 410,
  )
  const status: CrawlSiteChecks['soft404']['status'] =
    conclusive.length !== PROBE_COUNT
      ? 'unknown'
      : successful.length === PROBE_COUNT
        ? 'warning'
        : correctMissing.length === PROBE_COUNT
          ? 'pass'
          : 'unknown'
  const checks: CrawlSiteChecks = {
    soft404: {
      status,
      probes,
      probeLimit: PROBE_COUNT,
      complete: probes.length === PROBE_COUNT,
    },
  }
  if (status !== 'warning') return { checks, issues: [] }

  const rule = explainRule('soft_404')
  if (!rule) throw new Error('Missing rule guidance for soft_404')
  return {
    checks,
    issues: [
      {
        ruleId: 'soft_404',
        title: rule.title,
        category: rule.category,
        severity: rule.defaultSeverity,
        url: new URL('/', input.startUrl).toString(),
        detail: `${successful.length} known-nonexistent paths returned a successful response or redirect.`,
        evidence: checks.soft404,
      },
    ],
  }
}
