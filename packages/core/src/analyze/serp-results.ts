import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import type {
  ProviderEvidence,
  ProviderId,
  ProviderRequestContext,
  SearchMarket,
  SerpSnapshot,
  SerpSnapshotProvider,
} from '../providers/contracts.js'
import { providerIdSchema, searchMarketSchema } from '../providers/contracts.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { DataForSeoSerpSnapshotProvider } from '../providers/dataforseo/serp-snapshot.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../providers/resolver.js'

const MAX_REPORT_DEPTH = 100

export type SerpDomainSummary = {
  domain: string
  resultCount: number
  ranks: number[]
}

export type SerpResultFinding = {
  code: 'query-correction' | 'repeated-domain'
  evidenceRef: string
  principle: string
  detail: string
}

export type SerpResultsReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  market: SearchMarket
  summary: {
    keyword: string
    effectiveKeyword: string
    requestedDepth: number
    organicResults: number
    localPackResults: number
    uniqueDomains: number
    observedFeatures: number
    correctedQuery: boolean
    verdict: string
  }
  evidence: ProviderEvidence<SerpSnapshot>
  domains: SerpDomainSummary[]
  findings: SerpResultFinding[]
  caveats: string[]
  nextSteps: string[]
}

export type SerpResultsReportDependencies = {
  candidates?: readonly ProviderCandidate[]
  now?: () => Date
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function snapshotProvider(
  candidate: ProviderCandidate['adapter'],
): SerpSnapshotProvider | null {
  return 'serpSnapshot' in candidate &&
    typeof candidate.serpSnapshot === 'function'
    ? (candidate as SerpSnapshotProvider)
    : null
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoSerpSnapshotProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

function providerError(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  if (error.code === 'configuration') {
    throw new SeoError('INVALID_INPUT', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

function validateInput(input: {
  keyword: string
  market: SearchMarket
  depth: number
  provider?: ProviderId
}) {
  const keyword = input.keyword.trim().replace(/\s+/gu, ' ')
  if (!keyword || keyword.length > 80 || keyword.split(/\s+/u).length > 10) {
    throw new SeoError(
      'INVALID_INPUT',
      'SERP results requires a keyword of at most 80 characters and 10 words.',
    )
  }
  if (
    !Number.isSafeInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > MAX_REPORT_DEPTH
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `SERP result depth must be from 1 to ${MAX_REPORT_DEPTH}.`,
    )
  }
  const market = searchMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid search market.')
  }
  const provider = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (provider && !provider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported SERP provider.')
  }
  return { keyword, market: market.data, provider: provider?.data }
}

function reportStatus(
  evidence: ProviderEvidence<SerpSnapshot>,
): SerpResultsReport['dataStatus'] {
  if (
    evidence.coverage.completeness === 'unavailable' ||
    evidence.coverage.completeness === 'invalid'
  ) {
    return 'unavailable'
  }
  return evidence.coverage.completeness === 'complete' ? 'complete' : 'partial'
}

function domainSummaries(snapshot: SerpSnapshot): SerpDomainSummary[] {
  const byDomain = new Map<string, number[]>()
  for (const result of snapshot.organicResults) {
    byDomain.set(result.domain, [
      ...(byDomain.get(result.domain) ?? []),
      result.rankAbsolute,
    ])
  }
  return [...byDomain.entries()]
    .map(([domain, ranks]) => ({
      domain,
      resultCount: ranks.length,
      ranks: [...ranks].sort((left, right) => left - right),
    }))
    .sort(
      (left, right) =>
        right.resultCount - left.resultCount ||
        (left.ranks[0] ?? Number.MAX_SAFE_INTEGER) -
          (right.ranks[0] ?? Number.MAX_SAFE_INTEGER) ||
        compareCodepoints(left.domain, right.domain),
    )
}

function reportFindings(
  snapshot: SerpSnapshot,
  domains: SerpDomainSummary[],
): SerpResultFinding[] {
  const findings: SerpResultFinding[] = []
  if (snapshot.effectiveKeyword !== snapshot.keyword) {
    findings.push({
      code: 'query-correction',
      evidenceRef: 'evidence.data.effectiveKeyword',
      principle:
        'A corrected query changes the observed result context and does not prove the original wording has the same intent.',
      detail: `The provider observed results for ${snapshot.effectiveKeyword} after the requested query ${snapshot.keyword}.`,
    })
  }
  for (const [index, domain] of domains.entries()) {
    if (domain.resultCount <= 1) continue
    findings.push({
      code: 'repeated-domain',
      evidenceRef: `domains[${index}]`,
      principle:
        'Repeated results are descriptive snapshot evidence, not a domain strength or quality score.',
      detail: `${domain.domain} appears ${domain.resultCount} times at absolute ranks ${domain.ranks.join(', ')}.`,
    })
  }
  return findings.slice(0, 10)
}

export async function serpResultsReport(
  input: {
    keyword: string
    market: SearchMarket
    depth?: number
    provider?: ProviderId
    projectId?: string
    context?: Partial<ProviderRequestContext>
    refresh?: boolean
  },
  dependencies: SerpResultsReportDependencies = {},
): Promise<SerpResultsReport> {
  const depth = input.depth ?? 10
  const validated = validateInput({ ...input, depth })
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerError(error)
  }
  const resolution = resolveProvider({
    capability: 'serp-snapshot',
    market: validated.market,
    candidates,
    provider: validated.provider,
  })
  if (resolution.status === 'unavailable') {
    const message =
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can return live SERP results. Run `seo providers dataforseo connect` first.'
        : validated.provider
          ? `${validated.provider} cannot return live SERP results for this market.`
          : 'No configured provider can return live SERP results for this market.'
    throw new SeoError('PROVIDER_UNAVAILABLE', message)
  }
  const provider = snapshotProvider(resolution.provider)
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider has no live SERP implementation.',
    )
  }

  let evidence: ProviderEvidence<SerpSnapshot>
  try {
    evidence = await provider.serpSnapshot({
      keyword: validated.keyword,
      market: validated.market,
      depth,
      refresh: input.refresh,
      context: {
        projectId: input.context?.projectId ?? input.projectId,
        reportId: input.context?.reportId ?? 'serp-results',
        reportRunId: input.context?.reportRunId ?? randomUUID(),
      },
    })
  } catch (error) {
    return providerError(error)
  }

  const domains = domainSummaries(evidence.data)
  const dataStatus = reportStatus(evidence)
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const correctedQuery =
    evidence.data.effectiveKeyword !== evidence.data.keyword

  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus,
    market: evidence.market,
    summary: {
      keyword: evidence.data.keyword,
      effectiveKeyword: evidence.data.effectiveKeyword,
      requestedDepth: depth,
      organicResults: evidence.data.organicResults.length,
      localPackResults: evidence.data.localPack.results.length,
      uniqueDomains: domains.length,
      observedFeatures: evidence.data.features.length,
      correctedQuery,
      verdict: `${evidence.data.organicResults.length} organic results across ${domains.length} domains and ${evidence.data.localPack.results.length} local-pack listings were retained from the ${evidence.market.device ?? 'desktop'} snapshot.`,
    },
    evidence,
    domains,
    findings: reportFindings(evidence.data, domains),
    caveats: [
      'This is one market, location, language, and device-specific result snapshot; it is not rank history.',
      "Search results can change between checks and may differ from a person's signed-in or personalized results.",
      'Local-pack listings are observations from this result snapshot. They do not prove listing ownership, completeness, or Google Business Profile performance.',
      'The provider result count is an estimate and may be missing; retained organic rows are bounded by the requested depth.',
      'Repeated domains, result features, titles, and snippets do not establish content quality, authority, or ranking feasibility.',
    ],
    nextSteps: [
      'Review the retained pages and result types before deciding whether the query fits an existing page, a new page, or no page.',
      'Keep Search Console average position separate from these exact snapshot ranks when comparing first-party performance.',
      'Repeat the same market and device check later if the decision depends on result stability.',
    ],
  }
}
