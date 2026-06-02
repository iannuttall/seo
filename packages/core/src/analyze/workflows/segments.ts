import type { SegmentImpactReport } from '../segment-impact.js'

export function splitSegments(report: SegmentImpactReport): {
  winners: SegmentImpactReport['items']
  losers: SegmentImpactReport['items']
} {
  return {
    winners: report.items
      .filter((item) => item.clickDelta > 0)
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 10),
    losers: report.items
      .filter((item) => item.clickDelta < 0)
      .sort((a, b) => a.clickDelta - b.clickDelta)
      .slice(0, 10),
  }
}
