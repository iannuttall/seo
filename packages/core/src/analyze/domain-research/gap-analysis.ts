import type { RankedKeyword } from '../../providers/domain-contracts.js'
import type { CompetitorKeywordGapCandidate } from '../domain-research-contract.js'
import {
  canonicalPseoTerm,
  pseoQueryThemeTerms,
} from '../pseo/query-insights.js'
import { clusterPseoTemplates, templateForUrl } from '../pseo/templates.js'
import type { GapAcquisition } from './gap-acquisition.js'
import { compareText, normalizedKeyword, value } from './shared.js'

const MAX_RELEVANCE_QUERY_REFS = 3
const MAX_FIRST_PARTY_PATTERN_URLS = 10_000
export const MAX_TOKEN_ROWS_PER_TERM = 100
const RELEVANCE_STOPWORDS = new Set(['com', 'http', 'https', 'www'])

type CompetitorKeywordRow = {
  domain: string
  row: RankedKeyword
  evidenceRef: string
}

function terms(value: string): string[] {
  const withoutSearchOperators = value.replace(
    /(?:^|\s)-?(?:cache|filetype|intext|intitle|inurl|related|site):(?:"[^"]+"|\S+)/giu,
    ' ',
  )
  return [
    ...new Set(
      pseoQueryThemeTerms(withoutSearchOperators)
        .map(canonicalPseoTerm)
        .filter((term) => term && !RELEVANCE_STOPWORDS.has(term)),
    ),
  ].sort(compareText)
}

function observedVolume(row: RankedKeyword): number {
  return value(row.monthlySearchVolume) ?? -1
}

function competitorRows(acquisition: GapAcquisition): CompetitorKeywordRow[] {
  return acquisition.competitors.flatMap((competitor, sourceIndex) =>
    (competitor.evidence?.data.rows ?? []).map((row, rowIndex) => ({
      domain: competitor.domain,
      row,
      evidenceRef: `source.competitors[${sourceIndex}].evidence.data.rows[${rowIndex}]`,
    })),
  )
}

function groupedCompetitorRows(rows: CompetitorKeywordRow[]) {
  const grouped = new Map<string, CompetitorKeywordRow[]>()
  for (const item of rows) {
    const keyword = normalizedKeyword(item.row.keyword)
    grouped.set(keyword, [...(grouped.get(keyword) ?? []), item])
  }
  return grouped
}

function firstPartyTokenIndex(acquisition: GapAcquisition) {
  const index = new Map<string, number[]>()
  let sourceTermVisits = 0
  for (const [rowIndex, row] of acquisition.sourceRows.rows.entries()) {
    for (const token of terms(row.query)) {
      sourceTermVisits += 1
      const rows = index.get(token) ?? []
      if (rows.length < MAX_TOKEN_ROWS_PER_TERM) rows.push(rowIndex)
      index.set(token, rows)
    }
  }
  return {
    index,
    sourceTermVisits,
    retainedPostings: [...index.values()].reduce(
      (sum, rows) => sum + rows.length,
      0,
    ),
  }
}

function relevanceForKeyword(
  keyword: string,
  acquisition: GapAcquisition,
  tokenIndex: Map<string, number[]>,
): CompetitorKeywordGapCandidate['relevance'] {
  const keywordTerms = terms(keyword)
  const candidateRows = new Set<number>()
  for (const token of keywordTerms) {
    for (const rowIndex of tokenIndex.get(token) ?? [])
      candidateRows.add(rowIndex)
  }
  const matches = [...candidateRows]
    .map((index) => acquisition.sourceRows.rows[index])
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      query: row.query,
      sharedTokens: terms(row.query).filter((token) =>
        keywordTerms.includes(token),
      ),
      impressions: row.impressions,
    }))
    .filter((row) => row.sharedTokens.length > 0)
    .sort(
      (left, right) =>
        right.sharedTokens.length - left.sharedTokens.length ||
        right.impressions - left.impressions ||
        compareText(left.query, right.query),
    )
    .slice(0, MAX_RELEVANCE_QUERY_REFS)
  const maximumOverlap = matches[0]?.sharedTokens.length ?? 0
  return {
    state:
      maximumOverlap >= 2
        ? 'observed-overlap'
        : maximumOverlap === 1
          ? 'weak-overlap'
          : 'unavailable',
    sharedTokens: [...new Set(matches.flatMap((row) => row.sharedTokens))].sort(
      compareText,
    ),
    matchedFirstPartyQueries: matches.map((row) => row.query),
    method: 'bounded-query-theme-overlap-v2',
  }
}

