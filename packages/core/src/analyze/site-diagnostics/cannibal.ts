import { shouldExcludeBrandQuery } from '../../brand.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import type { GscRow } from '../../types.js'
import {
  detectPageTemplate,
  dominantTemplate,
  dominantTemplateFamily,
  isLikelyGenericTemplateQuery,
  isLikelyLocalOrEntityIntent,
  isQuotedQuery,
  summarizeTemplates,
} from '../page-patterns.js'
import { defaultDateRange } from '../shared.js'
import type {
  CannibalItem,
  CannibalSuppression,
  CannibalSuppressionReason,
} from './types.js'

function ownerScore(row: {
  clicks: number
  impressions: number
  position: number
}) {
  return (
    row.clicks * 10 + row.impressions * 0.02 + Math.max(0, 20 - row.position)
  )
}

function suppressionReason(input: {
  query: string
  rows: GscRow[]
}): CannibalSuppressionReason | undefined {
  if (isQuotedQuery(input.query)) return 'quoted_boilerplate'
  const family = dominantTemplateFamily(input.rows)
  const sameFamily = family.share >= 0.8 && family.id !== 'other'
  if (sameFamily && isLikelyLocalOrEntityIntent(input.query)) {
    return 'local_or_entity_intent'
  }
  if (sameFamily && isLikelyGenericTemplateQuery(input.query)) {
    return 'template_overlap'
  }
  return undefined
}

function suppressionEvidence(input: {
  query: string
  reason: CannibalSuppressionReason
  urlCount: number
}): string {
  if (input.reason === 'quoted_boilerplate') {
    return `Query "${input.query}" looks like a quoted text fragment, which usually points to shared boilerplate rather than URL cannibalisation.`
  }
  if (input.reason === 'local_or_entity_intent') {
    return `Query "${input.query}" is local/entity intent across ${input.urlCount} template URLs; choosing one owner would likely be wrong.`
  }
  if (input.reason === 'template_overlap') {
    return `Query "${input.query}" appears across ${input.urlCount} pages in the same template family; review the template before consolidating pages.`
  }
  return `Query "${input.query}" was excluded as branded.`
}

export async function cannibalReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const minImpressions = input.minImpressions ?? 50
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

  const byQuery = new Map<string, typeof rows>()
  for (const row of rows) {
    const query = row.keys[0] ?? ''
    const existing = byQuery.get(query) ?? []
    existing.push(row)
    byQuery.set(query, existing)
  }

  const items: CannibalItem[] = []
  const suppressed: CannibalSuppression[] = []
  for (const [query, queryRows] of byQuery.entries()) {
    const eligible = queryRows.filter(
      (row) => row.impressions >= minImpressions,
    )
    if (eligible.length < 2) {
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
      suppressed.push({
        query,
        reason: 'brand_query',
        urlCount: queryRows.length,
        evidenceRef: suppressionEvidence({
          query,
          reason: 'brand_query',
          urlCount: queryRows.length,
        }),
      })
      continue
    }

    const reason = suppressionReason({ query, rows: eligible })
    if (reason) {
      const template = dominantTemplateFamily(eligible).template
      suppressed.push({
        query,
        reason,
        urlCount: eligible.length,
        template,
        evidenceRef: suppressionEvidence({
          query,
          reason,
          urlCount: eligible.length,
        }),
      })
      continue
    }

    const totalImpressions = eligible.reduce(
      (sum, row) => sum + row.impressions,
      0,
    )
    const hhi = eligible.reduce((sum, row) => {
      const share = row.impressions / totalImpressions
      return sum + share * share
    }, 0)

    if (hhi >= 0.5) {
      continue
    }

    const owner = [...eligible].sort((a, b) => ownerScore(b) - ownerScore(a))[0]
    if (!owner) {
      continue
    }
    const template = dominantTemplate(eligible)
    items.push({
      query,
      pages: eligible.map((row) => ({
        url: row.keys[1] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        template: detectPageTemplate(row.keys[1] ?? ''),
      })),
      hhi,
      ownerUrl: owner.keys[1] ?? '',
      template: template.share >= 0.8 ? template.template : undefined,
      recommendation: {
        principle: 'C.6',
        evidenceRef: `Query "${query}" splits across ${eligible.length} URLs with HHI ${hhi.toFixed(2)}.`,
        action:
          template.share >= 0.8 && template.template.id !== 'other'
            ? `Several ${template.template.label} URLs rank for "${query}". First check whether they are genuinely different entities. If they are, do not merge them; make the template clarify each page's unique target. If they serve the same intent, make ${owner.keys[1]} the main page and point internal links there.`
            : `Multiple URLs rank for "${query}". If they answer the same intent, make ${owner.keys[1]} the main page and consolidate internal links, canonicals, and on-page wording around it. If they answer different intents, keep them separate and make that difference clearer.`,
        effort: 'M',
        confidence: 'medium',
      },
    })
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    templates: summarizeTemplates(items.flatMap((item) => item.pages)),
    suppressed,
    suppressionSummary: suppressed.reduce<Record<string, number>>(
      (summary, item) => {
        summary[item.reason] = (summary[item.reason] ?? 0) + 1
        return summary
      },
      {},
    ),
    items,
  }
}
