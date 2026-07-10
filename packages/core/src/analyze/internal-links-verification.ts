import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { assertUrlMatchesGscProperty } from '../gsc/property-url.js'
import type { ExtractedPage, PageFetchResult } from '../types.js'
import type {
  InternalLinkCandidate,
  InternalLinkOpportunity,
  InternalLinksWarning,
} from './internal-links-types.js'
import { pageTechnicalSignals } from './page-technical-signals.js'

type FetchPage = (
  url: string,
  options?: {
    js?: boolean | 'auto'
    refresh?: boolean
    rate?: FetchRateControls
  },
) => Promise<PageFetchResult>

type ExtractPage = (
  fetched: PageFetchResult,
  extractor?: 'defuddle' | 'readability',
) => Promise<ExtractedPage>

export interface InternalLinksVerificationDependencies {
  fetch: FetchPage
  extract: ExtractPage
}

export const INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT = 20

export interface VerifiedInternalLinkTarget {
  requestedUrl: string
  preferredUrl: string
  finalUrl?: string
  canonical?: string
  status?: number
  aliases: string[]
  verification: 'verified' | 'failed' | 'technical-issue'
  technicalSignals: ReturnType<typeof pageTechnicalSignals>
  fetchDiagnostics?: PageFetchResult['diagnostics']
  warnings: InternalLinksWarning[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function acceptedAlias(
  site: string,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  try {
    return assertUrlMatchesGscProperty(site, value)
  } catch {
    return undefined
  }
}

function withoutFragment(value: string): string {
  const url = new URL(value)
  url.hash = ''
  return url.toString()
}

function sameObservedUrl(left: string, right: string): boolean {
  try {
    return withoutFragment(left) === withoutFragment(right)
  } catch {
    return false
  }
}

function absoluteCanonical(page: ExtractedPage): string | undefined {
  if (!page.canonical) return undefined
  try {
    return new URL(page.canonical, page.finalUrl).toString()
  } catch {
    return undefined
  }
}

export async function verifyInternalLinkTarget(input: {
  site: string
  targetUrl: string
  js?: boolean | 'auto'
  refresh?: boolean
  rate?: FetchRateControls
  dependencies: InternalLinksVerificationDependencies
}): Promise<VerifiedInternalLinkTarget> {
  let fetched: PageFetchResult
  try {
    fetched = await input.dependencies.fetch(input.targetUrl, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
      rate: input.rate,
    })
  } catch (error) {
    return {
      requestedUrl: input.targetUrl,
      preferredUrl: input.targetUrl,
      aliases: [input.targetUrl],
      verification: 'failed',
      technicalSignals: [],
      warnings: [
        {
          stage: 'target-fetch',
          url: input.targetUrl,
          code: 'fetch-failed',
          message: errorMessage(error),
        },
      ],
    }
  }

  let page: ExtractedPage
  try {
    page = await input.dependencies.extract(fetched)
  } catch (error) {
    return {
      requestedUrl: input.targetUrl,
      preferredUrl: input.targetUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      aliases: [input.targetUrl],
      verification: 'failed',
      technicalSignals: [],
      fetchDiagnostics: fetched.diagnostics,
      warnings: [
        {
          stage: 'target-extract',
          url: input.targetUrl,
          code: 'extract-failed',
          message: errorMessage(error),
        },
      ],
    }
  }

  const canonical = absoluteCanonical(page)
  const acceptedFinal = acceptedAlias(input.site, page.finalUrl)
  const acceptedCanonical = acceptedAlias(input.site, canonical)
  const aliases = [input.targetUrl, acceptedFinal, acceptedCanonical]
    .filter((url): url is string => Boolean(url))
    .map(withoutFragment)
  const uniqueAliases = [...new Set(aliases)]
  const signals = pageTechnicalSignals({
    url: input.targetUrl,
    page,
    fetchDiagnostics: fetched.diagnostics,
    httpStatus: fetched.status,
  })
  const fatalSignals = signals.filter(
    (signal) => signal !== 'redirected' || !acceptedFinal,
  )
  const warnings = page.warnings.map(
    (message): InternalLinksWarning => ({
      stage: 'target-extract',
      url: input.targetUrl,
      code: 'extractor-warning',
      message,
    }),
  )

  return {
    requestedUrl: input.targetUrl,
    preferredUrl: acceptedFinal ?? input.targetUrl,
    finalUrl: page.finalUrl,
    canonical,
    status: fetched.status,
    aliases: uniqueAliases,
    verification: fatalSignals.length ? 'technical-issue' : 'verified',
    technicalSignals: signals,
    fetchDiagnostics: fetched.diagnostics,
    warnings,
  }
}

function linksToAliases(page: ExtractedPage, aliases: string[]) {
  return page.links.filter((link) =>
    aliases.some((alias) => sameObservedUrl(link.href, alias)),
  )
}

function priority(candidate: InternalLinkCandidate) {
  const score = Math.round(
    candidate.exactQueryMatches * 100 +
      Math.log10(candidate.matchedQueryImpressions + 1) * 10 +
      candidate.bestRelevanceScore * 10,
  )
  return {
    score,
    heuristic: true as const,
    components: {
      exactQueryMatches: candidate.exactQueryMatches,
      matchedQueryImpressions: candidate.matchedQueryImpressions,
      relevanceScore: candidate.bestRelevanceScore,
    },
  }
}

export async function verifyInternalLinkCandidate(input: {
  site: string
  candidate: InternalLinkCandidate
  target: VerifiedInternalLinkTarget
  js?: boolean | 'auto'
  refresh?: boolean
  rate?: FetchRateControls
  dependencies: InternalLinksVerificationDependencies
}): Promise<{
  item?: InternalLinkOpportunity
  exclusion?: 'existing-link' | 'technical' | 'self-alias' | 'failed'
  warnings: InternalLinksWarning[]
}> {
  try {
    assertUrlMatchesGscProperty(input.site, input.candidate.sourceUrl)
  } catch (error) {
    return {
      exclusion: 'failed',
      warnings: [
        {
          stage: 'source-fetch',
          url: input.candidate.sourceUrl,
          code: 'fetch-failed',
          message: errorMessage(error),
        },
      ],
    }
  }

  let fetched: PageFetchResult
  try {
    fetched = await input.dependencies.fetch(input.candidate.sourceUrl, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
      rate: input.rate,
    })
  } catch (error) {
    return {
      exclusion: 'failed',
      warnings: [
        {
          stage: 'source-fetch',
          url: input.candidate.sourceUrl,
          code: 'fetch-failed',
          message: errorMessage(error),
        },
      ],
    }
  }