function repeatedCompetitorPatterns(rows: CompetitorKeywordRow[]) {
  const byDomain = new Map<string, CompetitorKeywordRow[]>()
  for (const item of rows) {
    byDomain.set(item.domain, [...(byDomain.get(item.domain) ?? []), item])
  }
  return [...byDomain.entries()]
    .flatMap(([domain, items]) =>
      clusterPseoTemplates(
        items.map((item) => item.row.url),
        { minUrls: 2, minShare: 0, limit: 5, sampleSize: 3 },
      ).map((pattern) => ({
        domain,
        signature: pattern.signature,
        urlCount: pattern.urlCount,
        sampleUrls: pattern.sampleUrls,
        evidenceRefs: items.flatMap((item) =>
          pattern.sampleUrls.includes(item.row.url) ? [item.evidenceRef] : [],
        ),
      })),
    )
    .sort(
      (left, right) =>
        right.urlCount - left.urlCount ||
        compareText(left.domain, right.domain) ||
        compareText(left.signature, right.signature),
    )
}

function ownPatterns(acquisition: GapAcquisition) {
  const urls = [
    ...new Set(acquisition.sourceRows.rows.flatMap((row) => row.urls)),
  ]
    .sort(compareText)
    .slice(0, MAX_FIRST_PARTY_PATTERN_URLS)
  return clusterPseoTemplates(urls, {
    minUrls: 3,
    minShare: 0,
    limit: 50,
    sampleSize: 3,
  })
}

function ownProviderRanks(acquisition: GapAcquisition): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of acquisition.ownSource.evidence?.data.rows ?? []) {
    const keyword = normalizedKeyword(row.keyword)
    result.set(keyword, Math.min(result.get(keyword) ?? 101, row.rankGroup))
  }
  return result
}

function classification(input: {
  firstParty: boolean
  ownRank: number | null
  relevance: CompetitorKeywordGapCandidate['relevance']
  competitorCount: number
  bestRank: number
}): CompetitorKeywordGapCandidate['classification'] {
  if (input.firstParty) return 'already-observed-first-party'
  if (input.ownRank !== null) return 'already-ranked-provider'
  if (
    input.relevance.state === 'observed-overlap' &&
    (input.competitorCount >= 2 || input.bestRank <= 10)
  ) {
    return 'relevant-gap-candidate'
  }
  return 'unverified-competitor-term'
}

function classificationOrder(
  value: CompetitorKeywordGapCandidate['classification'],
): number {
  return {
    'relevant-gap-candidate': 0,
    'unverified-competitor-term': 1,
    'already-ranked-provider': 2,
    'already-observed-first-party': 3,
  }[value]
}

