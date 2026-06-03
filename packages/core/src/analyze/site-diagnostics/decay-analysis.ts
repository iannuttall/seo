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
  const action = itemDecayAction({
    diagnosis: input.diagnosis,
    templateLabel: input.templateLabel,
  })

  if (input.diagnosis === 'lost_visibility') {
    return {
      principle: 'C.8',
      evidenceRef,
      action,
      effort: 'M' as const,
      confidence: 'high' as const,
    }
  }

  if (input.diagnosis === 'lost_position') {
    return {
      principle: 'C.9',
      evidenceRef,
      action,
      effort: 'M' as const,
      confidence: 'medium' as const,
    }
  }

  if (input.diagnosis === 'lost_ctr') {
    return {
      principle: 'C.3',
      evidenceRef,
      action,
      effort: 'S' as const,
      confidence: 'medium' as const,
    }
  }

  return {
    principle: 'C.10',
    evidenceRef,
    action,
    effort: 'S' as const,
    confidence: 'medium' as const,
  }
}

function templateFamily(templateLabel: string): string {
  const normalized = templateLabel.toLowerCase()
  if (normalized.includes('salary')) return 'salary'
  if (normalized.includes('location schedule')) return 'schedule'
  if (normalized.includes('last-name list')) return 'name-list'
  if (normalized.includes('first-name list')) return 'name-list'
  if (normalized.includes('surname')) return 'surname'
  if (normalized.includes('first-name')) return 'first-name'
  return 'default'
}

function itemDecayAction(input: {
  diagnosis: DecayDiagnosis
  templateLabel: string
}): string {
  const family = templateFamily(input.templateLabel)

  if (input.diagnosis === 'lost_visibility') {
    return 'This query/page disappeared from current GSC data. Check whether the URL is still indexable, canonical, internally linked, and returning the right page before rewriting content.'
  }

  if (family === 'salary') {
    if (input.diagnosis === 'lost_ctr') {
      return 'Rankings mostly held but clicks fell. Check the live SERP, then rewrite the title/meta to make salary, monthly pay, currency, and location wording clearer before editing the salary data.'
    }
    if (input.diagnosis === 'lost_position') {
      return 'The page lost ranking position. Refresh the salary data, make the job/location entity clearer, cover monthly/hourly variants, and add internal links into the affected page.'
    }
    return 'Impressions fell. Check whether demand shifted by job or location, then verify salary data freshness, currency/monthly variants, and crawlability.'
  }

  if (family === 'schedule') {
    if (input.diagnosis === 'lost_ctr') {
      return 'Rankings mostly held but clicks fell. Rewrite title/meta so the exact place, date/time, chart/table, current year, and local wording are obvious.'
    }
    if (input.diagnosis === 'lost_position') {
      return 'The page lost ranking position. Refresh current-year data tables, add local aliases, and link from nearby location pages.'
    }
    return 'Impressions fell. Check data freshness, current-year coverage, local aliases, and whether search demand moved to newer calendar terms.'
  }

  if (family === 'name-list') {
    if (input.diagnosis === 'lost_ctr') {
      return 'Rankings mostly held but clicks fell. Test title/meta wording that matches the exact list intent: length, starting letter, ethnicity, rarity, and “last names” phrasing.'
    }
    if (input.diagnosis === 'lost_position') {
      return 'The page lost ranking position. Refresh the intro, examples, filters, and internal links so the page better satisfies the exact name-list facet.'
    }
    return 'Impressions fell. Check whether this list facet lost demand, then refresh examples, intro copy, and internal links for that facet.'
  }

  if (family === 'surname') {
    if (input.diagnosis === 'lost_ctr') {
      return 'Rankings mostly held but clicks fell. Test title/meta wording for origin, meaning, caste, rarity, and “how many people have this last name” variants.'
    }
    if (input.diagnosis === 'lost_position') {
      return 'The page lost ranking position. Refresh surname origin, meaning, geography, rarity, and internal-link sections for the affected query.'
    }
    return 'Impressions fell. Check whether surname demand shifted, then refresh origin, meaning, caste/geography, and rarity sections where relevant.'
  }

  if (family === 'first-name') {
    if (input.diagnosis === 'lost_ctr') {
      return 'Rankings mostly held but clicks fell. Test title/meta wording for meaning, origin, gender, popularity, and history phrasing.'
    }
    if (input.diagnosis === 'lost_position') {
      return 'The page lost ranking position. Refresh meaning, origin, popularity, gender, and history sections for the affected query.'
    }
    return 'Impressions fell. Check whether first-name demand shifted, then refresh meaning, origin, popularity, gender, and history sections.'
  }

  if (input.diagnosis === 'lost_position') {
    return 'The page lost ranking position. Refresh the section that supports this query and add internal links from related pages.'
  }
  if (input.diagnosis === 'lost_ctr') {
    return 'Rankings mostly held but clicks fell. Test the title and meta description before changing content depth.'
  }
  return 'Impressions fell. Check whether the query is shrinking, seasonal, or displaced by SERP features before rewriting the page.'
}

