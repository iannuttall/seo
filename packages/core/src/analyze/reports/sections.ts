import type { DiagnosePropertyReport } from '../diagnose-property.js'
import type { ChangeMeasurement } from '../experiments.js'
import type { ReportNarrative } from './types.js'

export function movementLine(report: DiagnosePropertyReport): string {
  const anomaly = report.anomaly.anomalies.find((item) => item.significant)
  if (!anomaly) {
    return 'No statistically significant traffic anomaly was detected.'
  }
  return `${anomaly.metric} ${anomaly.direction} from ${anomaly.baselineMean.toFixed(1)} to ${anomaly.comparisonMean.toFixed(1)}.`
}

export function topSegmentLine(report: DiagnosePropertyReport): string {
  const page = report.segments.page.items[0]
  if (!page) return 'No page-level movement stood out.'
  const direction = page.clickDelta < 0 ? 'lost' : 'gained'
  return `${page.key} ${direction} ${Math.abs(page.clickDelta)} clicks compared with the previous window.`
}

export function changeLine(measurement: ChangeMeasurement): string {
  const pct =
    measurement.delta.clickPct === null
      ? ''
      : ` (${measurement.delta.clickPct}%)`
  return `${measurement.change.title}: ${measurement.verdict}, ${measurement.delta.clicks} clicks${pct}.`
}

export function monitoringBullets(
  report: Pick<ReportNarrative, 'monitoring'>,
): string[] {
  const bullets: string[] = []
  const crawl = report.monitoring.crawlRuns[0]
  if (crawl) {
    bullets.push(
      `Latest crawl checked ${crawl.urlCount} URLs with ${crawl.statusErrors} status errors and ${crawl.nonIndexable} non-indexable pages.`,
    )
    if (crawl.statusErrors || crawl.nonIndexable) {
      bullets.push(
        'Run link-recover before content work if those URLs have GSC search value; recoverable 4xx, noindex, and canonical issues can look like content decay.',
      )
    }
  } else {
    bullets.push('No crawl-diff run is saved yet.')
  }

  const watch = report.monitoring.indexWatch
  if (watch.inspectedUrls) {
    bullets.push(
      `Index watch tracks ${watch.inspectedUrls} URLs; ${watch.nonPass} currently have a non-PASS verdict.`,
    )
    if (watch.nonPass || watch.blocked) {
      bullets.push(
        `Index watch currently has ${watch.blocked} blocked URL(s); inspect redirect, robots, canonical, and final-page state before changing copy.`,
      )
    }
  } else {
    bullets.push('No index-watch snapshot is saved yet.')
  }
  return bullets
}

export function verificationFetchLine(
  report: DiagnosePropertyReport,
): string | null {
  const verified = report.quickWins.items
    .map((item) => item.contentVerification?.fetchDiagnostics)
    .filter((item) => item !== undefined)
  if (!verified.length) return null

  const blocked = verified.filter((item) => item.blocked).length
  const rendered = verified.filter((item) => item.rendered).length
  const cached = verified.filter((item) => item.cache === 'hit').length
  const fetched = verified.filter(
    (item) => item.fetched && item.cache !== 'hit' && !item.rendered,
  ).length
  return `Verified-page fetch status: ${cached} cached, ${fetched} fetched, ${rendered} rendered, ${blocked} blocked.`
}

export function gapCountLine(report: DiagnosePropertyReport): string {
  const gaps = report.quickWins.items.filter(
    (item) => item.contentVerification?.classification === 'content-gap',
  ).length
  const framing = report.quickWins.items.filter(
    (item) => item.contentVerification?.classification === 'serp-framing',
  ).length
  return `${gaps} ${gaps === 1 ? 'shows' : 'show'} true content gaps; ${framing} look more like SERP/title/H1 framing gaps.`
}

export function templateOpportunityLine(
  report: DiagnosePropertyReport,
): string {
  const template = report.quickWins.templates[0]
  if (!template || template.count < 2) {
    return 'No dominant opportunity template stood out.'
  }
  return `${template.count} quick wins sit in the ${template.label} template, so fix the reusable template before editing pages one by one.`
}

export function decayClusterLine(report: DiagnosePropertyReport): string {
  const group = report.decay.groups[0]
  if (!group) return 'No material decay cluster stood out.'
  return `${group.count} decay findings sit in ${group.label}, with ${group.totalClickLoss.toFixed(0)} lost clicks versus the previous window.`
}

export function cannibalSuppressionLine(
  report: DiagnosePropertyReport,
): string {
  const suppressed = report.cannibalization.suppressed.length
  if (!suppressed)
    return 'No likely false-positive cannibal clusters were suppressed.'
  const reasons = Object.entries(report.cannibalization.suppressionSummary)
    .map(([reason, count]) => `${count} ${reason.replace(/_/g, ' ')}`)
    .join(', ')
  return `${suppressed} likely false-positive cannibal clusters were suppressed (${reasons}).`
}