export function analyzeCompetitorGap(acquisition: GapAcquisition) {
  const rawRows = competitorRows(acquisition)
  const grouped = groupedCompetitorRows(rawRows)
  const firstPartyByQuery = new Map(
    acquisition.sourceRows.rows.map((row) => [row.query, row]),
  )
  const tokenIndex = firstPartyTokenIndex(acquisition)
  const ownRanks = ownProviderRanks(acquisition)
  const competitorPatterns = repeatedCompetitorPatterns(rawRows)
  const firstPartyPatterns = ownPatterns(acquisition)
  const candidates = [...grouped.entries()]
    .map(([keyword, rows]): CompetitorKeywordGapCandidate => {
      const byDomain = new Map<string, CompetitorKeywordRow>()
      for (const item of rows) {
        const current = byDomain.get(item.domain)
        if (
          !current ||
          item.row.rankGroup < current.row.rankGroup ||
          (item.row.rankGroup === current.row.rankGroup &&
            compareText(item.row.url, current.row.url) < 0)
        ) {
          byDomain.set(item.domain, item)
        }
      }
      const retainedRows = [...byDomain.values()].sort(
        (left, right) =>
          left.row.rankGroup - right.row.rankGroup ||
          compareText(left.domain, right.domain),
      )
      const best = [...retainedRows].sort(
        (left, right) =>
          observedVolume(right.row) - observedVolume(left.row) ||
          left.row.rankGroup - right.row.rankGroup ||
          compareText(left.domain, right.domain),
      )[0] as CompetitorKeywordRow
      const firstParty = firstPartyByQuery.get(keyword)
      const relevance = relevanceForKeyword(
        keyword,
        acquisition,
        tokenIndex.index,
      )
      const ownRank = ownRanks.get(keyword) ?? null
      const matchedPatterns = competitorPatterns.filter((pattern) =>
        retainedRows.some(
          (item) =>
            item.domain === pattern.domain &&
            templateForUrl(item.row.url, [pattern]) === pattern.signature,
        ),
      )
      const matchedFirstPartyRows = relevance.matchedFirstPartyQueries.flatMap(
        (query) => {
          const row = firstPartyByQuery.get(query)
          return row ? [row] : []
        },
      )
      const existingTemplate = matchedFirstPartyRows.some((row) =>
        row.urls.some((url) =>
          firstPartyPatterns.some(
            (pattern) => templateForUrl(url, [pattern]) === pattern.signature,
          ),
        ),
      )
      const candidateClassification = classification({
        firstParty: Boolean(firstParty),
        ownRank,
        relevance,
        competitorCount: retainedRows.length,
        bestRank: Math.min(...retainedRows.map((item) => item.row.rankGroup)),
      })
      return {
        keyword,
        classification: candidateClassification,
        competitorCount: retainedRows.length,
        competitors: retainedRows.map((item) => ({
          domain: item.domain,
          rank: item.row.rankGroup,
          url: item.row.url,
          evidenceRef: item.evidenceRef,
        })),
        firstParty: {
          observed: Boolean(firstParty),
          clicks: firstParty?.clicks ?? null,
          impressions: firstParty?.impressions ?? null,
          averagePosition: firstParty?.averagePosition ?? null,
          urls: firstParty?.urls ?? [],
        },
        ownProviderRank: ownRank,
        monthlySearchVolume: best.row.monthlySearchVolume,
        keywordDifficulty: best.row.keywordDifficulty,
        intent: best.row.intent,
        relevance,
        pseo: {
          repeatedCompetitorPagePatterns: matchedPatterns.map(
            (pattern) => `${pattern.domain}${pattern.signature}`,
          ),
          proposal:
            candidateClassification !== 'relevant-gap-candidate'
              ? 'none'
              : existingTemplate
                ? 'existing-template-review'
                : matchedPatterns.length
                  ? 'new-template-research'
                  : 'none',
        },
        evidenceRefs: retainedRows.map((item) => item.evidenceRef),
      }
    })
    .sort(
      (left, right) =>
        classificationOrder(left.classification) -
          classificationOrder(right.classification) ||
        right.competitorCount - left.competitorCount ||
        (value(right.monthlySearchVolume) ?? -1) -
          (value(left.monthlySearchVolume) ?? -1) ||
        Math.min(...left.competitors.map((item) => item.rank)) -
          Math.min(...right.competitors.map((item) => item.rank)) ||
        compareText(left.keyword, right.keyword),
    )
  return {
    rawRows,
    candidates,
    returnedCandidates: candidates.slice(0, acquisition.candidateLimit),
    competitorPatterns,
    firstPartyPatternUrlLimit: MAX_FIRST_PARTY_PATTERN_URLS,
    processing: {
      firstPartyRows: acquisition.sourceRows.rows.length,
      sourceTermVisits: tokenIndex.sourceTermVisits,
      uniqueSourceTerms: tokenIndex.index.size,
      retainedTokenPostings: tokenIndex.retainedPostings,
      competitorRows: rawRows.length,
      candidateKeywords: grouped.size,
    },
  }
}
