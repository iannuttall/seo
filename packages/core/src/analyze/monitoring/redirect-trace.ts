import { publicHttpFetch } from '../../fetch/http-client.js'
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
    finalStatus: number
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

function resolveNextUrl(location: string, baseUrl: string): string | undefined {
  try {
    const next = new URL(location, baseUrl)
    next.hash = ''
    return next.toString()
  } catch {
    return undefined
  }
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
  const maxHops = input.maxHops ?? 10
  const warnings: string[] = []
  const chain: RedirectTraceStep[] = []
  const seen = new Set<string>()
  let currentUrl = new URL(input.url).toString()
  let stoppedForLoop = false
  let stoppedForLimit = false

  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (seen.has(currentUrl)) {
      stoppedForLoop = true
      break
    }
    seen.add(currentUrl)

    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? 20_000,
    )

    try {
      const response = await publicHttpFetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
      })
      const location = response.headers.get('location') ?? undefined
      const nextUrl = location
        ? resolveNextUrl(location, currentUrl)
        : undefined

      chain.push({
        url: currentUrl,
        status: response.status,
        location,
        nextUrl,
        durationMs: Date.now() - startedAt,
      })

      if (response.status < 300 || response.status >= 400) break
      if (!nextUrl) break
      currentUrl = nextUrl
    } catch (error) {
      warnings.push(
        `${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      )
      break
    } finally {
      clearTimeout(timer)
    }
  }

  const lastStep = chain.at(-1)
  if (
    lastStep &&
    lastStep.status >= 300 &&
    lastStep.status < 400 &&
    chain.length > maxHops
  ) {
    stoppedForLimit = true
  }

  const finalUrl = lastStep?.nextUrl ?? lastStep?.url ?? currentUrl
  const final = await crawlOne(finalUrl, {
    refresh: input.refresh,
    js: input.js ?? 'auto',
  })
  if (final.warning) warnings.push(final.warning)

  const finalPage = final.page
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
    stoppedForLoop,
    stoppedForLimit,
  })

  return {
    url: input.url,
    finalUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      hops: Math.max(0, chain.length - 1),
      finalStatus: final.page?.status ?? chain.at(-1)?.status ?? 0,
      finalIndexable: finalPage?.indexable,
      issues,
    },
    chain,
    finalPage,
    warnings,
  }
}
