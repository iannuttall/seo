import {
  type RedirectOutcome,
  traceRedirects,
} from '../../commands/redirect-chain.js'
import { crawlOne } from './crawl-page.js'

export type RedirectTraceStep = {
  url: string
  status: number
  location?: string
  nextUrl?: string
  durationMs: number
}

export type RedirectTraceIssue =
  | 'redirect-loop'
  | 'too-many-redirects'
  | 'redirect-without-location'
  | 'final-4xx'
  | 'final-5xx'
  | 'non-indexable-final'
  | 'canonical-mismatch'

export type RedirectTraceReport = {
  url: string
  finalUrl: string
  generatedAt: string
  summary: {
    hops: number
    // Null when the last request got no response (see outcome and error).
    finalStatus: number | null
    // How the trace ended: done, loop, too_many, timeout or error.
    outcome: RedirectOutcome
    error?: string
    finalIndexable?: boolean
    issues: RedirectTraceIssue[]
  }
  chain: RedirectTraceStep[]
  finalPage?: {
    title?: string
    canonical?: string
    metaRobots?: string
    xRobotsTag?: string
    indexable: boolean
  }
  warnings: string[]
}

function redirectIssue(input: {
  chain: RedirectTraceStep[]
  finalIndexable?: boolean
  canonical?: string
  finalUrl: string
  stoppedForLoop: boolean
  stoppedForLimit: boolean
}): RedirectTraceIssue[] {
  const issues: RedirectTraceIssue[] = []
  const finalStatus = input.chain.at(-1)?.status ?? 0
  const redirectWithoutLocation = input.chain.some(
    (step) => step.status >= 300 && step.status < 400 && !step.location,
  )

  if (input.stoppedForLoop) issues.push('redirect-loop')
  if (input.stoppedForLimit) issues.push('too-many-redirects')
  if (redirectWithoutLocation) issues.push('redirect-without-location')
  if (finalStatus >= 400 && finalStatus < 500) issues.push('final-4xx')
  if (finalStatus >= 500) issues.push('final-5xx')
  if (input.finalIndexable === false) issues.push('non-indexable-final')
  if (input.canonical && input.canonical !== input.finalUrl) {
    issues.push('canonical-mismatch')
  }

  return [...new Set(issues)]
}

export async function redirectTrace(input: {
  url: string
  maxHops?: number
  timeoutMs?: number
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<RedirectTraceReport> {
  const warnings: string[] = []
  const trace = await traceRedirects(new URL(input.url).toString(), {
    maxHops: input.maxHops,
    timeoutMs: input.timeoutMs,
  })
  const chain: RedirectTraceStep[] = trace.steps.map((step) => ({
    url: step.url,
    status: step.status,
    ...(step.location
      ? { location: step.location, nextUrl: step.location }
      : {}),
    durationMs: step.ms,
  }))
  if (trace.error) warnings.push(`${trace.final_url}: ${trace.error}`)

  const finalUrl = trace.final_url
  // The final page is only read when the redirects ended on a response.
  const final =
    trace.outcome === 'done'
      ? await crawlOne(finalUrl, {
          refresh: input.refresh,
          js: input.js ?? 'auto',
        })
      : undefined
  if (final?.warning) warnings.push(final.warning)

  const finalPage = final?.page
    ? {
        title: final.page.title,
        canonical: final.page.canonical,
        metaRobots: final.page.metaRobots,
        xRobotsTag: final.page.xRobotsTag,
        indexable: final.page.indexable,
      }
    : undefined
  const issues = redirectIssue({
    chain,
    finalIndexable: finalPage?.indexable,
    canonical: finalPage?.canonical,
    finalUrl,
    stoppedForLoop: trace.outcome === 'loop',
    stoppedForLimit: trace.outcome === 'too_many',
  })

  return {
    url: input.url,
    finalUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      hops: trace.hops,
      finalStatus: trace.final_status,
      outcome: trace.outcome,
      ...(trace.error ? { error: trace.error } : {}),
      finalIndexable: finalPage?.indexable,
      issues,
    },
    chain,
    finalPage,
    warnings,
  }
}
