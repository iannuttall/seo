import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types.js'
import { detectPageTemplate } from './page-patterns.js'
import type {
  StrikingDistanceAnalysisGroup,
  StrikingDistanceAnalysisItem,
  StrikingDistanceRecommendation,
} from './striking-distance-analysis-types.js'

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((character) => character.codePointAt(0) ?? 0)
  const rightPoints = [...right].map(
    (character) => character.codePointAt(0) ?? 0,
  )
  const length = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < length; index++) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isValidStrikingDistanceRow(
  row: GscRow,
  query: string,
  url: string,
): boolean {
  return (
    Boolean(query) &&
    isHttpUrl(url) &&
    Number.isFinite(row.clicks) &&
    Number.isFinite(row.impressions) &&
    Number.isFinite(row.ctr) &&
    Number.isFinite(row.position) &&
    row.clicks >= 0 &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    row.position > 0
  )
}

export function isStrikingDistanceBrandRow(input: {
  query: string
  site: string
  brandTerms?: string[]
  includeBrand?: boolean
}): boolean {
  return shouldExcludeBrandQuery({
    query: input.query,
    siteUrl: input.site,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
}

function itemRecommendation(input: {
  query: string
  url: string
  impressions: number
  position: number
}): StrikingDistanceRecommendation {
  return {
    type: 'investigate-ranking',
    confidence: 'low',
    evidence: `GSC reports ${input.impressions} impressions at average position ${input.position.toFixed(2)} for "${input.query}" on ${input.url}.`,
    action: `Inspect indexability, canonical state, current query coverage, competing URLs, and relevant internal links for ${input.url} before choosing a change.`,
  }
}

export function strikingDistanceItem(
  row: GscRow,
): StrikingDistanceAnalysisItem {
  const query = row.keys[0]?.trim() ?? ''
  const url = row.keys[1]?.trim() ?? ''
  const proximity = Number(
    Math.min(1, Math.max(0.1, (21 - row.position) / 10)).toFixed(4),
  )
  return {
    query,
    url,
    template: detectPageTemplate(url),
    clicks: Number(row.clicks.toFixed(3)),
    impressions: Number(row.impressions.toFixed(3)),
    ctr: Number(row.ctr.toFixed(4)),
    position: Number(row.position.toFixed(2)),
    priority: {
      method: 'impressions_x_position_proximity',
      score: Number((row.impressions * proximity).toFixed(2)),
      demandImpressions: Number(row.impressions.toFixed(3)),
      positionProximity: proximity,
      heuristic: true,
      estimatedClickLift: false,
    },
    recommendation: itemRecommendation({
      query,
      url,
      impressions: row.impressions,
      position: row.position,
    }),
  }
}

export function compareStrikingDistanceItems(
  left: StrikingDistanceAnalysisItem,
  right: StrikingDistanceAnalysisItem,
): number {
  return (
    right.priority.score - left.priority.score ||
    right.impressions - left.impressions ||
    left.position - right.position ||
    compareText(left.query, right.query) ||
    compareText(left.url, right.url)
  )
}

export function groupStrikingDistanceItems(
  items: StrikingDistanceAnalysisItem[],
): StrikingDistanceAnalysisGroup[] {
  const grouped = new Map<string, StrikingDistanceAnalysisItem[]>()
  for (const item of items) {
    const existing = grouped.get(item.template.id) ?? []
    existing.push(item)
    grouped.set(item.template.id, existing)
  }

  return [...grouped.entries()]
    .map(([id, members]) => {
      const first = members[0]
      if (!first) return undefined
      const urls = [...new Set(members.map((item) => item.url))]
      const queries = [...new Set(members.map((item) => item.query))]
      const totalImpressions = members.reduce(
        (sum, item) => sum + item.impressions,
        0,
      )
      const shared = first.template.confidence !== 'low' && urls.length >= 2
      const evidence = `${members.length} eligible query/page rows represent ${urls.length} unique URLs and ${queries.length} unique queries.`
      return {
        id,
        label: first.template.label,
        template: first.template,
        rowCount: members.length,
        uniqueUrls: urls.length,
        uniqueQueries: queries.length,
        totalImpressions: Number(totalImpressions.toFixed(3)),
        bestPosition: Math.min(...members.map((item) => item.position)),
        impressionWeightedPosition: Number(
          (
            members.reduce(
              (sum, item) => sum + item.position * item.impressions,
              0,
            ) / totalImpressions
          ).toFixed(2),
        ),
        sampleQueries: queries.slice(0, 5),
        sampleUrls: urls.slice(0, 3),
        actionScope: shared ? 'shared-template-candidate' : 'page-level-review',
        recommendation: {
          type: 'investigate-ranking',
          confidence: 'low',
          evidence,
          action: shared
            ? `Review the sampled ${first.template.label.toLowerCase()} URLs for a recurring technical, content, or internal-link pattern before changing the shared template.`
            : `Review these URLs individually; the current evidence does not support a shared-template change.`,
        },
      } satisfies StrikingDistanceAnalysisGroup
    })
    .filter(
      (group): group is StrikingDistanceAnalysisGroup => group !== undefined,
    )
    .sort(
      (left, right) =>
        right.totalImpressions - left.totalImpressions ||
        right.uniqueUrls - left.uniqueUrls ||
        compareText(left.id, right.id),
    )
}