  let page: ExtractedPage
  try {
    page = await input.dependencies.extract(fetched)
  } catch (error) {
    return {
      exclusion: 'failed',
      warnings: [
        {
          stage: 'source-extract',
          url: input.candidate.sourceUrl,
          code: 'extract-failed',
          message: errorMessage(error),
        },
      ],
    }
  }
  const warnings = page.warnings.map(
    (message): InternalLinksWarning => ({
      stage: 'source-extract',
      url: input.candidate.sourceUrl,
      code: 'extractor-warning',
      message,
    }),
  )
  if (
    input.target.aliases.some((alias) => sameObservedUrl(page.finalUrl, alias))
  ) {
    return { exclusion: 'self-alias', warnings }
  }
  const technicalSignals = pageTechnicalSignals({
    url: input.candidate.sourceUrl,
    page,
    fetchDiagnostics: fetched.diagnostics,
    httpStatus: fetched.status,
  })
  if (technicalSignals.length) {
    return { exclusion: 'technical', warnings }
  }

  const observed = linksToAliases(page, input.target.aliases).map((link) => ({
    href: link.href,
    text: link.text,
    rel: link.rel,
    location: link.location,
  }))
  const contextual = observed.filter((link) => link.location === 'main-content')
  const preferredContextual = contextual.some((link) =>
    sameObservedUrl(link.href, input.target.preferredUrl),
  )
  if (preferredContextual) return { exclusion: 'existing-link', warnings }
  const aliasContextual = contextual.length > 0
  const linkStatus = aliasContextual
    ? 'alias-contextual'
    : observed.length
      ? 'non-contextual-only'
      : 'missing'
  const confidence =
    input.candidate.bestMatchKind === 'exact-query' &&
    !page.contentExtraction.fallback
      ? 'medium'
      : 'low'
  const actionType = aliasContextual
    ? 'review-alias-link'
    : 'review-contextual-link'
  const evidenceRef = aliasContextual
    ? `A main-content link points to a non-preferred target alias; the preferred target is ${input.target.preferredUrl}.`
    : `${input.candidate.sourceUrl} matched ${input.candidate.matchedQueries} retained GSC query row${input.candidate.matchedQueries === 1 ? '' : 's'}, and no main-content link to the preferred target was observed in the fetched HTML.`
  const action = aliasContextual
    ? `Review the existing contextual link and update it to the preferred target ${input.target.preferredUrl} if the redirect or old alias is not intentional.`
    : `Review whether this source page and ${input.target.preferredUrl} serve complementary intent. If the link would help a reader, add a natural main-content link without forcing exact-match anchor text.`

  return {
    item: {
      ...input.candidate,
      finalUrl: page.finalUrl,
      status: fetched.status,
      technicalSignals,
      fetchDiagnostics: fetched.diagnostics,
      pageWarnings: page.warnings,
      actionType,
      linkEvidence: {
        status: linkStatus,
        observedCount: observed.length,
        observedLimit: INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT,
        limitedCount: Math.max(
          0,
          observed.length - INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT,
        ),
        observed: observed.slice(0, INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT),
      },
      confidence,
      priority: priority(input.candidate),
      recommendation: {
        principle: 'C.6',
        evidenceRef,
        action,
        effort: 'S',
        confidence,
      },
    },
    warnings,
  }
}
