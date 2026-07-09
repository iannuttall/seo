import { countLabel } from '../../phrasing.js'
import type { DiagnosePropertyReport } from '../diagnose-property.js'
import type { ChangeMeasurement } from '../experiments.js'
import type { ReportNarrative } from './types.js'

export function movementLine(report: DiagnosePropertyReport): string {
  const anomaly = report.anomaly.anomalies.find((item) => item.significant)
  if (!anomaly) {
    return 'No statistically significant traffic anomaly was detected.'
  }
  const direction =
    anomaly.direction === 'spike'
      ? 'spiked'
      : anomaly.direction === 'drop'
        ? 'dropped'
        : anomaly.direction
  return `Average daily ${anomaly.metric} ${direction} from ${anomaly.baselineMean.toFixed(1)} to ${anomaly.comparisonMean.toFixed(1)}.`
}

function countPhrase(
  count: number,
  singular: string,
  pluralLabel = `${singular}s`,
) {
  if (count === 0) return `no ${pluralLabel}`
  return `${count} ${plural(count, singular, pluralLabel)}`
}

export function headlineLine(report: DiagnosePropertyReport): string {
  const parts = [
    countPhrase(
      report.summary.significantAnomalies,
      'significant anomaly signal',
    ),
    countPhrase(
      report.summary.decayItems,
      'observed retained query/page decline',
    ),
    countPhrase(
      report.summary.strikingDistanceItems,
      'striking-distance opportunity',
      'striking-distance opportunities',
    ),
  ]
  if (report.summary.cannibalItems) {
    parts.push(
      countPhrase(report.summary.cannibalItems, 'multi-URL query candidate'),
    )
  }
  return `${report.summary.classification}; ${parts.join('; ')}.`
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
  const recovery = report.monitoring.linkRecover
  if (crawl) {
    bullets.push(
      `Latest crawl checked ${countLabel(crawl.urlCount, 'URL')} with ${countLabel(crawl.statusErrors, 'status error')}, ${countLabel(crawl.nonIndexable, 'non-indexable page')}, and ${countLabel(crawl.highPriorityRecommendations, 'high-priority crawl action')}.`,
    )
    if (crawl.topRecommendation) {
      bullets.push(
        `Top crawl action: ${crawl.topRecommendation.url}. ${crawl.topRecommendation.action}`,
      )
    }
    if ((crawl.statusErrors || crawl.nonIndexable) && !recovery) {
      bullets.push(
        'Run link-recover before content work if those URLs have GSC search value; recoverable 4xx, noindex, and canonical issues can look like content decay.',
      )
    }
  } else {
    bullets.push('No crawl-diff run is saved yet.')
  }

  const watch = report.monitoring.indexWatch
  if (watch.inspectedUrls) {
    const nonPassText =
      watch.nonPass === 0
        ? 'no URLs currently have'
        : `${countLabel(watch.nonPass, 'URL')} currently ${watch.nonPass === 1 ? 'has' : 'have'}`
    bullets.push(
      `Index watch tracks ${countLabel(watch.inspectedUrls, 'URL')}; ${nonPassText} a non-PASS verdict.`,
    )
    if (watch.nonPass || watch.blocked) {
      bullets.push(
        `Index watch currently has ${countLabel(watch.blocked, 'blocked URL')}; inspect redirect, robots, canonical, and final-page state before changing copy.`,
      )
    }
  } else {
    bullets.push('No index-watch snapshot is saved yet.')
  }

  if (recovery) {
    bullets.push(
      `Latest link-recover checked ${countLabel(recovery.checked, 'search-value URL')}; ${countLabel(recovery.recoverable, 'recoverable issue')}, ${recovery.high} high severity, ${recovery.clicksAtRisk.toFixed(0)} clicks at risk.`,
    )
    if (recovery.topUrl && recovery.topAction) {
      bullets.push(
        `Top recovery target: ${recovery.topUrl}. ${recovery.topAction}`,
      )
    }
    if (recovery.repeatedUrls) {
      bullets.push(
        `${countLabel(recovery.repeatedUrls, 'recoverable URL')} appeared in multiple recent link-recover runs${recovery.repeatedTopUrl ? `; first repeat: ${recovery.repeatedTopUrl}` : ''}.`,
      )
    }
  } else {
    bullets.push('No link-recover run is saved yet.')
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
  if (!template || template.urlCount < 2) {
    return 'No dominant opportunity template stood out.'
  }
  if (template.id === 'other') {
    return `${template.urlCount} quick-win URLs sit outside a recognised reusable template. Triage them individually, then create a content group only if they share real page structure.`
  }
  return `${template.urlCount} distinct quick-win URLs sit in the ${template.label} template. Compare their technical and page evidence before choosing a shared change.`
}

function decayDiagnosisLabel(diagnosis: string): string {
  if (diagnosis === 'lost_ctr') return 'CTR dropped while rankings held'
  if (diagnosis === 'lost_position') return 'average position worsened'
  if (diagnosis === 'lost_impressions') return 'impressions dropped'
  if (diagnosis === 'lost_clicks')
    return 'clicks dropped without one dominant signal'
  return diagnosis.replaceAll('_', ' ')
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

export function decayClusterLine(report: DiagnosePropertyReport): string {
  const group = report.decay.groups[0]
  if (!group) return 'No material decay cluster stood out.'
  const diagnosis = decayDiagnosisLabel(group.diagnosis)
  const samples = group.sampleQueries.slice(0, 2).join('; ')
  return `Top decay cluster: ${group.count} ${plural(group.count, 'finding')} in the ${group.template.label} template (${diagnosis}), ${group.totalClickLoss.toFixed(0)} fewer observed clicks across rows retained in both windows. Action: ${group.recommendation}${samples ? ` Example queries: ${samples}.` : ''}`
}

export function cannibalSuppressionLine(
  report: DiagnosePropertyReport,
): string {
  const suppressed = report.cannibalization.selection.suppressedQueries
  if (!suppressed) return 'No branded multi-URL query candidates were excluded.'
  const reasons = Object.entries(report.cannibalization.suppressionSummary)
    .map(([reason, count]) => `${count} ${reason.replace(/_/g, ' ')}`)
    .join(', ')
  return `${suppressed} branded multi-URL query candidates were excluded (${reasons}).`
}

export function contentOpportunityBullets(
  report: DiagnosePropertyReport,
): string[] {
  const bullets: string[] = []

  if (report.summary.decayItems) {
    const top = report.decay.items[0]
    bullets.push(
      top
        ? `${report.summary.decayItems} observed retained query/page ${plural(report.summary.decayItems, 'decline')} need review. Start with "${top.query}" on ${top.url}; it had ${top.clickLoss.toFixed(0)} fewer clicks.`
        : `${report.summary.decayItems} observed retained query/page ${plural(report.summary.decayItems, 'decline')} need review.`,
    )
    bullets.push(decayClusterLine(report))
  }

  if (report.summary.cannibalItems) {
    const top = report.cannibalization.items[0]
    bullets.push(
      top
        ? `${report.summary.cannibalItems} multi-URL query ${plural(report.summary.cannibalItems, 'candidate')} need intent and technical review. Start with "${top.query}" and decide whether ${top.pages.length} ranking URLs answer the same intent.`
        : `${report.summary.cannibalItems} multi-URL query ${plural(report.summary.cannibalItems, 'candidate')} need intent and technical review.`,
    )
  }

  if (report.cannibalization.selection.suppressedQueries) {
    bullets.push(cannibalSuppressionLine(report))
  }

  if (report.summary.strikingDistanceItems) {
    const top = report.strikingDistance.items[0]
    bullets.push(
      top
        ? `${report.summary.strikingDistanceItems} query/page ${plural(report.summary.strikingDistanceItems, 'candidate')} have an average GSC position above 10 and at most 20. Start by investigating "${top.query}" on ${top.url}; it averages position ${top.position.toFixed(1)} with ${top.impressions.toFixed(0)} impressions.`
        : `${report.summary.strikingDistanceItems} query/page ${plural(report.summary.strikingDistanceItems, 'candidate')} have an average GSC position above 10 and at most 20.`,
    )
  }

  const templateLine = templateOpportunityLine(report)
  if (!templateLine.startsWith('No dominant')) {
    bullets.push(templateLine)
  }

  if (report.quickWins.verification.requested) {
    bullets.push(
      `Verified content for ${report.quickWins.verification.verified} of ${report.quickWins.items.length} quick-win candidates; ${gapCountLine(report)}`,
    )
    const fetchLine = verificationFetchLine(report)
    if (fetchLine) bullets.push(fetchLine)
  }

  if (!bullets.length) {
    bullets.push(
      'No material content opportunity stood out in this window. Keep monitoring, but do not force content edits from this report alone.',
    )
  }

  return bullets
}
