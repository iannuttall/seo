import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types.js'
import {
  compareInternalLinkText,
  createInternalLinkLexicalScorer,
  internalLinkTokens,
  normalizeInternalLinkQuery,
  normalizeInternalLinkUrl,
  validInternalLinkRow,
} from './internal-links-analysis-primitives.js'
import type {
  InternalLinkCandidate,
  InternalLinkQueryMatch,
  InternalLinksSelection,
} from './internal-links-types.js'
import { isLowActionabilityQuery } from './query-quality.js'

const LEXICAL_TARGET_LIMIT = 50
export const INTERNAL_LINK_LEXICAL_TARGET_LIMIT = LEXICAL_TARGET_LIMIT

export interface InternalLinksAnalysisInput {
  targetRows: GscRow[]
  sourceRows: GscRow[]
  site: string
  targetAliases: string[]
  minImpressions: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export interface InternalLinksAnalysis {
  targetQueries: Array<{ query: string; clicks: number; impressions: number }>
  candidates: InternalLinkCandidate[]
  selection: Omit<
    InternalLinksSelection,
    | 'checkedSources'
    | 'returnedSources'
    | 'existingLinkExclusions'
    | 'technicalExclusions'
    | 'selfAliasExclusions'
    | 'failedChecks'
    | 'uncheckedCandidates'
  >
}

type QueryAggregate = {
  query: string
  clicks: number
  impressions: number
}

type SourceAggregate = QueryAggregate & { page: string }

function exclusion(input: {
  query: string
  impressions: number
  site: string
  minImpressions: number
  brandTerms?: string[]
  includeBrand?: boolean
}): 'low-impressions' | 'low-actionability' | 'brand' | undefined {
  if (input.impressions < input.minImpressions) return 'low-impressions'
  if (isLowActionabilityQuery(input.query)) return 'low-actionability'
  if (
    shouldExcludeBrandQuery({
      query: input.query,
      siteUrl: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })
  ) {
    return 'brand'
  }
  return undefined
}

function mergeQuery(
  map: Map<string, QueryAggregate>,
  key: string,
  query: string,
  row: GscRow,
): void {
  const current = map.get(key) ?? { query, clicks: 0, impressions: 0 }
  current.clicks += row.clicks
  current.impressions += row.impressions
  if (compareInternalLinkText(query, current.query) < 0) current.query = query
  map.set(key, current)
}

function bestMatch(input: {
  source: SourceAggregate
  exactTargets: Map<string, QueryAggregate>
  lexicalTargets: QueryAggregate[]
  scoreLexical: ReturnType<typeof createInternalLinkLexicalScorer>
}): InternalLinkQueryMatch | undefined {
  const sourceKey = normalizeInternalLinkQuery(input.source.query)
  const exact = input.exactTargets.get(sourceKey)
  if (exact) {
    return {
      sourceQuery: input.source.query,
      targetQuery: exact.query,
      kind: 'exact-query',
      relevanceScore: 1,
      impressions: input.source.impressions,
      sharedTerms: internalLinkTokens(input.source.query),
    }
  }

  const lexicalMatches = input.lexicalTargets.flatMap(
    (target): InternalLinkQueryMatch[] => {
      const score = input.scoreLexical(input.source.query, target.query)
      return score
        ? [
            {
              sourceQuery: input.source.query,
              targetQuery: target.query,
              kind: 'lexical-review',
              relevanceScore: score.score,
              impressions: input.source.impressions,
              sharedTerms: score.sharedTerms,
            },
          ]
        : []
    },
  )
  return lexicalMatches.sort(
    (left, right) =>
      right.relevanceScore - left.relevanceScore ||
      compareInternalLinkText(left.targetQuery, right.targetQuery),
  )[0]
}

function candidatesFromMatches(
  matchesByUrl: Map<string, InternalLinkQueryMatch[]>,
): InternalLinkCandidate[] {
  return [...matchesByUrl.entries()]
    .map(([sourceUrl, matches]): InternalLinkCandidate => {
      const ordered = [...matches].sort(
        (left, right) =>
          (left.kind === right.kind
            ? 0
            : left.kind === 'exact-query'
              ? -1
              : 1) ||
          right.impressions - left.impressions ||
          right.relevanceScore - left.relevanceScore ||
          compareInternalLinkText(left.sourceQuery, right.sourceQuery),
      )
      return {
        sourceUrl,
        matchedQueryImpressions: ordered.reduce(
          (sum, match) => sum + match.impressions,
          0,
        ),
        matchedQueries: ordered.length,
        exactQueryMatches: ordered.filter(
          (match) => match.kind === 'exact-query',
        ).length,
        bestRelevanceScore: Math.max(
          ...ordered.map((match) => match.relevanceScore),
        ),
        bestMatchKind: ordered.some((match) => match.kind === 'exact-query')
          ? 'exact-query'
          : 'lexical-review',
        matches: ordered.slice(0, 10),
      }
    })
    .sort(
      (left, right) =>
        right.exactQueryMatches - left.exactQueryMatches ||
        right.matchedQueryImpressions - left.matchedQueryImpressions ||
        right.bestRelevanceScore - left.bestRelevanceScore ||
        compareInternalLinkText(left.sourceUrl, right.sourceUrl),
    )
}

export function analyzeInternalLinksFromRows(
  input: InternalLinksAnalysisInput,
): InternalLinksAnalysis {
  const aliases = new Set(
    input.targetAliases
      .map(normalizeInternalLinkUrl)
      .filter((url): url is string => Boolean(url)),
  )
  const count = new Map<string, number>()
  const increment = (key: string): void => {
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const targetMap = new Map<string, QueryAggregate>()
  let targetValidRows = 0

  for (const row of input.targetRows) {
    if (!validInternalLinkRow(row)) {
      increment('targetInvalidRows')
      continue
    }
    targetValidRows += 1
    const query = row.keys[0] ?? ''
    const page = normalizeInternalLinkUrl(row.keys[1] ?? '')
    if (!page || !aliases.has(page)) {
      increment('targetUrlMismatchRows')
      continue
    }
    mergeQuery(targetMap, normalizeInternalLinkQuery(query), query, row)
  }

  const allTargets = [...targetMap.values()]
    .filter((target) => {
      const reason = exclusion({
        ...target,
        site: input.site,
        minImpressions: input.minImpressions,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
      if (reason === 'low-impressions') increment('targetLowImpressionQueries')
      if (reason === 'low-actionability')
        increment('targetLowActionabilityQueries')
      if (reason === 'brand') increment('targetBrandQueries')
      return !reason
    })
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        right.clicks - left.clicks ||
        compareInternalLinkText(left.query, right.query),
    )
  const lexicalTargets = allTargets.slice(0, LEXICAL_TARGET_LIMIT)
  const exactTargets = new Map(
    allTargets.map((target) => [
      normalizeInternalLinkQuery(target.query),
      target,
    ]),
  )
  const sourceMap = new Map<string, SourceAggregate>()
  let sourceValidRows = 0

  for (const row of input.sourceRows) {
    if (!validInternalLinkRow(row)) {
      increment('sourceInvalidRows')
      continue
    }
    sourceValidRows += 1
    const query = row.keys[0] ?? ''
    const page = normalizeInternalLinkUrl(row.keys[1] ?? '')
    if (!page) continue
    if (aliases.has(page)) {
      increment('sourceTargetAliasRows')
      continue
    }
    const key = `${page}\u0000${normalizeInternalLinkQuery(query)}`
    const current = sourceMap.get(key) ?? {
      page,
      query,
      clicks: 0,
      impressions: 0,
    }
    current.clicks += row.clicks
    current.impressions += row.impressions
    if (compareInternalLinkText(query, current.query) < 0) current.query = query
    sourceMap.set(key, current)
  }

  const eligibleSources = [...sourceMap.values()].filter((source) => {
    const reason = exclusion({
      ...source,
      site: input.site,
      minImpressions: input.minImpressions,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })
    if (reason === 'low-impressions') increment('sourceLowImpressionQueries')
    if (reason === 'low-actionability')
      increment('sourceLowActionabilityQueries')
    if (reason === 'brand') increment('sourceBrandQueries')
    return !reason
  })
  const scoreLexical = createInternalLinkLexicalScorer([
    ...allTargets.map((target) => target.query),
    ...eligibleSources.map((source) => source.query),
  ])
  const matchesByUrl = new Map<string, InternalLinkQueryMatch[]>()
  let candidateQueries = 0

  for (const source of eligibleSources) {
    const match = bestMatch({
      source,
      exactTargets,
      lexicalTargets,
      scoreLexical,
    })
    if (!match) {
      increment('sourceUnmatchedQueries')
      continue
    }
    candidateQueries += 1
    const matches = matchesByUrl.get(source.page) ?? []
    matches.push(match)
    matchesByUrl.set(source.page, matches)
  }
  const candidates = candidatesFromMatches(matchesByUrl)
  const value = (key: string): number => count.get(key) ?? 0

  return {
    targetQueries: lexicalTargets,
    candidates,
    selection: {
      targetSourceRows: input.targetRows.length,
      targetValidRows,
      targetInvalidRows: value('targetInvalidRows'),
      targetUrlMismatchRows: value('targetUrlMismatchRows'),
      targetLowImpressionQueries: value('targetLowImpressionQueries'),
      targetLowActionabilityQueries: value('targetLowActionabilityQueries'),
      targetBrandQueries: value('targetBrandQueries'),
      targetEligibleQueries: allTargets.length,
      selectedLexicalTargetQueries: lexicalTargets.length,
      sourceRows: input.sourceRows.length,
      sourceValidRows,
      sourceInvalidRows: value('sourceInvalidRows'),
      sourceTargetAliasRows: value('sourceTargetAliasRows'),
      sourceLowImpressionQueries: value('sourceLowImpressionQueries'),
      sourceLowActionabilityQueries: value('sourceLowActionabilityQueries'),
      sourceBrandQueries: value('sourceBrandQueries'),
      sourceUnmatchedQueries: value('sourceUnmatchedQueries'),
      candidateQueries,
      candidateUrls: candidates.length,
    },
  }
}
