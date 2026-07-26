import {
  normalizePseoText,
  pseoQueryPatternKind,
  pseoQueryPatternLabel,
  pseoQueryPatternResult,
} from '../pseo/query-insights.js'
import { comparePseoText } from '../pseo/row-analysis.js'
import type { PseoQueryPageRow } from '../pseo/types.js'
import type {
  PseoObservedPattern,
  PseoObservedPatternQuery,
  PseoPatternCandidate,
  PseoPatternFinding,
  PseoPatternKeywordEvidence,
  PseoPatternSerpObservation,
  PseoPatternSetSummary,
  PseoPatternsReport,
  PseoPatternTemplateSummary,
} from '../pseo-pattern-contract.js'
import type { PseoPatternsFirstPartyEvidence } from './first-party.js'
import type {
  GeneratedPseoPatternCandidate,
  GeneratedPseoPatternSet,
} from './generator.js'

type QueryAggregate = {
  query: string
  clicks: number
  impressions: number
  weightedPosition: number
  pages: Set<string>
}

function rounded(value: number, precision = 4): number {
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function metrics(input: {
  clicks: number
  impressions: number
  weightedPosition: number
}) {
  return {
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.impressions
      ? input.weightedPosition / input.impressions
      : 0,
  }
}

function aggregateQueries(
  rows: PseoQueryPageRow[],
): Map<string, QueryAggregate> {
  const byQuery = new Map<string, QueryAggregate>()
  for (const row of rows) {
    const key = normalizePseoText(row.query)
    const existing = byQuery.get(key) ?? {
      query: row.query,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      pages: new Set<string>(),
    }
    existing.query =
      comparePseoText(existing.query, row.query) <= 0
        ? existing.query
        : row.query
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    existing.weightedPosition += row.position * row.impressions
    existing.pages.add(row.page)
    byQuery.set(key, existing)
  }
  return byQuery
}

export function observedPseoPatterns(
  rows: PseoQueryPageRow[],
  limit: number,
): { available: number; patterns: PseoObservedPattern[] } {
  const result = pseoQueryPatternResult(rows, {
    limit,
    preferRecognized: true,
  })
  return {
    available: result.available,
    patterns: result.patterns.map((pattern, index) => ({
      kind: pattern.kind,
      label: pattern.label,
      heuristic: true,
      queryCount: pattern.queryCount,
      pageCount: pattern.pageCount,
      clicks: pattern.clicks,
      impressions: pattern.impressions,
      ctr: pattern.impressions ? pattern.clicks / pattern.impressions : 0,
      position: rounded(pattern.position),
      examples: pattern.examples,
      evidenceRef: `observedPatterns[${index}]`,
    })),
  }
}

export function observedPseoPatternQueries(input: {
  rows: PseoQueryPageRow[]
  limit: number
}): {
  available: number
  queries: PseoObservedPatternQuery[]
} {
  const queries = [...aggregateQueries(input.rows).values()]
    .flatMap((query) => {
      const kind = pseoQueryPatternKind(query.query)
      if (kind === 'general') return []
      const pageList = [...query.pages].sort(comparePseoText)
      return [
        {
          query: query.query,
          kind,
          patternLabel: pseoQueryPatternLabel(kind),
          heuristic: true as const,
          ...metrics(query),
          pageCount: pageList.length,
          samplePages: pageList.slice(0, 5),
          evidenceRef: '',
        },
      ]
    })
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        right.clicks - left.clicks ||
        comparePseoText(left.query, right.query),
    )
  return {
    available: queries.length,
    queries: queries.slice(0, input.limit).map((query, index) => ({
      ...query,
      evidenceRef: `observedQueries[${index}]`,
    })),
  }
}

function normalizedPath(value: string): string | null {
  try {
    const path = new URL(value).pathname.replace(/\/+$/u, '') || '/'
    return path
  } catch {
    return null
  }
}

