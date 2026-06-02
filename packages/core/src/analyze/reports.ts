import {
  type DiagnosePropertyReport,
  diagnoseProperty,
} from './diagnose-property.js'
import {
  type ChangeMeasurement,
  listChanges,
  measureChange,
} from './experiments.js'
import { latestCrawlSummaries, latestIndexWatchSummary } from './monitoring.js'

export type NarrativeSection = {
  title: string
  bullets: string[]
}

export type ReportNarrative = {
  site: string
  generatedAt: string
  periodDays: number
  period: {
    startDate: string
    endDate: string
  }
  headline: string
  sections: NarrativeSection[]
  priorities: Array<{
    title: string
    confidence: 'high' | 'medium' | 'low'
    action: string
  }>
  diagnosis: DiagnosePropertyReport
  changeMeasurements: ChangeMeasurement[]
  monitoring: {
    crawlRuns: ReturnType<typeof latestCrawlSummaries>
    indexWatch: ReturnType<typeof latestIndexWatchSummary>
  }
}

function movementLine(report: DiagnosePropertyReport): string {
  const anomaly = report.anomaly.anomalies.find((item) => item.significant)
  if (!anomaly)
    return 'No statistically significant traffic anomaly was detected.'
  return `${anomaly.metric} ${anomaly.direction} from ${anomaly.baselineMean} to ${anomaly.comparisonMean}.`
}

function topSegmentLine(report: DiagnosePropertyReport): string {
  const page = report.segments.page.items[0]
  if (!page) return 'No page-level movement stood out.'
  const direction = page.clickDelta < 0 ? 'lost' : 'gained'
  return `${page.key} ${direction} ${Math.abs(page.clickDelta)} clicks compared with the previous window.`
}

function changeLine(measurement: ChangeMeasurement): string {
  const pct =
    measurement.delta.clickPct === null
      ? ''
      : ` (${measurement.delta.clickPct}%)`
  return `${measurement.change.title}: ${measurement.verdict}, ${measurement.delta.clicks} clicks${pct}.`
}

function rangeDays(range: { startDate: string; endDate: string }): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`)
  const end = Date.parse(`${range.endDate}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}

function finalGscDate(): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 4)
  return date.toISOString().slice(0, 10)
}

function monthRange(month: string): { startDate: string; endDate: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Pass --month as YYYY-MM.')
  }
  const start = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(start.getTime())) {
    throw new Error('Pass --month as YYYY-MM.')
  }
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(0)
  const endDate = end.toISOString().slice(0, 10)
  const availableEndDate = finalGscDate()
  const cappedEndDate = endDate < availableEndDate ? endDate : availableEndDate
  const startDate = start.toISOString().slice(0, 10)
  if (cappedEndDate < startDate) {
    throw new Error(
      `Final GSC data is only available through ${availableEndDate}. Choose an earlier month.`,
    )
  }
  return { startDate, endDate: cappedEndDate }
}

function monitoringBullets(
  report: Pick<ReportNarrative, 'monitoring'>,
): string[] {
  const bullets: string[] = []
  const crawl = report.monitoring.crawlRuns[0]
  if (crawl) {
    bullets.push(
      `Latest crawl checked ${crawl.urlCount} URLs with ${crawl.statusErrors} status errors and ${crawl.nonIndexable} non-indexable pages.`,
    )
  } else {
    bullets.push('No crawl-diff run is saved yet.')
  }

  const watch = report.monitoring.indexWatch
  if (watch.inspectedUrls) {
    bullets.push(
      `Index watch tracks ${watch.inspectedUrls} URLs; ${watch.nonPass} currently have a non-PASS verdict.`,
    )
  } else {
    bullets.push('No index-watch snapshot is saved yet.')
  }
  return bullets
}

function renderMarkdown(report: ReportNarrative): string {
  const lines = [`# SEO report: ${report.site}`, '', report.headline, '']
  lines.push(`Period: ${report.period.startDate} to ${report.period.endDate}`)
  lines.push('')
  for (const section of report.sections) {
    lines.push(`## ${section.title}`)
    for (const bullet of section.bullets) {
      lines.push(`- ${bullet}`)
    }
    lines.push('')
  }
  lines.push('## Priorities')
  for (const priority of report.priorities) {
    lines.push(
      `- ${priority.title} (${priority.confidence}): ${priority.action}`,
    )
  }
  return lines.join('\n')
}

