import type { GscRow } from '../../types.js'
import {
  dominantTemplate,
  dominantTemplateFamily,
  isLikelyLocalOrEntityIntent,
  isQuotedQuery,
} from '../page-patterns.js'
import { compareCannibalText } from './cannibal-analysis-primitives.js'
import type { CannibalItem, CannibalPage } from './cannibal-types.js'

export function cannibalReviewContext(
  query: string,
  rows: GscRow[],
): CannibalItem['reviewContext'] {
  const context: CannibalItem['reviewContext'] = []
  if (isQuotedQuery(query)) context.push('quoted-query')
  const family = dominantTemplateFamily(rows)
  const sameFamily = family.share >= 0.8 && family.id !== 'other'
  if (sameFamily) context.push('same-template-family')
  if (sameFamily && isLikelyLocalOrEntityIntent(query)) {
    context.push('local-or-entity-intent')
  }
  return context
}

export function cannibalBrandEvidence(query: string): string {
  return `Query "${query}" was excluded as branded.`
}

export function cannibalTemplateRow(page: CannibalPage, query: string): GscRow {
  return {
    keys: [query, page.url],
    clicks: page.clicks,
    impressions: page.impressions,
    ctr: page.ctr,
    position: page.position,
  }
}

function comparePages(left: CannibalPage, right: CannibalPage): number {
  return (
    right.clicks - left.clicks ||
    right.impressions - left.impressions ||
    left.position - right.position ||
    compareCannibalText(left.url, right.url)
  )
}

export function createCannibalItem(input: {
  query: string
  pages: CannibalPage[]
  pageExposureImpressions: number
  propertyImpressions?: number
  context: CannibalItem['reviewContext']
}): CannibalItem {
  const { query, pages } = input
  const materialClicks = pages.reduce((sum, page) => sum + page.clicks, 0)
  const materialImpressions = pages.reduce(
    (sum, page) => sum + page.impressions,
    0,
  )
  const owner = [...pages].sort(comparePages)[0]
  const hhi = pages.reduce((sum, page) => sum + page.impressionShare ** 2, 0)
  const largestPageShare = Math.max(
    ...pages.map((page) => page.impressionShare),
  )
  const secondaryExposureShare = 1 - largestPageShare
  const demandImpressions =
    input.propertyImpressions ?? input.pageExposureImpressions
  const template = dominantTemplate(
    pages.map((page) => cannibalTemplateRow(page, query)),
  )
  const suggestedOwnerUrl = owner?.url ?? pages[0]?.url ?? ''

  return {
    query,
    pages: [...pages].sort(
      (left, right) =>
        right.impressionShare - left.impressionShare ||
        comparePages(left, right),
    ),
    pageCount: pages.length,
    materialPageClicks: Number(materialClicks.toFixed(3)),
    materialPageExposureImpressions: Number(materialImpressions.toFixed(3)),
    pageExposureImpressions: Number(input.pageExposureImpressions.toFixed(3)),
    propertyImpressions: input.propertyImpressions,
    observedPageExposureRatio:
      input.propertyImpressions && input.propertyImpressions > 0
        ? Number(
            (input.pageExposureImpressions / input.propertyImpressions).toFixed(
              4,
            ),
          )
        : undefined,
    additionalUrlExposures:
      input.propertyImpressions === undefined
        ? undefined
        : Number(
            Math.max(
              0,
              input.pageExposureImpressions - input.propertyImpressions,
            ).toFixed(3),
          ),
    hhi: Number(hhi.toFixed(4)),
    splitScore: Number((1 - hhi).toFixed(4)),
    largestPageShare: Number(largestPageShare.toFixed(4)),
    secondaryExposureShare: Number(secondaryExposureShare.toFixed(4)),
    reviewContext: input.context,
    suggestedOwnerUrl,
    ownerSelection: {
      method: 'clicks_then_impressions_then_position',
      confidence: 'low',
      requiresIntentReview: true,
    },
    priority: {
      method: 'demand_impressions_x_secondary_exposure',
      score: Number((demandImpressions * secondaryExposureShare).toFixed(3)),
      demandImpressions: Number(demandImpressions.toFixed(3)),
      secondaryExposureShare: Number(secondaryExposureShare.toFixed(4)),
      heuristic: true,
      estimatedClickLift: false,
    },
    template: template.share >= 0.8 ? template.template : undefined,
    recommendation: {
      principle: 'C.6',
      evidenceRef: `GSC retained ${pages.length} material URLs for "${query}" across ${input.pageExposureImpressions.toFixed(0)} page exposures${input.propertyImpressions === undefined ? '' : ` and ${input.propertyImpressions.toFixed(0)} property impressions`}; the largest material URL share was ${(largestPageShare * 100).toFixed(1)}%.`,
      action: `Compare the intent and technical state of these URLs. If they satisfy the same intent, choose a preferred page and align internal links, canonicals, and on-page focus. If they satisfy different intents, keep them separate and clarify the distinction. Treat ${suggestedOwnerUrl} only as the first review candidate based on observed clicks, impressions, and position.`,
      effort: 'M',
      confidence: 'low',
    },
  }
}

export function compareCannibalItems(
  left: CannibalItem,
  right: CannibalItem,
): number {
  return (
    right.priority.score - left.priority.score ||
    right.priority.demandImpressions - left.priority.demandImpressions ||
    compareCannibalText(left.query, right.query)
  )
}
