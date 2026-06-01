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
        'Segment winners and losers by template before making page-level edits.',
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
        'Inspect the page, query mix, canonical/indexability, and recent content changes.',
      confidence: Math.abs(largestPage.clickDelta) > 50 ? 'high' : 'medium',
    })
  }

  if (input.decay.items.length) {
    priorities.push({
      label: 'Refresh decaying content',
      reason: `${input.decay.items.length} decaying query/page rows found.`,
      action:
        'Prioritize sustained declines that are not explained by update timing.',
      confidence: 'medium',
    })
  }

  if (input.cannibal.items.length) {
    priorities.push({
      label: 'Resolve cannibalisation',
      reason: `${input.cannibal.items.length} split-query clusters found.`,
      action:
        'Pick a primary URL per query, then merge, redirect, or de-optimize competing URLs.',
      confidence: 'medium',
    })
  }

  if (input.striking.items.length) {
    priorities.push({
      label: 'Exploit striking-distance wins',
      reason: `${input.striking.items.length} position 11-20 opportunities found.`,
      action:
        'Improve title/H1/query coverage and internal links for high-impression near misses.',
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
    decayingReport({ site: input.site, refresh: input.refresh }),
    cannibalReport({ site: input.site }),
    strikingDistance({ ...input, limit }),
    quickWinsReport({ site: input.site }),
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