export async function reportNarrative(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  limit?: number
  changeLimit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  refresh?: boolean
}): Promise<ReportNarrative & { markdown: string }> {
  const periodDays = input.days ?? 90
  if (
    (input.startDate && !input.endDate) ||
    (!input.startDate && input.endDate)
  ) {
    throw new Error('Pass both startDate and endDate, or neither.')
  }
  const period =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : undefined
  const diagnosis = await diagnoseProperty({
    site: input.site,
    days: period ? rangeDays(period) : periodDays,
    recentDays: input.recentDays,
    startDate: period?.startDate,
    endDate: period?.endDate,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
    verifyContent: input.verifyContent,
    verifyLimit: input.verifyLimit,
    js: input.js,
    refresh: input.refresh,
  })
  const changes = listChanges({
    site: input.site,
    limit: input.changeLimit ?? 5,
  })
  const changeMeasurements = (
    await Promise.all(
      changes.map((change) =>
        measureChange({ id: change.id, refresh: input.refresh }).catch(
          () => undefined,
        ),
      ),
    )
  ).filter((item): item is ChangeMeasurement => Boolean(item))
  const monitoring = {
    crawlRuns: latestCrawlSummaries(input.site),
    indexWatch: latestIndexWatchSummary(input.site),
  }

  const report: ReportNarrative = {
    site: input.site,
    generatedAt: new Date().toISOString(),
    periodDays: period ? rangeDays(period) : periodDays,
    period: period ?? {
      startDate: diagnosis.anomaly.anomalies[0]?.baselineStart ?? '',
      endDate: diagnosis.anomaly.anomalies[0]?.comparisonEnd ?? '',
    },
    headline: `${diagnosis.summary.classification}; ${diagnosis.summary.significantAnomalies} significant anomaly signal(s), ${diagnosis.summary.decayItems} decay item(s), ${diagnosis.summary.strikingDistanceItems} striking-distance opportunity item(s).`,
    sections: [
      {
        title: 'Performance',
        bullets: [
          movementLine(diagnosis),
          topSegmentLine(diagnosis),
          `${diagnosis.summary.updateMatches} official Google update window(s) overlapped recent movement.`,
        ],
      },
      {
        title: 'Content Opportunities',
        bullets: [
          `${diagnosis.summary.decayItems} decaying rows need review.`,
          `${diagnosis.summary.cannibalItems} cannibalisation clusters need a primary URL decision.`,
          `${diagnosis.summary.strikingDistanceItems} position 11-20 opportunities are available.`,
          ...(diagnosis.quickWins.verification.requested
            ? [
                `Verified content for ${diagnosis.quickWins.verification.verified} of ${diagnosis.quickWins.items.length} quick-win candidates; ${diagnosis.quickWins.items.filter((item) => (item.contentVerification?.contentGapScore ?? 0) >= 5).length} show likely on-page query coverage gaps.`,
              ]
            : []),
        ],
      },
      {
        title: 'Change Measurements',
        bullets: changeMeasurements.length
          ? changeMeasurements.map(changeLine)
          : ['No measured changes are saved for this property yet.'],
      },
      {
        title: 'Technical Monitoring',
        bullets: monitoringBullets({ monitoring }),
      },
    ],
    priorities: diagnosis.priorities.map((priority) => ({
      title: priority.label,
      confidence: priority.confidence,
      action: priority.action,
    })),
    diagnosis,
    changeMeasurements,
    monitoring,
  }

  return { ...report, markdown: renderMarkdown(report) }
}

export async function monthlyReport(input: {
  site: string
  month?: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  refresh?: boolean
}): Promise<ReportNarrative & { markdown: string; month: string }> {
  const month = input.month ?? finalGscDate().slice(0, 7)
  const period = monthRange(month)
  const report = await reportNarrative({
    site: input.site,
    startDate: period.startDate,
    endDate: period.endDate,
    recentDays: Math.min(14, Math.max(3, rangeDays(period))),
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
    verifyContent: input.verifyContent,
    verifyLimit: input.verifyLimit,
    js: input.js,
    refresh: input.refresh,
  })
  return {
    ...report,
    month,
    markdown: report.markdown.replace(
      `# SEO report: ${input.site}`,
      `# Monthly SEO report (${month}): ${input.site}`,
    ),
  }
}
