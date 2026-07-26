import { randomUUID } from 'node:crypto'
import type { ProviderCostEvidence } from '../../providers/contracts.js'
import { aggregatePseoExternalCost } from '../pseo-opportunities/external-common.js'
import type {
  PseoPatternKeywordEvidence,
  PseoPatternsInput,
  PseoPatternsReport,
} from '../pseo-pattern-contract.js'
import {
  enrichPseoPatternCandidates,
  observedPseoPatternQueries,
  observedPseoPatterns,
  pseoPatternDetailBudget,
  pseoPatternFindings,
  pseoPatternTemplateSummaries,
} from './analysis.js'
import { PSEO_PATTERN_CATALOG } from './catalog.js'
import {
  acquirePseoPatternKeywordMetrics,
  acquirePseoPatternSerps,
  type PseoPatternExternalDependencies,
} from './external.js'
import { pseoPatternsFirstPartyReport } from './first-party.js'
import { generatePseoPatternCandidates } from './generator.js'
import { PSEO_PATTERN_LIMITS, validatePseoPatternsInput } from './input.js'

export type PseoPatternsDependencies = PseoPatternExternalDependencies & {
  firstPartyReport?: typeof pseoPatternsFirstPartyReport
}

function emptyKeywordEvidence(): PseoPatternKeywordEvidence {
  return {
    requested: false,
    status: 'not-requested',
    acquisition: null,
    availableKeywords: 0,
    selectedKeywords: 0,
    omittedKeywords: 0,
    rows: [],
    reason: 'External keyword metrics have not been acquired.',
  }
}

function reportWarnings(input: {
  firstParty: Awaited<ReturnType<typeof pseoPatternsFirstPartyReport>>
  keywordMetrics: PseoPatternKeywordEvidence
  serps: Awaited<ReturnType<typeof acquirePseoPatternSerps>>
}): string[] {
  const warnings = [
    ...input.firstParty.audit.warnings,
    ...(input.keywordMetrics.acquisition?.warnings.map(
      (warning) => warning.message,
    ) ?? []),
    ...input.serps.observations.flatMap(
      (observation) =>
        observation.acquisition?.warnings.map((warning) => warning.message) ??
        [],
    ),
  ]
  if (
    input.keywordMetrics.reason &&
    input.keywordMetrics.status === 'unavailable'
  ) {
    warnings.push(input.keywordMetrics.reason)
  }
  for (const observation of input.serps.observations) {
    if (observation.reason) warnings.push(observation.reason)
  }
  return [...new Set(warnings)]
}

function reportStatus(input: {
  firstParty: Awaited<ReturnType<typeof pseoPatternsFirstPartyReport>>
  plannedTopics: number
  returnedTopics: number
  observedPatternsAvailable: number
  observedPatternsReturned: number
  observedQueriesAvailable: number
  observedQueriesReturned: number
  keywordMetrics: PseoPatternKeywordEvidence
  serps: Awaited<ReturnType<typeof acquirePseoPatternSerps>>
  hasEvidence: boolean
}): PseoPatternsReport['dataStatus'] {
  if (!input.hasEvidence) {
    return input.firstParty.audit.dataStatus === 'filtered'
      ? 'filtered'
      : 'empty'
  }
  const externalPartial =
    ['partial', 'unavailable'].includes(input.keywordMetrics.status) ||
    input.serps.observations.some((observation) =>
      ['partial', 'unavailable', 'not-attempted'].includes(observation.status),
    )
  const boundedSubset =
    input.plannedTopics > input.returnedTopics ||
    input.observedPatternsAvailable > input.observedPatternsReturned ||
    input.observedQueriesAvailable > input.observedQueriesReturned
  if (
    input.firstParty.audit.dataStatus === 'partial' ||
    externalPartial ||
    boundedSubset
  ) {
    return 'partial'
  }
  return 'complete'
}

function reportVerdict(input: {
  observedPatterns: number
  availableObservedPatterns: number
  observedQueries: number
  availableObservedQueries: number
  plannedTopics: number
  returnedTopics: number
  existingTopics: number
  strategicGaps: number
  searchEvidencedGaps: number
}): string {
  if (input.plannedTopics > 0) {
    return `${input.returnedTopics} of ${input.plannedTopics} declared topics were reviewed: ${input.existingTopics} match retained inventory, ${input.strategicGaps} are complete-set gaps, and ${input.searchEvidencedGaps} are evidence-led gaps.`
  }
  if (input.observedPatterns > 0) {
    return `${input.observedPatterns} of ${input.availableObservedPatterns} pattern aggregates and ${input.observedQueries} of ${input.availableObservedQueries} exact pattern queries were returned. Add a bounded pattern set when you need an explicit coverage check.`
  }
  return 'No repeatable pattern query was retained in the selected Search Console rows.'
}

