import { shouldExcludeBrandQuery } from '../../brand.js'
import type { GscRow } from '../../types.js'
import { detectPageTemplate, summarizeTemplates } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import type { DecayGroup, DecayItem } from './types.js'

type DecayDiagnosis = DecayItem['diagnosis']

export type AnalyzeDecayInput = {
  site: string
  currentRows: GscRow[]
  previousRows: GscRow[]
  minDropPct?: number
  minPreviousClicks?: number
  minClickLoss?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

function rowKey(row: GscRow): string {
  return `${row.keys[0] ?? ''}\n${row.keys[1] ?? ''}`
}

function metrics(row?: GscRow): DecayItem['current'] {
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  }
}

function classifyDecay(current: GscRow | undefined, previous: GscRow) {
  if (!current || current.impressions === 0) {
    return {
      diagnosis: 'lost_visibility' as const,
      reason: 'The query/page row disappeared from the current window.',
    }
  }

  if (current.position > previous.position + 1) {
    return {
      diagnosis: 'lost_position' as const,
      reason: 'Ranking position fell between the two windows.',
    }
  }

  if (
    current.impressions >= previous.impressions * 0.9 &&
    current.ctr < previous.ctr * 0.8
  ) {
    return {
      diagnosis: 'lost_ctr' as const,
      reason: 'Position stayed roughly stable but click-through rate dropped.',
    }
  }

  return {
    diagnosis: 'lost_impressions' as const,
    reason: 'Demand or SERP visibility fell because impressions declined.',
  }
}

function recommendation(input: {
  query: string
  url: string
  diagnosis: DecayDiagnosis
  reason: string
  previousClicks: number
  currentClicks: number
  dropPct: number
  templateLabel: string
}) {
  const evidenceRef = `${input.query} on ${input.url}: ${input.previousClicks.toFixed(1)} -> ${input.currentClicks.toFixed(1)} clicks (${input.dropPct.toFixed(1)}% drop). ${input.reason}`

  if (input.diagnosis === 'lost_visibility') {
    return {
      principle: 'C.8',
      evidenceRef,
      action:
        'Check indexability, canonical, redirects, robots, and whether this URL/template still serves the query before rewriting content.',
      effort: 'M' as const,
      confidence: 'high' as const,
    }
  }

  if (input.diagnosis === 'lost_position') {
    return {
      principle: 'C.9',
      evidenceRef,
      action:
        input.templateLabel === 'Other page'
          ? 'Refresh the page sections that used to support the query and tighten internal links to the page.'
          : `Refresh the reusable ${input.templateLabel} sections that support this query, then strengthen internal links to affected URLs.`,
      effort: 'M' as const,
      confidence: 'medium' as const,
    }
  }

  if (input.diagnosis === 'lost_ctr') {
    return {
      principle: 'C.3',
      evidenceRef,
      action:
        'Review title, meta description, and SERP intent fit before changing content depth.',
      effort: 'S' as const,
      confidence: 'medium' as const,
    }
  }

  return {
    principle: 'C.10',
    evidenceRef,
    action:
      'Validate whether the query is shrinking, seasonal, or displaced by SERP features before rewriting the page.',
    effort: 'S' as const,
    confidence: 'medium' as const,
  }
}

function groupRecommendation(group: {
  templateLabel: string
  diagnosis: DecayDiagnosis
  count: number
}) {
  const pluralLabel = group.templateLabel.endsWith(' page')
    ? `${group.templateLabel.slice(0, -5)} pages`
    : group.templateLabel

  if (group.diagnosis === 'lost_visibility') {
    return `Audit indexability/canonical/redirect changes across this ${group.templateLabel} cluster before page-level edits.`
  }
  if (group.diagnosis === 'lost_position') {
    return `Treat this as a template/content refresh: ${group.count} affected ${pluralLabel} lost ranking position.`
  }
  if (group.diagnosis === 'lost_ctr') {
    return `Review SERP/title/meta fit across these ${pluralLabel}; rankings mostly held but CTR fell.`
  }
  return `Check seasonality, demand, and SERP feature displacement before rewriting this ${group.templateLabel} cluster.`
}

function groupDecay(items: DecayItem[]): DecayGroup[] {
  const groups = new Map<string, DecayGroup>()

  for (const item of items) {
    const id = `${item.template.id}:${item.diagnosis}`
    const existing = groups.get(id) ?? {
      id,
      label: `${item.template.label} - ${item.diagnosis.replaceAll('_', ' ')}`,
      diagnosis: item.diagnosis,
      template: item.template,
      count: 0,
      totalClickLoss: 0,
      totalPreviousClicks: 0,
      averageDropPct: 0,
      sampleQueries: [],
      sampleUrls: [],
      recommendation: '',
    }

    existing.count += 1
    existing.totalClickLoss += item.clickLoss
    existing.totalPreviousClicks += item.previous.clicks
    if (existing.sampleQueries.length < 5)
      existing.sampleQueries.push(item.query)
    if (existing.sampleUrls.length < 3) existing.sampleUrls.push(item.url)
    groups.set(id, existing)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalClickLoss: Number(group.totalClickLoss.toFixed(2)),
      totalPreviousClicks: Number(group.totalPreviousClicks.toFixed(2)),
      averageDropPct:
        group.totalPreviousClicks > 0
          ? Number(
              (
                (group.totalClickLoss / group.totalPreviousClicks) *
                100
              ).toFixed(1),
            )
          : 0,
      recommendation: groupRecommendation({
        templateLabel: group.template.label,
        diagnosis: group.diagnosis,
        count: group.count,
      }),
    }))
    .sort((a, b) => b.totalClickLoss - a.totalClickLoss)
}

export function analyzeDecay(input: AnalyzeDecayInput): {
  items: DecayItem[]
  groups: DecayGroup[]
  templates: ReturnType<typeof summarizeTemplates>
} {
  const minDropPct = input.minDropPct ?? 20
  const minPreviousClicks = input.minPreviousClicks ?? 2
  const minClickLoss = input.minClickLoss ?? 1
  const currentByKey = new Map(
    input.currentRows.map((row) => [rowKey(row), row]),
  )
  const items: DecayItem[] = []

  for (const previous of input.previousRows) {
    const query = previous.keys[0] ?? ''
    const url = previous.keys[1] ?? ''
    if (!query || !url) continue
    if (previous.clicks < minPreviousClicks) continue
    if (isLowActionabilityQuery(query)) continue
    if (
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      continue
    }

    const current = currentByKey.get(rowKey(previous))
    const clickLoss = previous.clicks - (current?.clicks ?? 0)
    if (clickLoss < minClickLoss) continue

    const dropPct = (clickLoss / previous.clicks) * 100
    if (dropPct < minDropPct) continue

    const template = detectPageTemplate(url)
    const classification = classifyDecay(current, previous)

    items.push({
      query,
      url,
      template,
      clickLoss: Number(clickLoss.toFixed(2)),
      dropPct: Number(dropPct.toFixed(1)),
      current: metrics(current),
      previous: metrics(previous),
      diagnosis: classification.diagnosis,
      recommendation: recommendation({
        query,
        url,
        diagnosis: classification.diagnosis,
        reason: classification.reason,
        previousClicks: previous.clicks,
        currentClicks: current?.clicks ?? 0,
        dropPct,
        templateLabel: template.label,
      }),
    })
  }

  const sorted = items.sort(
    (a, b) =>
      b.clickLoss - a.clickLoss || b.previous.clicks - a.previous.clicks,
  )

  return {
    items: sorted,
    groups: groupDecay(sorted),
    templates: summarizeTemplates(sorted),
  }
}
