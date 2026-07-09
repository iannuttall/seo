import { shouldExcludeBrandQuery } from '../../brand.js'
import { detectPageTemplate, summarizeTemplates } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import {
  addCannibalRow,
  type CannibalQueryGroup,
  compareCannibalText,
  normalizeCannibalQuery,
  normalizeCannibalUrl,
  validCannibalPropertyRow,
  validCannibalRow,
} from './cannibal-analysis-primitives.js'
import {
  cannibalBrandEvidence,
  cannibalReviewContext,
  cannibalTemplateRow,
  compareCannibalItems,
  createCannibalItem,
} from './cannibal-item.js'
import type {
  AnalyzeCannibalRowsInput,
  CannibalAnalysis,
  CannibalItem,
  CannibalPage,
  CannibalSuppression,
} from './cannibal-types.js'

const MINIMUM_PAGE_SHARE = 0.1
const MINIMUM_PAGE_IMPRESSIONS = 10
const MAXIMUM_DOMINANT_SHARE = 0.8
const MAX_SUPPRESSIONS = 100

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

export function analyzeCannibalRows(
  input: AnalyzeCannibalRowsInput,
): CannibalAnalysis {
  const minImpressions = boundedInteger(
    input.minImpressions,
    50,
    0,
    1_000_000_000,
  )
  const limit = boundedInteger(input.limit, 25, 1, 100)
  const selection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    validRows: 0,
    propertySourceRows: input.propertyRows?.length ?? 0,
    propertyInvalidRows: 0,
    propertyQueryGroups: 0,
    queryGroups: 0,
    lowActionabilityQueries: 0,
    brandQueries: 0,
    belowMinimumQueries: 0,
    singlePageQueries: 0,
    incidentalPages: 0,
    dominantQueries: 0,
    missingPropertyQueries: 0,
    suppressedQueries: 0,
    eligibleClusters: 0,
    returnedClusters: 0,
    limitedClusters: 0,
    returnedSuppressions: 0,
    limitedSuppressions: 0,
  }
  const groups = new Map<string, CannibalQueryGroup>()
  const propertyImpressions = new Map<string, number>()
  for (const row of input.propertyRows ?? []) {
    const query = row.keys[0]?.trim() ?? ''
    if (!validCannibalPropertyRow(row, query)) {
      selection.propertyInvalidRows++
      continue
    }
    const key = normalizeCannibalQuery(query)
    propertyImpressions.set(
      key,
      (propertyImpressions.get(key) ?? 0) + row.impressions,
    )
  }
  selection.propertyQueryGroups = propertyImpressions.size
  for (const row of input.rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = normalizeCannibalUrl(row.keys[1]?.trim() ?? '')
    if (!validCannibalRow(row, query, url)) {
      selection.invalidRows++
      continue
    }
    const key = normalizeCannibalQuery(query)
    const group = groups.get(key) ?? { query, pages: new Map() }
    if (compareCannibalText(query, group.query) < 0) group.query = query
    addCannibalRow(group, url ?? '', row)
    groups.set(key, group)
    selection.validRows++
  }
  selection.queryGroups = groups.size

  const items: CannibalItem[] = []
  const allSuppressed: CannibalSuppression[] = []
  for (const [queryKey, group] of groups.entries()) {
    const totalImpressions = [...group.pages.values()].reduce(
      (sum, page) => sum + page.impressions,
      0,
    )
    const propertyDemand = propertyImpressions.get(queryKey)
    if (isLowActionabilityQuery(group.query)) {
      selection.lowActionabilityQueries++
      continue
    }
    if (
      shouldExcludeBrandQuery({
        query: group.query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandQueries++
      if (group.pages.size >= 2) {
        allSuppressed.push({
          query: group.query,
          reason: 'brand_query',
          urlCount: group.pages.size,
          evidenceRef: cannibalBrandEvidence(group.query),
        })
      }
      continue
    }
    if ((propertyDemand ?? totalImpressions) < minImpressions) {
      selection.belowMinimumQueries++
      continue
    }
    if (group.pages.size < 2) {
      selection.singlePageQueries++
      continue
    }
    const pages = [...group.pages.values()].map(
      (page): CannibalPage => ({
        ...page,
        clicks: Number(page.clicks.toFixed(3)),
        impressions: Number(page.impressions.toFixed(3)),
        ctr: Number(page.ctr.toFixed(4)),
        position: Number(page.position.toFixed(2)),
        impressionShare: Number(
          (page.impressions / totalImpressions).toFixed(4),
        ),
        template: detectPageTemplate(page.url),
      }),
    )
    const retainedMaterialPages = pages.filter(
      (page) =>
        page.impressions >= MINIMUM_PAGE_IMPRESSIONS &&
        page.impressionShare >= MINIMUM_PAGE_SHARE,
    )
    selection.incidentalPages += pages.length - retainedMaterialPages.length
    if (retainedMaterialPages.length < 2) {
      selection.dominantQueries++
      continue
    }
    const materialImpressions = retainedMaterialPages.reduce(
      (sum, page) => sum + page.impressions,
      0,
    )
    const materialPages = retainedMaterialPages.map((page) => ({
      ...page,
      impressionShare: Number(
        (page.impressions / materialImpressions).toFixed(4),
      ),
    }))
    const largestShare = Math.max(
      ...materialPages.map((page) => page.impressionShare),
    )
    if (largestShare > MAXIMUM_DOMINANT_SHARE) {
      selection.dominantQueries++
      continue
    }
    const templateRows = materialPages.map((page) =>
      cannibalTemplateRow(page, group.query),
    )
    if (propertyDemand === undefined) selection.missingPropertyQueries++
    items.push(
      createCannibalItem({
        query: group.query,
        pages: materialPages,
        pageExposureImpressions: totalImpressions,
        propertyImpressions: propertyDemand,
        context: cannibalReviewContext(group.query, templateRows),
      }),
    )
  }

  const eligibleItems = items.sort(compareCannibalItems)
  const returnedItems = eligibleItems.slice(0, limit)
  const orderedSuppressions = allSuppressed.sort(
    (left, right) =>
      compareCannibalText(left.query, right.query) ||
      compareCannibalText(left.reason, right.reason),
  )
  const suppressed = orderedSuppressions.slice(0, MAX_SUPPRESSIONS)
  selection.suppressedQueries = allSuppressed.length
  selection.eligibleClusters = eligibleItems.length
  selection.returnedClusters = returnedItems.length
  selection.limitedClusters = eligibleItems.length - returnedItems.length
  selection.returnedSuppressions = suppressed.length
  selection.limitedSuppressions = allSuppressed.length - suppressed.length

  return {
    filters: {
      minImpressions,
      limit,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    selection,
    items: returnedItems,
    suppressed,
    suppressionSummary: allSuppressed.reduce<Record<string, number>>(
      (summary, item) => {
        summary[item.reason] = (summary[item.reason] ?? 0) + 1
        return summary
      },
      {},
    ),
    templates: summarizeTemplates(returnedItems.flatMap((item) => item.pages)),
  }
}

export const CANNIBAL_MINIMUM_PAGE_SHARE = MINIMUM_PAGE_SHARE
export const CANNIBAL_MAXIMUM_DOMINANT_SHARE = MAXIMUM_DOMINANT_SHARE