function candidateReview(
  candidate: Omit<PseoPatternCandidate, 'review'>,
  exactQueryPages: string[],
  matchedInventoryUrls: string[],
): PseoPatternCandidate['review'] {
  if (candidate.inventory.state === 'several-existing') {
    return {
      state: 'possible-overlap',
      reason:
        'Several discovered URLs match this topic. Review their intent and canonical relationship before changing coverage.',
      evidenceRefs: ['inventory'],
    }
  }
  if (
    candidate.inventory.state === 'existing' &&
    candidate.firstParty.state === 'retained' &&
    !exactQueryPages.some((page) =>
      matchedInventoryUrls.some(
        (inventoryUrl) => normalizedPath(page) === normalizedPath(inventoryUrl),
      ),
    )
  ) {
    return {
      state: 'possible-overlap',
      reason:
        'This topic matches retained inventory, but exact retained query variants are associated with another page. Review both pages before changing coverage.',
      evidenceRefs: ['firstParty', 'inventory'],
    }
  }
  if (candidate.inventory.state === 'existing') {
    return {
      state: 'existing-topic',
      reason:
        candidate.firstParty.state === 'retained'
          ? 'This topic matches retained inventory and exact retained query variants have first-party evidence.'
          : 'This topic matches retained inventory. No exact query variant was retained in the selected Search Console rows.',
      evidenceRefs:
        candidate.firstParty.state === 'retained'
          ? ['inventory', 'firstParty']
          : ['inventory'],
    }
  }
  if (candidate.inventory.state === 'unknown') {
    return {
      state: 'inventory-unknown',
      reason:
        'No path template was supplied, so the report cannot determine whether this topic already has a page.',
      evidenceRefs:
        candidate.firstParty.state === 'retained' ? ['firstParty'] : [],
    }
  }
  if (candidate.coveragePolicy === 'complete-set') {
    return {
      state: 'strategic-gap',
      reason:
        'The declared path is missing from the retained inventory and the caller marked this set for complete product coverage.',
      evidenceRefs: ['inventory', 'coveragePolicy'],
    }
  }
  if (candidate.firstParty.state === 'retained') {
    return {
      state: 'search-evidenced-gap',
      reason:
        'Exact retained query variants have first-party evidence on another page, while the declared path is missing. Review the existing page before treating this as a page gap.',
      evidenceRefs: ['firstParty', 'inventory'],
    }
  }
  return {
    state: 'research-only',
    reason:
      'The declared path is missing and no exact query variant was retained. This remains research, not evidence that a page is required.',
    evidenceRefs: ['inventory'],
  }
}

function externalRefsByKeyword(input: {
  keywordMetrics: PseoPatternKeywordEvidence
  serps: PseoPatternSerpObservation[]
}): {
  keywordMetrics: Map<string, string>
  serps: Map<string, string>
} {
  return {
    keywordMetrics: new Map(
      input.keywordMetrics.rows.map((row, index) => [
        normalizePseoText(row.keyword),
        `source.external.keywordMetrics.rows[${index}]`,
      ]),
    ),
    serps: new Map(
      input.serps.map((row, index) => [
        normalizePseoText(row.keyword),
        `source.external.serps.observations[${index}]`,
      ]),
    ),
  }
}

