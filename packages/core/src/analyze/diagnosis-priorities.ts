import { countLabel } from '../phrasing.js'
import type {
  DiagnosePropertyReport,
  DiagnosisPriority,
} from './diagnose-property.js'

export type DiagnosisPriorityInput = {
  anomaly: DiagnosePropertyReport['anomaly']
  update: DiagnosePropertyReport['updateCorrelation']
  page: DiagnosePropertyReport['segments']['page']
  decay: DiagnosePropertyReport['decay']
  cannibal: DiagnosePropertyReport['cannibalization']
  striking: DiagnosePropertyReport['strikingDistance']
  quickWins: DiagnosePropertyReport['quickWins']
}

function topDelta(report: DiagnosisPriorityInput['page']): string {
  const top = report.items[0]
  if (!top) return 'No segment movement found.'
  const direction = top.clickDelta < 0 ? 'lost' : 'gained'
  return `${top.key} ${direction} ${Math.abs(top.clickDelta)} clicks.`
}

export function buildDiagnosisPriorities(
  input: DiagnosisPriorityInput,
): DiagnosisPriority[] {
  const priorities: DiagnosisPriority[] = []

  const hasSignificantAnomaly = input.anomaly.anomalies.some(
    (anomaly) => anomaly.significant,
  )
  if (hasSignificantAnomaly && input.update.overlappingUpdates.length) {
    priorities.push({
      label: 'Review update exposure',
      reason: `${countLabel(input.update.overlappingUpdates.length, 'official update window')} ${input.update.overlappingUpdates.length === 1 ? 'overlaps' : 'overlap'} the significant movement comparison window.`,
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
      confidence:
        input.page.dataStatus === 'partial'
          ? 'low'
          : Math.abs(largestPage.clickDelta) > 50
            ? 'high'
            : 'medium',
    })
  }

  if (input.decay.selection.eligibleRows) {
    const topGroup = input.decay.groups[0]
    priorities.push({
      label: 'Refresh decaying content',
      reason: topGroup
        ? `${input.decay.selection.eligibleRows} observed retained query/page declines found; ${topGroup.label} declined by ${topGroup.totalClickLoss.toFixed(0)} clicks.`
        : `${input.decay.selection.eligibleRows} observed retained query/page declines found.`,
      action: topGroup
        ? topGroup.recommendation
        : 'Start with declines that continued outside the update window. Check indexability first, then ranking and CTR causes.',
      confidence: input.decay.dataStatus === 'partial' ? 'low' : 'medium',
    })
  }

  if (input.cannibal.items.length) {
    priorities.push({
      label: 'Review multi-URL query candidates',
      reason: `${input.cannibal.selection.eligibleClusters} multi-URL query candidates found.`,
      action:
        'Confirm whether each URL set satisfies the same intent and inspect technical state. Consolidate only verified duplicate or same-intent pages; otherwise clarify the distinction.',
      confidence: 'low',
    })
  }

  const topQuickWin = input.quickWins.items[0]
  if (topQuickWin) {
    const incompleteEvidence =
      input.quickWins.source.possiblyTruncated ||
      (input.quickWins.verification.requested &&
        input.quickWins.verification.failed > 0)
    priorities.push({
      label: 'Review CTR-target opportunity',
      reason: `${countLabel(input.quickWins.items.length, 'returned query/page candidate')} fell below ${input.quickWins.items.length === 1 ? 'its' : 'their'} deterministic, versioned heuristic CTR target.`,
      action: topQuickWin.recommendation.action,
      confidence: incompleteEvidence
        ? 'low'
        : topQuickWin.recommendation.confidence,
    })
  }

  if (input.striking.items.length) {
    const top = input.striking.items[0]
    priorities.push({
      label: 'Investigate striking-distance candidates',
      reason: `${input.striking.items.length} query/page rows have an average GSC position above 10 and at most 20.`,
      action:
        top?.recommendation.action ??
        'Check technical state, query coverage, competing URLs, and relevant internal links before choosing a change.',
      confidence: input.striking.source.possiblyTruncated
        ? 'low'
        : (top?.recommendation.confidence ?? 'low'),
    })
  }

  return priorities.slice(0, 6)
}
