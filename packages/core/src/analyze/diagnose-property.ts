import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { type SegmentImpactReport, segmentImpact } from './segment-impact.js'
import {
  cannibalReport,
  decayingReport,
  quickWinsReport,
} from './site-diagnostics.js'
import { strikingDistance } from './striking-distance.js'
import { trafficAnomaly, updateCorrelation } from './traffic-anomaly.js'

export type DiagnosisPriority = {
  label: string
  reason: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type DiagnosePropertyReport = {
  site: string
  generatedAt: string
  summary: {
    classification: string
    significantAnomalies: number
    updateMatches: number
    largestPageMovements: number
    decayItems: number
    cannibalItems: number
    strikingDistanceItems: number
  }
  priorities: DiagnosisPriority[]
  anomaly: Awaited<ReturnType<typeof trafficAnomaly>>
  updateCorrelation: Awaited<ReturnType<typeof updateCorrelation>>
  segments: {
    page: SegmentImpactReport
    query: SegmentImpactReport
    device: SegmentImpactReport
    country: SegmentImpactReport
  }
  decay: Awaited<ReturnType<typeof decayingReport>>
  cannibalization: Awaited<ReturnType<typeof cannibalReport>>
  strikingDistance: Awaited<ReturnType<typeof strikingDistance>>
  quickWins: Awaited<ReturnType<typeof quickWinsReport>>
}

function topDelta(report: SegmentImpactReport): string {
  const top = report.items[0]
  if (!top) return 'No segment movement found.'
  const direction = top.clickDelta < 0 ? 'lost' : 'gained'
  return `${top.key} ${direction} ${Math.abs(top.clickDelta)} clicks.`
}

function buildPriorities(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  page: SegmentImpactReport
  decay: Awaited<ReturnType<typeof decayingReport>>
  cannibal: Awaited<ReturnType<typeof cannibalReport>>
  striking: Awaited<ReturnType<typeof strikingDistance>>
}): DiagnosisPriority[] {
  const priorities: DiagnosisPriority[] = []

  if (input.update.classification !== 'not-enough-evidence') {
    priorities.push({
      label: 'Review update exposure',
      reason: `${input.update.overlappingUpdates.length} official update window(s) overlap recent movement.`,
      action:
        'Do not edit individual pages yet. First compare winning and losing templates so you know which page type was affected by the update.',
      confidence:
        input.update.classification === 'likely-update-related'
          ? 'medium'
          : 'low',
    })
  }

  const largestPage = input.page.items[0]
  if (largestPage) {
    priorities.push({
      label: 'Investigate largest page movement',
      reason: topDelta(input.page),
      action:
        'Open the page and check the queries that moved, whether the URL is still canonical/indexable, and whether the title, H1, or body changed recently.',
      confidence: Math.abs(largestPage.clickDelta) > 50 ? 'high' : 'medium',
    })
  }

  if (input.decay.items.length) {
    const topGroup = input.decay.groups[0]
    priorities.push({
      label: 'Refresh decaying content',
      reason: topGroup
        ? `${input.decay.items.length} decaying query/page rows found; ${topGroup.label} lost ${topGroup.totalClickLoss.toFixed(0)} clicks.`
        : `${input.decay.items.length} decaying query/page rows found.`,
      action: topGroup
        ? topGroup.recommendation
        : 'Start with declines that continued outside the update window. Check indexability first, then ranking and CTR causes.',
      confidence: 'medium',
    })
  }

  if (input.cannibal.items.length) {
    priorities.push({
      label: 'Resolve cannibalisation',
      reason: `${input.cannibal.items.length} split-query clusters found.`,
      action:
        input.cannibal.suppressed.length > input.cannibal.items.length
          ? 'Review the remaining split-query clusters manually. Many template/local false positives were filtered out, so these are the cases most likely to need a decision.'
          : 'For each split query, decide whether the URLs answer the same intent. If yes, pick one main URL and consolidate links/canonicals. If no, make each page target clearer.',
      confidence: 'medium',
    })
  }

  if (input.striking.items.length) {
    priorities.push({
      label: 'Exploit striking-distance wins',
      reason: `${input.striking.items.length} position 11-20 opportunities found.`,
      action:
        'These queries are close to page one. Improve the matching page title/H1/body coverage and add internal links from related pages before creating new content.',
      confidence: 'high',
    })
  }

  return priorities.slice(0, 6)
}

export async function diagnoseProperty(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}): Promise<DiagnosePropertyReport> {
  const limit = input.limit ?? 10
  const [
    anomaly,
    update,
    page,
    query,
    device,
    country,
    decay,
    cannibal,
    striking,
    quickWins,
  ] = await Promise.all([
    trafficAnomaly(input),
    updateCorrelation(input),
    segmentImpact({ ...input, dimension: 'page', limit }),
    segmentImpact({ ...input, dimension: 'query', limit }),
    segmentImpact({ ...input, dimension: 'device', limit }),
    segmentImpact({ ...input, dimension: 'country', limit }),
    decayingReport({
      site: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
      refresh: input.refresh,
    }),
    cannibalReport({
      site: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
      refresh: input.refresh,
    }),
    strikingDistance({ ...input, limit }),
    quickWinsReport({
      site: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
      verifyContent: input.verifyContent,
      verifyLimit: input.verifyLimit,
      js: input.js,
      rate: input.rate,
      refresh: input.refresh,
    }),
  ])

  const priorities = buildPriorities({
    update,
    page,
    decay,
    cannibal,
    striking,
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      classification: update.classification,
      significantAnomalies: anomaly.anomalies.filter((item) => item.significant)
        .length,
      updateMatches: update.overlappingUpdates.length,
      largestPageMovements: page.items.length,
      decayItems: decay.items.length,
      cannibalItems: cannibal.items.length,
      strikingDistanceItems: striking.items.length,
    },
    priorities,
    anomaly,
    updateCorrelation: update,
    segments: { page, query, device, country },
    decay,
    cannibalization: cannibal,
    strikingDistance: striking,
    quickWins,
  }
}