export async function pseoPatternsReport(
  input: PseoPatternsInput,
  dependencies: PseoPatternsDependencies = {},
): Promise<PseoPatternsReport> {
  const options = validatePseoPatternsInput(input)
  const runId = randomUUID()
  const firstParty = await (
    dependencies.firstPartyReport ?? pseoPatternsFirstPartyReport
  )(options)
  const observedPatternResult = observedPseoPatterns(
    firstParty.queryRows,
    PSEO_PATTERN_LIMITS.observedPatterns,
  )
  const observedPatterns = observedPatternResult.patterns
  const observedQueryResult = observedPseoPatternQueries({
    rows: firstParty.queryRows,
    limit: options.observedQueryLimit,
  })
  const generated = generatePseoPatternCandidates({
    sets: options.patternSets,
    limit: options.candidateLimit,
  })
  const initialCandidates = enrichPseoPatternCandidates({
    generated: generated.candidates,
    patternSets: generated.patternSets,
    queryRows: firstParty.queryRows,
    discoveredUrls: firstParty.discoveredUrls,
    keywordMetrics: emptyKeywordEvidence(),
    serps: [],
  })
  const keywordMetrics = await acquirePseoPatternKeywordMetrics({
    options,
    candidates: initialCandidates.candidates,
    observedQueries: observedQueryResult.queries,
    runId,
    report: dependencies.keywordMetricsReport,
  })
  const serps = await acquirePseoPatternSerps({
    options,
    candidates: initialCandidates.candidates,
    observedQueries: observedQueryResult.queries,
    runId,
    report: dependencies.serpResultsReport,
  })
  const enriched = enrichPseoPatternCandidates({
    generated: generated.candidates,
    patternSets: generated.patternSets,
    queryRows: firstParty.queryRows,
    discoveredUrls: firstParty.discoveredUrls,
    keywordMetrics,
    serps: serps.observations,
  })
  const templates = pseoPatternTemplateSummaries(firstParty)
  const findings = pseoPatternFindings({
    observedPatterns,
    candidates: enriched.candidates,
  })
  const plannedTopics = enriched.patternSets.reduce(
    (sum, set) => sum + set.plannedTopics,
    0,
  )
  const returnedTopics = enriched.candidates.length
  const existingTopics = enriched.candidates.filter((candidate) =>
    ['existing', 'several-existing'].includes(candidate.inventory.state),
  ).length
  const strategicGaps = enriched.candidates.filter(
    (candidate) => candidate.review.state === 'strategic-gap',
  ).length
  const searchEvidencedGaps = enriched.candidates.filter(
    (candidate) => candidate.review.state === 'search-evidenced-gap',
  ).length
  const costs: ProviderCostEvidence[] = [
    ...(keywordMetrics.acquisition ? [keywordMetrics.acquisition.cost] : []),
    ...serps.observations.flatMap((observation) =>
      observation.acquisition ? [observation.acquisition.cost] : [],
    ),
  ]
  const warnings = reportWarnings({ firstParty, keywordMetrics, serps })
  const source: PseoPatternsReport['source'] = {
    searchConsole: {
      pageRows: firstParty.audit.source.searchAnalytics.pageRows,
      queryPageRows: firstParty.audit.source.searchAnalytics.queryPageRows,
      maxRowsPerRequest:
        firstParty.audit.source.searchAnalytics.maxRowsPerRequest,
      pageRowsPossiblyTruncated:
        firstParty.audit.source.searchAnalytics.pageRowsPossiblyTruncated,
      queryPageRowsPossiblyTruncated:
        firstParty.audit.source.searchAnalytics.queryPageRowsPossiblyTruncated,
      retainedQueryPageRows: firstParty.audit.selection.retainedQueryPageRows,
      dimensions: firstParty.audit.source.searchAnalytics.dimensions,
      searchType: firstParty.audit.source.searchAnalytics.searchType,
      dataState: firstParty.audit.source.searchAnalytics.dataState,
      aggregation: firstParty.audit.source.searchAnalytics.aggregation,
    },
    inventory: {
      sitemapUrls: firstParty.audit.summary.sitemapUrls,
      discoveredUrls: firstParty.discoveredUrls.length,
      sitemapsRequested: firstParty.audit.source.sitemaps.requested,
      maxUrlsPerSitemap: firstParty.audit.source.sitemaps.maxUrlsPerSitemap,
    },
    external: {
      keywordMetrics,
      serps,
      cost: aggregatePseoExternalCost(costs),
    },
  }
  const selection: PseoPatternsReport['selection'] = {
    patternSetLimit: PSEO_PATTERN_LIMITS.patternSets,
    candidateLimit: options.candidateLimit,
    observedPatternLimit: PSEO_PATTERN_LIMITS.observedPatterns,
    observedQueryLimit: options.observedQueryLimit,
    keywordLimit: options.keywordLimit,
    serpLimit: options.serpLimit,
    serpDepth: options.serpDepth,
    returnedObservedPatterns: observedPatterns.length,
    availableObservedPatterns: observedPatternResult.available,
    omittedObservedPatterns: Math.max(
      0,
      observedPatternResult.available - observedPatterns.length,
    ),
    returnedObservedQueries: observedQueryResult.queries.length,
    availableObservedQueries: observedQueryResult.available,
    omittedObservedQueries: Math.max(
      0,
      observedQueryResult.available - observedQueryResult.queries.length,
    ),
    candidateOrder: 'review-state-first-party-impressions-codepoint-id-v1',
    observedPatternOrder:
      'recognized-first-impressions-clicks-codepoint-label-v1',
    observedQueryOrder: 'impressions-clicks-codepoint-query-v1',
  }
  const summary: PseoPatternsReport['summary'] = {
    observedPatterns: observedPatterns.length,
    availableObservedPatterns: observedPatternResult.available,
    observedPatternQueries: observedQueryResult.queries.length,
    availableObservedPatternQueries: observedQueryResult.available,
    declaredPatternSets: enriched.patternSets.length,
    plannedTopics,
    returnedTopics,
    existingTopics,
    strategicGaps,
    searchEvidencedGaps,
    keywordMetrics: keywordMetrics.rows.length,
    serpSnapshots: serps.completedQueries,
    verdict: reportVerdict({
      observedPatterns: observedPatterns.length,
      availableObservedPatterns: observedPatternResult.available,
      observedQueries: observedQueryResult.queries.length,
      availableObservedQueries: observedQueryResult.available,
      plannedTopics,
      returnedTopics,
      existingTopics,
      strategicGaps,
      searchEvidencedGaps,
    }),
  }
  const dataStatus = reportStatus({
    firstParty,
    plannedTopics,
    returnedTopics,
    observedPatternsAvailable: observedPatternResult.available,
    observedPatternsReturned: observedPatterns.length,
    observedQueriesAvailable: observedQueryResult.available,
    observedQueriesReturned: observedQueryResult.queries.length,
    keywordMetrics,
    serps,
    hasEvidence:
      observedPatterns.length > 0 || templates.length > 0 || returnedTopics > 0,
  })
  const reportWithoutBudget = {
    schemaVersion: 1 as const,
    methodology: 'pseo_patterns_v1' as const,
    site: options.site,
    generatedAt: firstParty.audit.generatedAt,
    range: firstParty.audit.range,
    dataStatus,
    market: options.market ?? null,
    summary,
    source,
    selection,
    catalog: [...PSEO_PATTERN_CATALOG],
    observedPatterns,
    observedQueries: observedQueryResult.queries,
    templates,
    patternSets: enriched.patternSets,
    candidates: enriched.candidates,
    findings,
    warnings,
    caveats: [
      'Search Console rows are first-party evidence for the selected property and date range. Anonymized queries and bounded row retrieval mean a query absent from retained rows is not a definitive zero.',
      'Pattern classification and learned themes are lexical heuristics. They organize retained wording but do not prove shared intent, page quality, or that a template should exist.',
      'Declared query variants use exact normalized matching against retained Search Console queries. Similar wording that was not declared remains outside each candidate match.',
      'Complete-set coverage is a caller-supplied product decision. A strategic gap does not claim search demand, traffic, ranking impact, or a search-engine requirement.',
      'Existing-page checks use the supplied sitemap URLs and retained Search Console pages. A missing path can still exist outside that bounded inventory.',
      'Keyword volume, difficulty, intent, and result counts remain provider estimates. They do not replace Search Console evidence or decide whether a strategic comparison belongs in the product.',
      'Each live result is one market, language, device, location, and observation time. It is intent context, not a ranking-feasibility score.',
      'A retained topic still needs useful data, a working utility, or distinct editorial value. Swapping variables into repeated copy is not supported by this report.',
    ],
    nextSteps: [
      options.patternSets.length
        ? 'Review strategic gaps, search-evidenced gaps, and existing topics separately. Confirm the intended coverage policy before changing inventory.'
        : 'Use the observed patterns and exact retained queries to define one small term, pair, or matrix set when an explicit coverage check would help.',
      options.includeExternal
        ? 'Inspect provider value states, source coverage, cost, and the retained result snapshots before using external evidence.'
        : 'Enable external research with an explicit market and small limits only when independent estimates or current results would change the decision.',
      'Run pseo-audit with representative crawl and index samples before changing an existing page generator.',
      'For a new family, verify stable identifiers, required fields, source rights, freshness, missing-value rules, bounded inventory, duplicate prevention, crawl controls, canonicals, and internal links before implementation.',
    ],
  }
  const detailBudget = pseoPatternDetailBudget({
    report: reportWithoutBudget,
    limit: PSEO_PATTERN_LIMITS.synthesisRows,
  })
  return { ...reportWithoutBudget, detailBudget }
}
