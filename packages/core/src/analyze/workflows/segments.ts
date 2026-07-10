import type { SegmentImpactReport } from '../segment-impact.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function splitSegments(report: SegmentImpactReport): {
  winners: SegmentImpactReport['items']
  losers: SegmentImpactReport['items']
  dataStatus: SegmentImpactReport['dataStatus']
  summary: SegmentImpactReport['summary']
  unmatchedSegments: SegmentImpactReport['unmatchedSegments']
  warnings: string[]
} {
  return {
    dataStatus: report.dataStatus,
    summary: report.summary,
    unmatchedSegments: report.unmatchedSegments,
    warnings: report.warnings,
    winners: report.items
      .filter((item) => item.clickDelta > 0)
      .sort((a, b) => b.clickDelta - a.clickDelta || compareText(a.key, b.key))
      .slice(0, 10),
    losers: report.items
      .filter((item) => item.clickDelta < 0)
      .sort((a, b) => a.clickDelta - b.clickDelta || compareText(a.key, b.key))
      .slice(0, 10),
  }
}
