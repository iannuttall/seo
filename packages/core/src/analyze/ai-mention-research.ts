import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import type {
  AiMentionEvidence,
  AiMentionMarket,
  AiMentionMetrics,
  AiMentionProvider,
  AiMentionSample,
  ProviderCostEvidence,
  ProviderId,
} from '../providers/contracts.js'
import {
  aiMentionMarketSchema,
  providerIdSchema,
} from '../providers/contracts.js'
import { DataForSeoAiMentionProvider } from '../providers/dataforseo/ai-mentions.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { ProviderError } from '../providers/errors.js'
import type { ProviderCandidate } from '../providers/resolver.js'
import { resolveProvider } from '../providers/resolver.js'
import {
  acquireGscQueries,
  type DomainResearchDependencies,
  normalizeDomain,
} from './domain-research/shared.js'
import {
  canonicalPseoTerm,
  pseoQueryThemeTerms,
} from './pseo/query-insights.js'

const MAX_COMPETITORS = 5
const MAX_ALIASES = 5
const MAX_SAMPLE_LIMIT = 25
const MAX_FIRST_PARTY_MATCHES = 3
const MAX_POSTINGS_PER_TERM = 100
const MAX_PATTERNS = 10

export type AiMentionResearchTargetInput = {
  label: string
  aliases?: string[]
}

export type AiMentionResearchInput = {
  target: AiMentionResearchTargetInput
  competitors?: AiMentionResearchTargetInput[]
  domain?: string
  market: AiMentionMarket
  provider?: ProviderId
  includeSamples?: boolean
  sampleLimit?: number
  site?: string
  days?: number
  projectId?: string
  refresh?: boolean
}

export type AiMentionResearchDependencies = DomainResearchDependencies

type EvidenceState<T> =
  | { status: 'complete' | 'partial' | 'empty'; evidence: T; error: null }
  | {
      status: 'not-requested' | 'unavailable'
      evidence: null
      error: { code: string; message: string } | null
    }

