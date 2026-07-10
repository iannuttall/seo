import type { SegmentImpactReport } from '../segment-impact.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type WorkflowSegmentCoverage = {
  evidenceScope: 'matched-retained-segments'
  eligibleRows: number
  returnedRows: number
  limitedRows: number
  resultLimit: number
  sourceRowLimit: number
  movedRows: number
  unchangedRows: number
  sourcePossiblyTruncated: boolean
}

export type WorkflowSegmentSplit = {
  winners: SegmentImpactReport['items']
  losers: SegmentImpactReport['items']
  dataStatus: SegmentImpactReport['dataStatus']
  coverage: WorkflowSegmentCoverage
  summary: SegmentImpactReport['summary']
  unmatchedSegments: SegmentImpactReport['unmatchedSegments']
  warnings: string[]
}

export function splitSegments(
  report: SegmentImpactReport,
): WorkflowSegmentSplit {
  const winners = report.items
    .filter((item) => item.clickDelta > 0)
    .sort((a, b) => b.clickDelta - a.clickDelta || compareText(a.key, b.key))
  const losers = report.items
    .filter((item) => item.clickDelta < 0)
    .sort((a, b) => a.clickDelta - b.clickDelta || compareText(a.key, b.key))
  const movedRows = winners.length + losers.length

  return {
    dataStatus: report.dataStatus,
    coverage: {
      evidenceScope: 'matched-retained-segments',
      eligibleRows: report.selection.matchedRows,
      returnedRows: report.selection.returnedRows,
      limitedRows: report.selection.limitedRows,
      resultLimit: report.filters.limit,
      sourceRowLimit: report.filters.maxRows,
      movedRows,
      unchangedRows: Math.max(0, report.selection.returnedRows - movedRows),
      sourcePossiblyTruncated:
        report.source.before.possiblyTruncated ||
        report.source.after.possiblyTruncated,
    },
    summary: report.summary,
    unmatchedSegments: report.unmatchedSegments,
    warnings: report.warnings,
    winners,
    losers,
  }
}
