import type { GscRow } from '../../types.js'
import { detectPageTemplate, type PageTemplate } from '../page-patterns.js'
import type {
  DecayDiagnosis,
  DecayGroup,
  DecayItem,
  DecayMetrics,
  DecaySignal,
} from './decay-types.js'

export type AggregatedDecayRow = GscRow & { keys: [string, string] }

export function compareDecayText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index++
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference) return difference
  }
  return leftPoints.length - rightPoints.length
}

export function normalizeDecayQuery(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function validRow(row: GscRow, query: string, url?: string): boolean {
  return (
    Boolean(query && url) &&
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    Number.isFinite(row.ctr) &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    Number.isFinite(row.position) &&
    row.position > 0
  )
}

export function aggregateDecayRows(rows: GscRow[]): {
  rows: AggregatedDecayRow[]
  invalid: number
} {
  const grouped = new Map<string, AggregatedDecayRow>()
  let invalid = 0
  for (const row of rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = normalizeUrl(row.keys[1]?.trim() ?? '')
    if (!validRow(row, query, url)) {
      invalid++
      continue
    }
    const key = `${normalizeDecayQuery(query)}\u0000${url}`
    const current = grouped.get(key)
    const clicks = (current?.clicks ?? 0) + row.clicks
    const impressions = (current?.impressions ?? 0) + row.impressions
    const position =
      ((current?.position ?? 0) * (current?.impressions ?? 0) +
        row.position * row.impressions) /
      impressions
    grouped.set(key, {
      keys: [
        current && compareDecayText(current.keys[0], query) < 0
          ? current.keys[0]
          : query,
        url ?? '',
      ],
      clicks,
      impressions,
      ctr: clicks / impressions,
      position,
    })
  }
  return { rows: [...grouped.values()], invalid }
}

export function decayMetrics(row: AggregatedDecayRow): DecayMetrics {
  return {
    clicks: Number(row.clicks.toFixed(3)),
    impressions: Number(row.impressions.toFixed(3)),
    ctr: Number(row.ctr.toFixed(4)),
    position: Number(row.position.toFixed(2)),
  }
}

export function decayTemplate(url: string): PageTemplate {
  const detected = detectPageTemplate(url)
  if (detected.id !== 'other') return detected
  const firstSegment = new URL(url).pathname.split('/').filter(Boolean)[0]
  return firstSegment
    ? {
        id: `path:${firstSegment}`,
        label: `/${firstSegment}/ pages`,
        confidence: 'low',
      }
    : { id: 'path:root', label: 'Homepage', confidence: 'high' }
}

export function classifyDecay(
  current: AggregatedDecayRow,
  previous: AggregatedDecayRow,
): { diagnosis: DecayDiagnosis; signals: DecaySignal[] } {
  const signals: DecaySignal[] = ['click_decline']
  if (current.position > previous.position + 1) signals.push('position_decline')
  if (
    current.impressions >= previous.impressions * 0.9 &&
    current.ctr < previous.ctr * 0.8
  ) {
    signals.push('ctr_decline')
  }
  if (current.impressions < previous.impressions * 0.9)
    signals.push('impression_decline')
  const diagnosis: DecayDiagnosis = signals.includes('position_decline')
    ? 'lost_position'
    : signals.includes('ctr_decline')
      ? 'lost_ctr'
      : signals.includes('impression_decline')
        ? 'lost_impressions'
        : 'lost_clicks'
  return { diagnosis, signals }
}

export function decayRecommendation(
  item: Omit<DecayItem, 'recommendation'>,
): DecayItem['recommendation'] {
  const action =
    item.diagnosis === 'lost_position'
      ? 'Check indexability, canonical state, competing URLs, SERP intent, content changes, and internal links before refreshing the page.'
      : item.diagnosis === 'lost_ctr'
        ? 'Inspect the live SERP and query intent, then review title and meta framing before changing page content.'
        : item.diagnosis === 'lost_impressions'
          ? 'Check seasonality, query demand, SERP features, page indexability, and URL shifts before attributing this to content quality.'
          : 'Clicks declined without one strong position, CTR, or impression signal. Segment by device, country, and search appearance before choosing a fix.'
  return {
    principle: item.diagnosis === 'lost_ctr' ? 'C.3' : 'C.8',
    evidenceRef: `Retained GSC row for "${item.query}" on ${item.url}: ${item.previous.clicks.toFixed(1)} to ${item.current.clicks.toFixed(1)} clicks (${item.dropPct.toFixed(1)}% decline). Signals: ${item.signals.join(', ')}.`,
    action,
    effort: item.diagnosis === 'lost_ctr' ? 'S' : 'M',
    confidence: 'medium',
  }
}

export function groupDecayItems(items: DecayItem[]): DecayGroup[] {
  const groups = new Map<string, { group: DecayGroup; urls: Set<string> }>()
  for (const item of items) {
    const id = `${item.template.id}:${item.diagnosis}`
    const state = groups.get(id) ?? {
      group: {
        id,
        label: `${item.template.label} - ${item.diagnosis.replaceAll('_', ' ')}`,
        diagnosis: item.diagnosis,
        template: item.template,
        count: 0,
        urlCount: 0,
        totalClickLoss: 0,
        totalPreviousClicks: 0,
        averageDropPct: 0,
        sampleQueries: [],
        sampleUrls: [],
        recommendation: '',
      },
      urls: new Set<string>(),
    }
    const { group } = state
    group.count++
    group.totalClickLoss += item.clickLoss
    group.totalPreviousClicks += item.previous.clicks
    state.urls.add(item.url)
    if (
      !group.sampleQueries.includes(item.query) &&
      group.sampleQueries.length < 5
    )
      group.sampleQueries.push(item.query)
    if (!group.sampleUrls.includes(item.url) && group.sampleUrls.length < 3)
      group.sampleUrls.push(item.url)
    groups.set(id, state)
  }
  return [...groups.values()]
    .map(({ group, urls }) => ({
      ...group,
      urlCount: urls.size,
      totalClickLoss: Number(group.totalClickLoss.toFixed(3)),
      totalPreviousClicks: Number(group.totalPreviousClicks.toFixed(3)),
      averageDropPct: Number(
        ((group.totalClickLoss / group.totalPreviousClicks) * 100).toFixed(1),
      ),
      recommendation: `Review the shared ${group.template.label} pattern, but verify technical state, seasonality, and SERP intent before applying one change across ${group.count} retained query/page findings.`,
    }))
    .sort(
      (left, right) =>
        right.totalClickLoss - left.totalClickLoss ||
        compareDecayText(left.id, right.id),
    )
}

export function boundedDecayNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}