export function enrichPseoPatternCandidates(input: {
  generated: GeneratedPseoPatternCandidate[]
  patternSets: GeneratedPseoPatternSet[]
  queryRows: PseoQueryPageRow[]
  discoveredUrls: string[]
  keywordMetrics: PseoPatternKeywordEvidence
  serps: PseoPatternSerpObservation[]
}): {
  candidates: PseoPatternCandidate[]
  patternSets: PseoPatternSetSummary[]
} {
  const queryEvidence = aggregateQueries(input.queryRows)
  const urlsByPath = new Map<string, string[]>()
  for (const url of input.discoveredUrls) {
    const path = normalizedPath(url)
    if (!path) continue
    const urls = urlsByPath.get(path) ?? []
    urls.push(url)
    urlsByPath.set(path, urls)
  }
  for (const urls of urlsByPath.values()) urls.sort(comparePseoText)
  const externalRefs = externalRefsByKeyword({
    keywordMetrics: input.keywordMetrics,
    serps: input.serps,
  })
  const candidates = input.generated.map((generated) => {
    const queryVariants = generated.queries.map((query) => {
      const retained = queryEvidence.get(normalizePseoText(query))
      const pageList = retained ? [...retained.pages].sort(comparePseoText) : []
      return {
        query,
        state: retained ? ('retained' as const) : ('not-retained' as const),
        ...metrics(
          retained ?? {
            clicks: 0,
            impressions: 0,
            weightedPosition: 0,
          },
        ),
        pageCount: pageList.length,
        samplePages: pageList.slice(0, 5),
      }
    })
    const matchedVariants = queryVariants.filter(
      (query) => query.state === 'retained',
    )
    const pages = [
      ...new Set(
        generated.queries.flatMap((query) => {
          const retained = queryEvidence.get(normalizePseoText(query))
          return retained ? [...retained.pages] : []
        }),
      ),
    ].sort(comparePseoText)
    const firstPartyImpressions = matchedVariants.reduce(
      (sum, query) => sum + query.impressions,
      0,
    )
    const firstParty = {
      state: matchedVariants.length
        ? ('retained' as const)
        : ('not-retained' as const),
      clicks: matchedVariants.reduce((sum, query) => sum + query.clicks, 0),
      impressions: firstPartyImpressions,
      ctr: firstPartyImpressions
        ? matchedVariants.reduce((sum, query) => sum + query.clicks, 0) /
          firstPartyImpressions
        : 0,
      position: firstPartyImpressions
        ? matchedVariants.reduce(
            (sum, query) => sum + query.position * query.impressions,
            0,
          ) / firstPartyImpressions
        : 0,
      matchedQueries: matchedVariants.length,
      pageCount: pages.length,
      samplePages: pages.slice(0, 5),
    }
    const matchedUrls = [
      ...new Set(
        generated.inventoryPaths.flatMap(
          (path) => urlsByPath.get(path.replace(/\/+$/u, '') || '/') ?? [],
        ),
      ),
    ].sort(comparePseoText)
    const inventory = generated.suggestedPath
      ? {
          state:
            matchedUrls.length > 1
              ? ('several-existing' as const)
              : matchedUrls.length === 1
                ? ('existing' as const)
                : ('missing' as const),
          matchedUrls: matchedUrls.length,
          sampleUrls: matchedUrls.slice(0, 5),
        }
      : {
          state: 'unknown' as const,
          matchedUrls: 0,
          sampleUrls: [],
        }
    const metricRefs = generated.queries.flatMap((query) => {
      const ref = externalRefs.keywordMetrics.get(normalizePseoText(query))
      return ref ? [ref] : []
    })
    const serpRefs = generated.queries.flatMap((query) => {
      const ref = externalRefs.serps.get(normalizePseoText(query))
      return ref ? [ref] : []
    })
    const base: Omit<PseoPatternCandidate, 'review'> = {
      id: generated.id,
      patternSetId: generated.patternSetId,
      kind: generated.kind,
      shape: generated.shape,
      coveragePolicy: generated.coveragePolicy,
      variables: generated.variables,
      suggestedPath: generated.suggestedPath,
      queryVariants,
      firstParty,
      inventory,
      external: {
        keywordMetricRefs: metricRefs,
        serpRefs,
      },
    }
    return { ...base, review: candidateReview(base, pages, matchedUrls) }
  })
  const reviewOrder: Record<PseoPatternCandidate['review']['state'], number> = {
    'strategic-gap': 0,
    'search-evidenced-gap': 1,
    'possible-overlap': 2,
    'existing-topic': 3,
    'research-only': 4,
    'inventory-unknown': 5,
  }
  candidates.sort(
    (left, right) =>
      reviewOrder[left.review.state] - reviewOrder[right.review.state] ||
      right.firstParty.impressions - left.firstParty.impressions ||
      comparePseoText(left.id, right.id),
  )
  const patternSets = input.patternSets.map((set) => {
    const setCandidates = candidates.filter(
      (candidate) => candidate.patternSetId === set.id,
    )
    return {
      ...set,
      existingTopics: setCandidates.filter((candidate) =>
        ['existing', 'several-existing'].includes(candidate.inventory.state),
      ).length,
      strategicGaps: setCandidates.filter(
        (candidate) => candidate.review.state === 'strategic-gap',
      ).length,
      searchEvidencedGaps: setCandidates.filter(
        (candidate) => candidate.review.state === 'search-evidenced-gap',
      ).length,
    }
  })
  return { candidates, patternSets }
}

