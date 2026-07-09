import { shouldExcludeBrandQuery } from '../../brand.js'
import { summarizeTemplates } from '../page-patterns.js'
import { isSearchArtifactQuery } from '../query-quality.js'
import {
  aggregateDecayRows,
  boundedDecayNumber,
  classifyDecay,
  compareDecayText,
  decayMetrics,
  decayRecommendation,
  decayTemplate,
  groupDecayItems,
  normalizeDecayQuery,
} from './decay-analysis-primitives.js'
import type {
  AnalyzeDecayInput,
  DecayAnalysis,
  DecayItem,
} from './decay-types.js'

export type * from './decay-types.js'

export function analyzeDecay(input: AnalyzeDecayInput): DecayAnalysis {
  const minDropPct = boundedDecayNumber(input.minDropPct, 20, 0, 100)
  const minPreviousClicks = boundedDecayNumber(
    input.minPreviousClicks,
    2,
    0,
    1_000_000_000,
  )
  const minClickLoss = boundedDecayNumber(
    input.minClickLoss,
    1,
    0,
    1_000_000_000,
  )
  const limit = Math.floor(boundedDecayNumber(input.limit, 25, 1, 100))
  const current = aggregateDecayRows(input.currentRows)
  const previous = aggregateDecayRows(input.previousRows)
  const selection = {
    currentSourceRows: input.currentRows.length,
    previousSourceRows: input.previousRows.length,
    currentInvalidRows: current.invalid,
    previousInvalidRows: previous.invalid,
    currentAggregatedRows: current.rows.length,
    previousAggregatedRows: previous.rows.length,
    lowEvidenceRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    currentRowNotRetained: 0,
    urlShiftRows: 0,
    belowClickLossRows: 0,
    belowDropRows: 0,
    eligibleRows: 0,
    returnedRows: 0,
    limitedRows: 0,
    eligibleGroups: 0,
    returnedGroups: 0,
    limitedGroups: 0,
  }
  const currentByKey = new Map(
    current.rows.map((row) => [
      `${normalizeDecayQuery(row.keys[0])}\u0000${row.keys[1]}`,
      row,
    ]),
  )
  const currentUrlsByQuery = new Map<string, Set<string>>()
  for (const row of current.rows) {
    const key = normalizeDecayQuery(row.keys[0])
    const urls = currentUrlsByQuery.get(key) ?? new Set<string>()
    urls.add(row.keys[1])
    currentUrlsByQuery.set(key, urls)
  }
  const items: DecayItem[] = []
  for (const previousRow of previous.rows) {
    const query = previousRow.keys[0]
    const url = previousRow.keys[1]
    if (previousRow.clicks <= 0 || previousRow.clicks < minPreviousClicks) {
      selection.lowEvidenceRows++
      continue
    }
    if (isSearchArtifactQuery(query)) {
      selection.lowActionabilityRows++
      continue
    }
    if (
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandRows++
      continue
    }
    const key = `${normalizeDecayQuery(query)}\u0000${url}`
    const currentRow = currentByKey.get(key)
    if (!currentRow) {
      const currentUrls = currentUrlsByQuery.get(normalizeDecayQuery(query))
      if (currentUrls?.size) selection.urlShiftRows++
      else selection.currentRowNotRetained++
      continue
    }
    const clickLoss = previousRow.clicks - currentRow.clicks
    if (clickLoss <= 0 || clickLoss < minClickLoss) {
      selection.belowClickLossRows++
      continue
    }
    const dropPct = (clickLoss / previousRow.clicks) * 100
    if (dropPct < minDropPct) {
      selection.belowDropRows++
      continue
    }
    const classification = classifyDecay(currentRow, previousRow)
    const base = {
      query,
      url,
      template: decayTemplate(url),
      clickLoss: Number(clickLoss.toFixed(3)),
      dropPct: Number(dropPct.toFixed(1)),
      current: decayMetrics(currentRow),
      previous: decayMetrics(previousRow),
      diagnosis: classification.diagnosis,
      signals: classification.signals,
      evidenceScope: 'retained-query-page-row' as const,
    }
    items.push({ ...base, recommendation: decayRecommendation(base) })
  }
  const eligible = items.sort(
    (left, right) =>
      right.clickLoss - left.clickLoss ||
      right.previous.clicks - left.previous.clicks ||
      compareDecayText(left.query, right.query) ||
      compareDecayText(left.url, right.url),
  )
  const returned = eligible.slice(0, limit)
  const eligibleObservedRetainedQueryClickLoss = Number(
    eligible.reduce((sum, item) => sum + item.clickLoss, 0).toFixed(3),
  )
  const returnedObservedRetainedQueryClickLoss = Number(
    returned.reduce((sum, item) => sum + item.clickLoss, 0).toFixed(3),
  )
  selection.eligibleRows = eligible.length
  selection.returnedRows = returned.length
  selection.limitedRows = eligible.length - returned.length
  const eligibleGroups = groupDecayItems(eligible)
  const groups = eligibleGroups.slice(0, 100)
  selection.eligibleGroups = eligibleGroups.length
  selection.returnedGroups = groups.length
  selection.limitedGroups = eligibleGroups.length - groups.length
  return {
    selection,
    totals: {
      eligibleObservedRetainedQueryClickLoss,
      returnedObservedRetainedQueryClickLoss,
    },
    items: returned,
    groups,
    templates: summarizeTemplates(returned),
  }
}
