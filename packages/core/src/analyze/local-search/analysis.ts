import { shouldExcludeBrandQuery } from '../../brand.js'
import type { GscRow } from '../../types.js'
import { clusterPseoTemplates, templateForUrl } from '../pseo/templates.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import { createLocalIntentClassifier } from './intent.js'
import type { LocalSearchOpportunity, LocalSearchTemplate } from './types.js'

type Selection = {
  sourceRows: number
  invalidRows: number
  exactDuplicateRows: number
  conflictingRows: number
  lowActionabilityRows: number
  brandRows: number
  nonLocalRows: number
  belowMinimumRows: number
  eligibleQueries: number
  returnedQueries: number
  omittedQueries: number
  limit: number
  minImpressions: number
}

type ValidRow = {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validRow(row: GscRow): ValidRow | null {
  const query = row.keys[0]?.trim() ?? ''
  const page = row.keys[1]?.trim() ?? ''
  let validPage = false
  try {
    validPage = ['http:', 'https:'].includes(new URL(page).protocol)
  } catch {
    validPage = false
  }
  if (
    row.keys.length !== 2 ||
    !query ||
    !validPage ||
    !Number.isFinite(row.clicks) ||
    !Number.isFinite(row.impressions) ||
    !Number.isFinite(row.ctr) ||
    !Number.isFinite(row.position) ||
    row.clicks < 0 ||
    row.impressions <= 0 ||
    row.clicks > row.impressions ||
    row.ctr < 0 ||
    row.ctr > 1 ||
    row.position <= 0
  ) {
    return null
  }
  return {
    query,
    page,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }
}

function rowSignature(row: ValidRow): string {
  return `${row.clicks}\u0000${row.impressions}\u0000${row.ctr}\u0000${row.position}`
}

function normalizeRows(rows: GscRow[], selection: Selection): ValidRow[] {
  const grouped = new Map<string, ValidRow[]>()
  for (const source of rows) {
    const row = validRow(source)
    if (!row) {
      selection.invalidRows++
      continue
    }
    const key = `${row.query}\u0000${row.page}`
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }

  const result: ValidRow[] = []
  for (const group of grouped.values()) {
    const signatures = new Set(group.map(rowSignature))
    if (signatures.size > 1) {
      selection.conflictingRows += group.length
      continue
    }
    selection.exactDuplicateRows += group.length - 1
    const row = group[0]
    if (row) result.push(row)
  }
  return result
}

function opportunityAction(
  position: number,
  pageCount: number,
): LocalSearchOpportunity['action'] {
  if (pageCount > 1) return 'review-page-overlap'
  if (position <= 3) return 'protect-visibility'
  if (position <= 20) return 'improve-existing-page'
  return 'investigate-relevance'
}

function aggregateQueries(input: {
  rows: ValidRow[]
  site: string
  locationTerms: string[]
  brandTerms?: string[]
  includeBrand?: boolean
  minImpressions: number
  selection: Selection
  classify: ReturnType<typeof createLocalIntentClassifier>
}): LocalSearchOpportunity[] {
  const grouped = new Map<string, ValidRow[]>()
  for (const row of input.rows) {
    if (isLowActionabilityQuery(row.query)) {
      input.selection.lowActionabilityRows++
      continue
    }
    if (
      shouldExcludeBrandQuery({
        query: row.query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      input.selection.brandRows++
      continue
    }
    grouped.set(row.query, [...(grouped.get(row.query) ?? []), row])
  }

  const opportunities: LocalSearchOpportunity[] = []
  for (const [query, rows] of grouped) {
    const intent = input.classify(query)
    if (!intent) {
      input.selection.nonLocalRows += rows.length
      continue
    }
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
    if (impressions < input.minImpressions) {
      input.selection.belowMinimumRows += rows.length
      continue
    }
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
    const averagePosition =
      rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
      impressions
    const pages = rows
      .map((row) => ({
        url: row.page,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions ? row.clicks / row.impressions : 0,
        averagePosition: row.position,
      }))
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.clicks - left.clicks ||
          left.averagePosition - right.averagePosition ||
          compareText(left.url, right.url),
      )
    opportunities.push({
      query,
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      averagePosition,
      intent,
      action: opportunityAction(averagePosition, pages.length),
      pages,
      pageCoverage: {
        available: pages.length,
        returned: Math.min(3, pages.length),
        omitted: Math.max(0, pages.length - 3),
      },
    })
  }
  return opportunities.sort(
    (left, right) =>
      right.impressions - left.impressions ||
      right.clicks - left.clicks ||
      left.averagePosition - right.averagePosition ||
      compareText(left.query, right.query),
  )
}

function localTemplates(
  opportunities: LocalSearchOpportunity[],
): LocalSearchTemplate[] {
  const allPages = opportunities.flatMap((item) =>
    item.pages.map((page) => page.url),
  )
  const clusters = clusterPseoTemplates(allPages, {
    minUrls: 2,
    minShare: 0,
    limit: 10,
    sampleSize: 5,
  })
  return clusters.map((cluster) => {
    const matched = opportunities.flatMap((item) =>
      item.pages
        .filter(
          (page) => templateForUrl(page.url, clusters) === cluster.signature,
        )
        .map((page) => ({ query: item.query, page })),
    )
    return {
      heuristic: true,
      signature: cluster.signature,
      urlCount: cluster.urlCount,
      sampleUrls: cluster.sampleUrls,
      queryCount: new Set(matched.map((item) => item.query)).size,
      clicks: matched.reduce((sum, item) => sum + item.page.clicks, 0),
      impressions: matched.reduce(
        (sum, item) => sum + item.page.impressions,
        0,
      ),
    }
  })
}

export function analyzeLocalSearchRows(input: {
  rows: GscRow[]
  site: string
  locationTerms: string[]
  brandTerms?: string[]
  includeBrand?: boolean
  minImpressions: number
  limit: number
}) {
  const selection: Selection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    exactDuplicateRows: 0,
    conflictingRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    nonLocalRows: 0,
    belowMinimumRows: 0,
    eligibleQueries: 0,
    returnedQueries: 0,
    omittedQueries: 0,
    limit: input.limit,
    minImpressions: input.minImpressions,
  }
  const normalized = normalizeRows(input.rows, selection)
  const eligible = aggregateQueries({
    ...input,
    rows: normalized,
    selection,
    classify: createLocalIntentClassifier(input.locationTerms),
  })
  selection.eligibleQueries = eligible.length
  selection.returnedQueries = Math.min(input.limit, eligible.length)
  selection.omittedQueries = Math.max(0, eligible.length - input.limit)
  const eligibleSummary = {
    clicks: eligible.reduce((sum, item) => sum + item.clicks, 0),
    impressions: eligible.reduce((sum, item) => sum + item.impressions, 0),
    namedLocationQueries: eligible.filter((item) =>
      item.intent.classes.includes('named-location'),
    ).length,
    nearbyQueries: eligible.filter((item) =>
      item.intent.classes.includes('nearby'),
    ).length,
    postalCodeQueries: eligible.filter((item) =>
      item.intent.classes.includes('postal-code'),
    ).length,
    pageOverlapQueries: eligible.filter(
      (item) => item.action === 'review-page-overlap',
    ).length,
  }
  return {
    selection,
    eligibleSummary,
    eligiblePageCount: new Set(
      eligible.flatMap((item) => item.pages.map((page) => page.url)),
    ).size,
    eligiblePageUrls: [
      ...new Set(
        eligible.flatMap((item) => item.pages.map((page) => page.url)),
      ),
    ].sort(compareText),
    opportunities: eligible.slice(0, input.limit).map((item) => ({
      ...item,
      pages: item.pages.slice(0, 3),
    })),
    templates: localTemplates(eligible),
  }
}