export function pseoPatternTemplateSummaries(
  firstParty: PseoPatternsFirstPartyEvidence,
): PseoPatternTemplateSummary[] {
  return firstParty.audit.templates.map((template, index) => ({
    signature: template.signature,
    urlCount: template.urlCount,
    sampleUrls: template.sampleUrls.slice(0, 3),
    population: template.population,
    searchEvidence: {
      clicks: template.metrics.clicks,
      impressions: template.metrics.impressions,
      position: template.metrics.position,
      queryPatterns: template.metrics.queryPatterns,
      topQueries: template.metrics.topQueries,
    },
    verdict: template.verdict,
    evidenceRef: `templates[${index}]`,
  }))
}

export function pseoPatternFindings(input: {
  observedPatterns: PseoObservedPattern[]
  candidates: PseoPatternCandidate[]
}): PseoPatternFinding[] {
  const findings: PseoPatternFinding[] = input.observedPatterns
    .slice(0, 3)
    .map((pattern) => ({
      code: 'observed-pattern' as const,
      evidenceRefs: [pattern.evidenceRef],
      principle:
        'A repeated retained query pattern shows first-party visibility, not that every possible combination deserves a page.',
      detail: `${pattern.label} accounts for ${pattern.impressions} retained impressions across ${pattern.queryCount} queries and ${pattern.pageCount} pages.`,
    }))
  for (const [candidateIndex, candidate] of input.candidates.entries()) {
    if (
      !['strategic-gap', 'search-evidenced-gap', 'possible-overlap'].includes(
        candidate.review.state,
      )
    ) {
      continue
    }
    const code = candidate.review.state as PseoPatternFinding['code']
    const principle =
      code === 'strategic-gap'
        ? 'Complete-set coverage is a caller-supplied product decision. It identifies a planning gap without claiming search demand or ranking impact.'
        : code === 'search-evidenced-gap'
          ? 'Exact retained Search Console rows support a coverage review, but missing inventory still needs an intent and page-value decision.'
          : 'Several matching URLs are an overlap observation. Their intent and canonical relationship determine whether any change is needed.'
    findings.push({
      code,
      evidenceRefs: candidate.review.evidenceRefs.map(
        (ref) => `candidates[${candidateIndex}].${ref}`,
      ),
      principle,
      detail: `${candidate.id}: ${candidate.review.reason}`,
    })
    if (findings.length >= 10) break
  }
  return findings
}

export function pseoPatternDetailBudget(input: {
  report: Pick<
    PseoPatternsReport,
    | 'catalog'
    | 'observedPatterns'
    | 'observedQueries'
    | 'templates'
    | 'patternSets'
    | 'candidates'
    | 'findings'
    | 'source'
  >
  limit: number
}): PseoPatternsReport['detailBudget'] {
  const sections = {
    catalog: input.report.catalog.length,
    observedPatterns: input.report.observedPatterns.length,
    observedQueries: input.report.observedQueries.length,
    templates: input.report.templates.length,
    patternSets: input.report.patternSets.length,
    candidates: input.report.candidates.length,
    queryVariants: input.report.candidates.reduce(
      (sum, candidate) => sum + candidate.queryVariants.length,
      0,
    ),
    keywordMetrics: input.report.source.external.keywordMetrics.rows.length,
    serpObservations: input.report.source.external.serps.observations.length,
    findings: input.report.findings.length,
  }
  return {
    unit: 'pseo-pattern-synthesis-rows',
    limit: input.limit,
    returned: Object.values(sections).reduce((sum, value) => sum + value, 0),
    sections,
  }
}