export type AiMentionResearchReport = {
  schemaVersion: 1
  methodology: 'ai_mention_research_v1'
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'empty' | 'unavailable'
  market: AiMentionMarket
  summary: {
    target: string
    competitors: number
    targetMentions: number | null
    comparisonSetMentions: number | null
    targetComparisonShare: number | null
    samples: number
    samplesWithOwnedSource: number
    firstPartyMatches: number
    verdict: string
  }
  source: {
    metrics: EvidenceState<AiMentionEvidence<AiMentionMetrics>>
    samples: EvidenceState<AiMentionEvidence<AiMentionSample[]>>
    firstParty: {
      requested: boolean
      status: 'not-requested' | 'complete' | 'empty' | 'partial'
      site: string | null
      range: { startDate: string; endDate: string } | null
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
  }
  processing: {
    firstPartyRows: number
    firstPartyTermVisits: number
    uniqueFirstPartyTerms: number
    retainedTokenPostings: number
    sampleTermVisits: number
    candidateRowVisits: number
  }
  comparison: Array<{
    label: string
    role: 'target' | 'competitor'
    mentions: number | null
    aiSearchVolume: number | null
    comparisonShare: number | null
    sourceDomains: AiMentionMetrics['targets'][number]['sourceDomains']
  }>
  samples: Array<
    AiMentionSample & {
      ownedSources: string[]
      firstParty: {
        status: 'matched' | 'not-in-retained-rows' | 'not-requested'
        sharedTerms: string[]
        queries: Array<{
          query: string
          clicks: number
          impressions: number
          averagePosition: number | null
          urls: string[]
        }>
      }
    }
  >
  questionPatterns: Array<{
    term: string
    sampleCount: number
    examples: string[]
    firstPartyQueryCount: number
    method: 'bounded_token_overlap_v1'
  }>
  dataSourceBriefs: Array<{
    patternRef: string
    instruction: string
    requiredChecks: string[]
    evidenceBoundary: string
  }>
  cost: ProviderCostEvidence
  findings: Array<{
    code:
      | 'lower-comparison-share'
      | 'owned-source-observed'
      | 'first-party-question-overlap'
      | 'repeated-question-pattern'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function target(
  input: AiMentionResearchTargetInput,
  key: string,
): { key: string; label: string; aliases: string[] } {
  const label = input.label.trim().replace(/\s+/gu, ' ')
  const aliases = [label, ...(input.aliases ?? [])]
    .map((alias) => alias.trim().replace(/\s+/gu, ' '))
    .filter(Boolean)
  const normalized = new Map<string, string>()
  for (const alias of aliases) {
    const identity = alias.toLocaleLowerCase('en-US')
    if (!normalized.has(identity)) normalized.set(identity, alias)
  }
  if (
    !label ||
    label.length > 250 ||
    normalized.size < 1 ||
    normalized.size > MAX_ALIASES ||
    [...normalized.values()].some((alias) => alias.length > 250)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Each AI mention target needs a label and at most ${MAX_ALIASES} unique aliases of 250 characters or fewer.`,
    )
  }
  return {
    key,
    label,
    aliases: [...normalized.values()].sort(compareText),
  }
}

function validateInput(input: AiMentionResearchInput) {
  const market = aiMentionMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid AI mention market.')
  }
  const provider = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (provider && !provider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported research provider.')
  }
  const competitors = input.competitors ?? []
  if (competitors.length > MAX_COMPETITORS) {
    throw new SeoError(
      'INVALID_INPUT',
      `AI mention research supports at most ${MAX_COMPETITORS} competitors.`,
    )
  }
  const primary = target(input.target, 'target')
  const compared = competitors.map((item, index) =>
    target(item, `competitor-${index + 1}`),
  )
  const labels = [primary, ...compared].map((item) =>
    item.label.toLocaleLowerCase('en-US'),
  )
  if (new Set(labels).size !== labels.length) {
    throw new SeoError('INVALID_INPUT', 'Use each comparison label once.')
  }
  const sampleLimit = input.sampleLimit ?? 10
  if (
    !Number.isSafeInteger(sampleLimit) ||
    sampleLimit < 1 ||
    sampleLimit > MAX_SAMPLE_LIMIT
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `AI mention sample limit must be from 1 to ${MAX_SAMPLE_LIMIT}.`,
    )
  }
  const days = input.days ?? 28
  if (!Number.isSafeInteger(days) || days < 1 || days > 548) {
    throw new SeoError(
      'INVALID_INPUT',
      'Search Console days must be a whole number from 1 to 548.',
    )
  }
  const domain = input.domain ? normalizeDomain(input.domain) : undefined
  return {
    market: market.data,
    provider: provider?.data,
    primary,
    competitors: compared,
    sampleLimit,
    includeSamples: input.includeSamples ?? true,
    days,
    domain,
  }
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoAiMentionProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

function aiProvider(
  adapter: ProviderCandidate['adapter'],
): AiMentionProvider | null {
  return 'aiMentionMetrics' in adapter &&
    typeof adapter.aiMentionMetrics === 'function' &&
    'aiMentionSamples' in adapter &&
    typeof adapter.aiMentionSamples === 'function'
    ? (adapter as AiMentionProvider)
    : null
}

function providerFailure(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'configuration') {
    throw new SeoError('INVALID_INPUT', error.message)
  }
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

function providerStatus<
  T extends { coverage: { completeness: string; retainedRows: number | null } },
>(evidence: T): 'complete' | 'partial' | 'empty' {
  if (evidence.coverage.completeness !== 'complete') return 'partial'
  return (evidence.coverage.retainedRows ?? 0) === 0 ? 'empty' : 'complete'
}

function value(field: { state: string; value: number | null }): number | null {
  return field.state === 'observed' ? field.value : null
}

function aggregateCost(
  evidence: Array<AiMentionEvidence<unknown> | null>,
  unknownRequest: boolean,
): ProviderCostEvidence {
  const costs = evidence.flatMap((item) => (item ? [item.cost] : []))
  const taskIds = [...new Set(costs.flatMap((cost) => cost.taskIds))].sort(
    compareText,
  )
  if (unknownRequest) {
    return {
      currency: 'USD',
      estimatedMicros: null,
      actualMicros: null,
      taskIds,
    }
  }
  const estimated = costs.map((cost) => cost.estimatedMicros)
  const actual = costs.map((cost) => cost.actualMicros)
  return {
    currency: 'USD',
    estimatedMicros: estimated.some((item) => item === null)
      ? null
      : estimated.reduce<number>((sum, item) => sum + (item ?? 0), 0),
    actualMicros: actual.some((item) => item === null)
      ? null
      : actual.reduce<number>((sum, item) => sum + (item ?? 0), 0),
    taskIds,
  }
}

function terms(value: string): string[] {
  return [
    ...new Set(
      pseoQueryThemeTerms(value).map(canonicalPseoTerm).filter(Boolean),
    ),
  ].sort(compareText)
}

function firstPartyIndex(rows: Array<{ query: string }>): {
  index: Map<string, number[]>
  visits: number
  retainedPostings: number
} {
  const index = new Map<string, number[]>()
  let visits = 0
  let retainedPostings = 0
  for (const [rowIndex, row] of rows.entries()) {
    for (const term of terms(row.query)) {
      visits += 1
      const postings = index.get(term) ?? []
      if (postings.length < MAX_POSTINGS_PER_TERM) {
        postings.push(rowIndex)
        retainedPostings += 1
      }
      index.set(term, postings)
    }
  }
  return { index, visits, retainedPostings }
}

function ownedSources(
  sample: AiMentionSample,
  domain: string | undefined,
): string[] {
  if (!domain) return []
  return sample.sources
    .filter(
      (source) =>
        source.domain === domain || source.domain.endsWith(`.${domain}`),
    )
    .map((source) => source.url)
    .sort(compareText)
}

function patterns(
  samples: AiMentionResearchReport['samples'],
  firstPartyRows: Array<{ query: string }>,
): AiMentionResearchReport['questionPatterns'] {
  const grouped = new Map<
    string,
    { questions: Set<string>; firstParty: Set<string> }
  >()
  for (const sample of samples) {
    for (const term of terms(sample.question)) {
      const current = grouped.get(term) ?? {
        questions: new Set<string>(),
        firstParty: new Set<string>(),
      }
      current.questions.add(sample.question)
      grouped.set(term, current)
    }
  }
  for (const row of firstPartyRows) {
    for (const term of terms(row.query))
      grouped.get(term)?.firstParty.add(row.query)
  }
  return [...grouped.entries()]
    .filter(([, item]) => item.questions.size >= 2)
    .map(([term, item]) => ({
      term,
      sampleCount: item.questions.size,
      examples: [...item.questions].sort(compareText).slice(0, 3),
      firstPartyQueryCount: item.firstParty.size,
      method: 'bounded_token_overlap_v1' as const,
    }))
    .sort(
      (left, right) =>
        right.sampleCount - left.sampleCount ||
        right.firstPartyQueryCount - left.firstPartyQueryCount ||
        compareText(left.term, right.term),
    )
    .slice(0, MAX_PATTERNS)
}

export async function aiMentionResearchReport(
  input: AiMentionResearchInput,
  dependencies: AiMentionResearchDependencies = {},
): Promise<AiMentionResearchReport> {
  const validated = validateInput(input)
  const now = (dependencies.now ?? (() => new Date()))()
  const firstPartyRows = input.site
    ? await acquireGscQueries({
        site: input.site,
        days: validated.days,
        refresh: input.refresh,
        dependencies,
        now,
      })
    : null
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerFailure(error)
  }
  const resolution = resolveProvider({
    capability: 'ai-mentions',
    market: {
      searchEngine: 'google',
      countryCode: validated.market.countryCode,
      languageCode: validated.market.languageCode,
      location: validated.market.location,
    },
    candidates,
    provider: validated.provider,
  })
  if (resolution.status === 'unavailable') {
    throw new SeoError(
      resolution.reason === 'market-not-supported'
        ? 'INVALID_INPUT'
        : 'PROVIDER_UNAVAILABLE',
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can research AI mentions. Run `seo providers dataforseo connect` first.'
        : 'No configured provider can research AI mentions for this market.',
    )
  }
  const provider = aiProvider(resolution.provider)
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider has no AI mention research implementation.',
    )
  }
  const reportRunId = randomUUID()
  const request = {
    target: validated.primary,
    competitors: validated.competitors,
    domain: validated.domain,
    market: validated.market,
    sampleLimit: validated.sampleLimit,
    refresh: input.refresh,
    context: {
      projectId: input.projectId,
      reportId: 'ai-mention-research',
      reportRunId,
    },
  }
  let metricsEvidence: AiMentionEvidence<AiMentionMetrics>
  try {
    metricsEvidence = await provider.aiMentionMetrics(request)
  } catch (error) {
    return providerFailure(error)
  }
  const metrics: AiMentionResearchReport['source']['metrics'] = {
    status: providerStatus(metricsEvidence),
    evidence: metricsEvidence,
    error: null,
  }
  let sampleSource: AiMentionResearchReport['source']['samples'] = {
    status: 'not-requested',
    evidence: null,
    error: null,
  }
  let sampleRequestFailed = false
  if (validated.includeSamples) {
    try {
      const evidence = await provider.aiMentionSamples(request)
      sampleSource = {
        status: providerStatus(evidence),
        evidence,
        error: null,
      }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error
      if (
        [
          'configuration',
          'authentication',
          'budget-limit',
          'rate-limit',
        ].includes(error.code)
      ) {
        return providerFailure(error)
      }
      sampleRequestFailed = true
      sampleSource = {
        status: 'unavailable',
        evidence: null,
        error: { code: error.code, message: error.message },
      }
    }
  }
  const metricRows = metricsEvidence.data.targets
  const totalMentions = metricRows.every((row) => value(row.mentions) !== null)
    ? metricRows.reduce((sum, row) => sum + (value(row.mentions) ?? 0), 0)
    : null
  const comparison = metricRows.map((row, index) => {
    const mentions = value(row.mentions)
    return {
      label: row.target.label,
      role: index === 0 ? ('target' as const) : ('competitor' as const),
      mentions,
      aiSearchVolume: value(row.aiSearchVolume),
      comparisonShare:
        totalMentions !== null && totalMentions > 0 && mentions !== null
          ? mentions / totalMentions
          : null,
      sourceDomains: row.sourceDomains,
    }
  })
  const sourceSamples = sampleSource.evidence?.data ?? []
  const retainedRows = firstPartyRows?.rows ?? []
  const index = firstPartyIndex(retainedRows)
  let sampleTermVisits = 0
  let candidateRowVisits = 0
  const samples = sourceSamples.map((sample) => {
    const questionTerms = terms(sample.question)
    sampleTermVisits += questionTerms.length
    const sharedTerms = questionTerms.filter((term) => index.index.has(term))
    const candidateRows = new Set<number>()
    for (const term of sharedTerms) {
      for (const rowIndex of index.index.get(term) ?? []) {
        candidateRowVisits += 1
        candidateRows.add(rowIndex)
      }
    }
    const matches = [...candidateRows]
      .flatMap((rowIndex) => {
        const row = retainedRows[rowIndex]
        if (!row) return []
        const overlap = terms(row.query).filter((term) =>
          questionTerms.includes(term),
        ).length
        return overlap > 0 ? [{ row, overlap }] : []
      })
      .sort(
        (left, right) =>
          right.overlap - left.overlap ||
          right.row.impressions - left.row.impressions ||
          compareText(left.row.query, right.row.query),
      )
      .slice(0, MAX_FIRST_PARTY_MATCHES)
      .map(({ row }) => row)
    return {
      ...sample,
      ownedSources: ownedSources(sample, validated.domain),
      firstParty: {
        status: !firstPartyRows
          ? ('not-requested' as const)
          : matches.length > 0
            ? ('matched' as const)
            : ('not-in-retained-rows' as const),
        sharedTerms,
        queries: matches,
      },
    }
  })
  const questionPatterns = patterns(samples, retainedRows)
  const targetRow = comparison[0]
  const samplesWithOwnedSource = samples.filter(
    (sample) => sample.ownedSources.length > 0,
  ).length
  const firstPartyMatches = samples.filter(
    (sample) => sample.firstParty.status === 'matched',
  ).length
  const targetShare = targetRow?.comparisonShare
  const findings: AiMentionResearchReport['findings'] = []
  if (
    targetRow &&
    targetShare !== null &&
    targetShare !== undefined &&
    comparison.some(
      (row) =>
        row.role === 'competitor' &&
        row.comparisonShare !== null &&
        row.comparisonShare > targetShare,
    )
  ) {
    findings.push({
      code: 'lower-comparison-share',
      evidenceRefs: ['comparison'],
      detail: `${targetRow.label} has a lower mention share than at least one supplied competitor within this provider dataset and exact market.`,
      action:
        'Review the compared source domains and example questions before choosing a content or distribution response.',
    })
  }
  if (samplesWithOwnedSource > 0) {
    findings.push({
      code: 'owned-source-observed',
      evidenceRefs: samples.flatMap((sample, index) =>
        sample.ownedSources.length > 0
          ? [`samples[${index}].ownedSources`]
          : [],
      ),
      detail: `${samplesWithOwnedSource} retained sample${samplesWithOwnedSource === 1 ? '' : 's'} cited the supplied domain or one of its subdomains.`,
      action:
        'Inspect those cited pages and keep the exact questions as verification cases for later prompt observations.',
    })
  }
  if (firstPartyMatches > 0) {
    findings.push({
      code: 'first-party-question-overlap',
      evidenceRefs: samples.flatMap((sample, index) =>
        sample.firstParty.status === 'matched'
          ? [`samples[${index}].firstParty`]
          : [],
      ),
      detail: `${firstPartyMatches} retained AI question sample${firstPartyMatches === 1 ? '' : 's'} had bounded lexical overlap with retained Search Console queries.`,
      action:
        'Review the existing landing pages before treating those questions as content gaps.',
    })
  }
  for (const [patternIndex, pattern] of questionPatterns
    .slice(0, 3)
    .entries()) {
    findings.push({
      code: 'repeated-question-pattern',
      evidenceRefs: [`questionPatterns[${patternIndex}]`],
      detail: `${pattern.term} appears in ${pattern.sampleCount} retained AI question samples.`,
      action:
        'Check whether the questions share intent and whether an existing page or template already answers them before planning new coverage.',
    })
  }
  const dataStatus: AiMentionResearchReport['dataStatus'] =
    metrics.status === 'partial' ||
    sampleSource.status === 'partial' ||
    sampleSource.status === 'unavailable' ||
    firstPartyRows?.possiblyTruncated
      ? 'partial'
      : metrics.status === 'empty' && samples.length === 0
        ? 'empty'
        : 'complete'
  const cost = aggregateCost(
    [metricsEvidence, sampleSource.evidence],
    sampleRequestFailed,
  )
  return {
    schemaVersion: 1,
    methodology: 'ai_mention_research_v1',
    generatedAt: now.toISOString(),
    dataStatus,
    market: validated.market,
    summary: {
      target: validated.primary.label,
      competitors: validated.competitors.length,
      targetMentions: targetRow?.mentions ?? null,
      comparisonSetMentions: totalMentions,
      targetComparisonShare: targetRow?.comparisonShare ?? null,
      samples: samples.length,
      samplesWithOwnedSource,
      firstPartyMatches,
      verdict:
        metrics.status === 'empty' && samples.length === 0
          ? 'The provider returned no retained mention metrics or samples for this target, surface, and market.'
          : `${targetRow?.mentions ?? 'Unknown'} provider-indexed mentions and ${samples.length} bounded question sample${samples.length === 1 ? '' : 's'} were retained for ${validated.primary.label}.`,
    },
    source: {
      metrics,
      samples: sampleSource,
      firstParty: {
        requested: Boolean(input.site),
        status: !firstPartyRows
          ? 'not-requested'
          : firstPartyRows.possiblyTruncated
            ? 'partial'
            : firstPartyRows.rows.length > 0
              ? 'complete'
              : 'empty',
        site: input.site ?? null,
        range: firstPartyRows?.range ?? null,
        rowsFetched: firstPartyRows?.rowsFetched ?? 0,
        calls: firstPartyRows?.calls ?? 0,
        maxRows: firstPartyRows?.maxRows ?? 0,
        possiblyTruncated: firstPartyRows?.possiblyTruncated ?? false,
      },
    },
    processing: {
      firstPartyRows: retainedRows.length,
      firstPartyTermVisits: index.visits,
      uniqueFirstPartyTerms: index.index.size,
      retainedTokenPostings: index.retainedPostings,
      sampleTermVisits,
      candidateRowVisits,
    },
    comparison,
    samples,
    questionPatterns,
    dataSourceBriefs: questionPatterns.slice(0, 5).map((pattern, index) => ({
      patternRef: `questionPatterns[${index}]`,
      instruction: `Research authoritative and legally usable data sources for questions around ${pattern.term} before designing or expanding a programmatic template.`,
      requiredChecks: [
        'Record stable identifiers, fields, units, geographic coverage, update frequency, and missing-value behavior.',
        'Confirm access rights, attribution, rate limits, acquisition bounds, cache retention, and expected local storage growth.',
        'Define what makes each page useful and distinct beyond changing a question, keyword, or place name.',
        'Test representative, sparse, duplicate, stale, and malformed records before increasing page count.',
      ],
      evidenceBoundary:
        'This brief comes from repeated terms in a bounded provider sample. It does not prove shared intent, demand, data availability, page quality, or that a template should be built.',
    })),
    cost,
    findings,
    caveats: [
      'These are provider-indexed AI mention records for one surface, location, and language. They are not a complete census and they are not a live prompt result.',
      'Mention counts and AI search volume are provider metrics. They do not prove referral traffic, sentiment, citation quality, rankings, or future visibility.',
      'Comparison share is calculated only across the supplied targets in this returned dataset. It is not a universal visibility score.',
      'Search Console overlap is a bounded lexical heuristic. A missing match can reflect anonymized queries, filters, the date range, or row caps, and a match does not prove shared intent.',
      'Repeated question terms and data-source briefs are research prompts. Inspect current results, existing pages, source rights, and useful page variation before creating programmatic pages.',
    ],
    nextSteps: [
      'Review the exact market, source coverage, cache state, cost, and warnings before interpreting mention differences.',
      'Inspect retained questions and cited pages, then compare them with existing first-party landing pages where Search Console evidence is available.',
      'Use a fixed prompt observation report for a small set of important questions when a current, repeatable answer check would affect the decision.',
    ],
  }
}
