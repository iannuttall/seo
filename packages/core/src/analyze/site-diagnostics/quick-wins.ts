import { shouldExcludeBrandQuery } from '../../brand.js'
import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { countLabel } from '../../phrasing.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from '../content-coverage.js'
import { detectPageTemplate, summarizeTemplates } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import { CTR_BASELINE, defaultDateRange } from '../shared.js'
import { templateOpportunityRecommendation } from '../workflows/template-recommendations.js'
import { groupQuickWins } from './quick-win-groups.js'
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
        b.totalImpressions - a.totalImpressions,
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
  const minImpressions = input.minImpressions ?? 200
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

  const items: QuickWinItem[] = rows
    .filter((row) => {
      const query = row.keys[0] ?? ''
      return (
        row.position >= 4 &&
        row.position <= 10 &&
        row.impressions >= minImpressions &&
        !isLowActionabilityQuery(query) &&
        !shouldExcludeBrandQuery({
          query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      )
    })
    .map((row) => {
      const rounded = Math.max(1, Math.min(10, Math.round(row.position)))
      const expectedCtrAt3 = CTR_BASELINE[3] ?? 0.1
      const estimatedClickLift = Math.max(
        0,
        (expectedCtrAt3 - row.ctr) * row.impressions,
      )
      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        template: detectPageTemplate(row.keys[1] ?? ''),
        position: row.position,
        impressions: row.impressions,
        ctr: row.ctr,
        expectedCtrAt3,
        estimatedClickLift,
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${row.keys[0]}" sits at position ${rounded} with ${row.impressions} impressions and CTR ${row.ctr.toFixed(3)}.`,
          action: `This page already ranks well for "${row.keys[0]}". Improve the title, meta description, and visible heading so searchers can immediately see that the page answers this query before adding more body copy.`,
          effort: 'S' as const,
          confidence: 'medium' as const,
          impactEstimate: `~+${Math.round(estimatedClickLift)} clicks if it reaches position 3.`,
        },
      }
    })
    .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)

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
      `Estimated lift assumes movement toward position 3 using the built-in CTR baseline; treat it as prioritisation, not a traffic forecast.`,
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
