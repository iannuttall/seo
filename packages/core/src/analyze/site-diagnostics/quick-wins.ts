import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { countLabel } from '../../phrasing.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from '../content-coverage.js'
import { summarizeTemplates } from '../page-patterns.js'
import { defaultDateRange } from '../shared.js'
import { templateOpportunityRecommendation } from '../workflows/template-recommendations.js'
import { groupQuickWins } from './quick-win-groups.js'
import { analyzeQuickWinsFromRows } from './quick-wins-analysis.js'
import type { QuickWinItem } from './types.js'

type QuickWinTemplateRecommendation = {
  templateId: string
  templateLabel: string
  count: number
  totalEstimatedClickLift: number
  totalImpressions: number
  action: string
  evidence: string
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function verifiedQuickWinAction(coverage: QueryContentCoverage): {
  action: string
  confidence: 'high' | 'medium' | 'low'
} {
  const action = contentCoverageRecommendation(coverage)
  if (coverage.status === 'failed') return { action, confidence: 'low' }
  if (coverage.classification === 'content-gap') {
    return { action, confidence: 'high' }
  }
  if (coverage.classification === 'technical-check') {
    return { action, confidence: 'medium' }
  }
  return { action, confidence: 'medium' }
}

function templateRecommendations(
  items: QuickWinItem[],
): QuickWinTemplateRecommendation[] {
  const byTemplate = new Map<string, QuickWinItem[]>()
  for (const item of items) {
    const existing = byTemplate.get(item.template.id) ?? []
    existing.push(item)
    byTemplate.set(item.template.id, existing)
  }

  return [...byTemplate.entries()]
    .map(([templateId, templateItems]) => {
      const first = templateItems[0]
      if (!first) return undefined
      const recommendation = templateOpportunityRecommendation({
        templateId,
        templateLabel: first.template.label,
        items: templateItems,
      })
      return {
        templateId,
        templateLabel: first.template.label,
        count: templateItems.length,
        totalEstimatedClickLift: Number(
          templateItems
            .reduce((sum, item) => sum + item.estimatedClickLift, 0)
            .toFixed(2),
        ),
        totalImpressions: Number(
          templateItems
            .reduce((sum, item) => sum + item.impressions, 0)
            .toFixed(0),
        ),
        action: recommendation.action,
        evidence: recommendation.evidence,
      }
    })
    .filter(
      (recommendation): recommendation is QuickWinTemplateRecommendation =>
        recommendation !== undefined && recommendation.count >= 2,
    )
    .sort(
      (a, b) =>
        b.totalEstimatedClickLift - a.totalEstimatedClickLift ||
        b.totalImpressions - a.totalImpressions ||
        compareText(a.templateId, b.templateId),
    )
}

function quickWinVerdict(input: {
  items: QuickWinItem[]
  templates: QuickWinTemplateRecommendation[]
}): string {
  if (!input.items.length) return 'No quick wins matched these filters.'
  const topTemplate = input.templates[0]
  if (topTemplate) {
    return `${input.items.length} quick wins found. The biggest template pattern is ${topTemplate.templateLabel}, with ${topTemplate.count} rows and about ${topTemplate.totalEstimatedClickLift.toFixed(0)} estimated clicks available.`
  }
  return `${input.items.length} quick wins found. Start with the highest estimated click lift rows.`
}

export async function quickWinsReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}) {
  const range = defaultDateRange(28)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )
  const { items, minImpressions, benchmarkRows, benchmarkByPosition } =
    analyzeQuickWinsFromRows({
      rows,
      site: input.site,
      minImpressions: input.minImpressions,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })

  if (input.verifyContent) {
    const verifyLimit = input.verifyLimit ?? 5
    const coverageByKey = new Map<string, QueryContentCoverage>()
    for (const item of items.slice(0, verifyLimit)) {
      const key = `${item.query}\n${item.url}`
      const existing = coverageByKey.get(key)
      const contentVerification =
        existing ??
        (await verifyQueryContent({
          query: item.query,
          url: item.url,
          js: input.js,
          refresh: input.refresh,
          rate: input.rate,
        }))
      coverageByKey.set(key, contentVerification)
      item.contentVerification = contentVerification
      const verified = verifiedQuickWinAction(contentVerification)
      item.recommendation = {
        ...item.recommendation,
        action: verified.action,
        confidence: verified.confidence,
        evidenceRef: `${item.recommendation.evidenceRef} ${contentVerification.summary}`,
      }
    }
  }

  const groups = groupQuickWins(items)
  const templates = summarizeTemplates(items)
  const templateActions = templateRecommendations(items)
  const recommendations = [
    ...templateActions.slice(0, 5).map((template) => template.action),
    ...groups.slice(0, 5).map((group) => group.recommendation),
  ].slice(0, 5)

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range,
    benchmark: {
      method: 'site_gsc_position_bucket_robust_p75_leave_one_out',
      peerRows: benchmarkRows,
      byPosition: benchmarkByPosition,
    },
    verification: input.verifyContent
      ? {
          requested: true,
          limit: input.verifyLimit ?? 5,
          verified: items.filter((item) => item.contentVerification).length,
          failed: items.filter(
            (item) => item.contentVerification?.status === 'failed',
          ).length,
        }
      : { requested: false, verified: 0, failed: 0 },
    summary: {
      rows: items.length,
      repeatedQueryGroups: groups.length,
      templatePatterns: templateActions.length,
      totalEstimatedClickLift: Number(
        items
          .reduce((sum, item) => sum + item.estimatedClickLift, 0)
          .toFixed(2),
      ),
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: quickWinVerdict({ items, templates: templateActions }),
    },
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate}.`,
      `Filters: positions 4-10, at least ${minImpressions} impressions, and brand queries ${input.includeBrand ? 'included' : 'excluded when detected/configured'}.`,
      'Estimated lift is the gap between actual and expected CTR at the current rounded position, multiplied by impressions.',
      'The expected CTR uses a robust site-aware benchmark when enough peer data exists, otherwise the fallback position curve.',
      'CTR benchmarks are directional heuristics and do not account for SERP features. Treat lift as prioritisation, not a traffic forecast.',
      `Content verification: ${input.verifyContent ? `requested for top ${countLabel(input.verifyLimit ?? 5, 'row')}` : 'not run'}.`,
    ],
    recommendations: recommendations.length
      ? recommendations
      : [
          'No quick-win action is recommended from this report. Lower --min-impressions if you want long-tail inspection.',
        ],
    templates,
    templateRecommendations: templateActions,
    groups,
    items,
  }
}