function groupRecommendation(group: {
  templateLabel: string
  diagnosis: DecayDiagnosis
  count: number
}) {
  const pluralLabel = group.templateLabel.endsWith(' page')
    ? `${group.templateLabel.slice(0, -5)} pages`
    : group.templateLabel
  const family = templateFamily(group.templateLabel)

  if (group.diagnosis === 'lost_visibility') {
    return `These ${group.templateLabel} URLs disappeared from current GSC data. Check indexability, canonicals, redirects, robots, and internal links across the cluster before editing page copy.`
  }

  if (family === 'salary') {
    if (group.diagnosis === 'lost_ctr') {
      return `Clicks fell while rankings mostly held across ${pluralLabel}. Rewrite the salary title/meta template around monthly pay, currency, job title, and location wording.`
    }
    if (group.diagnosis === 'lost_position') {
      return `${group.count} ${pluralLabel} lost ranking position. Refresh salary data, job/location coverage, and internal links across the affected pages.`
    }
    return `Impressions fell across this ${group.templateLabel} cluster. Check salary-data freshness, country/city coverage, and whether SERP demand shifted.`
  }

  if (family === 'schedule') {
    if (group.diagnosis === 'lost_ctr') {
      return `Clicks fell while rankings mostly held. Rewrite the title/meta template so exact place, date/time, chart/table, current year, and local wording are clearer.`
    }
    if (group.diagnosis === 'lost_position') {
      return `${pluralLabel} lost ranking position. Refresh current-year data tables, local aliases, nearby-location links, and template copy.`
    }
    return `Impressions fell across this location cluster. Check data freshness, current-year coverage, local aliases, and SERP demand shifts.`
  }

  if (family === 'name-list') {
    if (group.diagnosis === 'lost_ctr') {
      return `Clicks fell while rankings mostly held. Test name-list title/meta templates around length, starting letter, ethnicity, rarity, and exact "last names" phrasing.`
    }
    if (group.diagnosis === 'lost_position') {
      return `${group.count} name-list pages lost ranking position. Refresh list intros, examples, filters, and internal links.`
    }
    return `Impressions fell across this name-list cluster. Check demand first, then refresh examples, intro copy, filters, and internal links.`
  }

  if (family === 'surname') {
    if (group.diagnosis === 'lost_ctr') {
      return `Clicks fell while rankings mostly held. Test surname title/meta templates for origin, meaning, caste, rarity, and people-count query variants.`
    }
    if (group.diagnosis === 'lost_position') {
      return `${group.count} surname pages lost ranking position. Refresh origin, meaning, geography, rarity, and internal links.`
    }
    return `Impressions fell across this surname cluster. Check demand shifts, then refresh origin, meaning, caste/geography, and rarity sections.`
  }

  if (group.diagnosis === 'lost_position') {
    return `${group.count} ${pluralLabel} lost ranking position. Refresh the shared template/content pattern and add internal links to the affected pages.`
  }
  if (group.diagnosis === 'lost_ctr') {
    return `Clicks fell while rankings mostly held across these ${pluralLabel}. Test title/meta wording before rewriting page content.`
  }
  return `Impressions fell across this ${group.templateLabel} cluster. Check seasonality, demand, and SERP feature changes before rewriting pages.`
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
