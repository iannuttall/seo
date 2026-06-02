import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { diagnoseProperty } from '../diagnose-property.js'
import {
  type ChangeMeasurement,
  listChanges,
  measureChange,
} from '../experiments.js'
import {
  latestCrawlSummaries,
  latestIndexWatchSummary,
  latestLinkRecoverSummary,
} from '../monitoring.js'
import { rangeDays } from './dates.js'
import { renderMarkdown } from './markdown.js'
import {
  cannibalSuppressionLine,
  changeLine,
  decayClusterLine,
  gapCountLine,
  monitoringBullets,
  movementLine,
  templateOpportunityLine,
  topSegmentLine,
  verificationFetchLine,
} from './sections.js'
import type { ReportNarrative } from './types.js'

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
  rate?: FetchRateControls
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
    rate: input.rate,
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
    linkRecover: latestLinkRecoverSummary(input.site),
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
          decayClusterLine(diagnosis),
          `${diagnosis.summary.cannibalItems} cannibalisation clusters need a primary URL decision.`,
          cannibalSuppressionLine(diagnosis),
          `${diagnosis.summary.strikingDistanceItems} position 11-20 opportunities are available.`,
          templateOpportunityLine(diagnosis),
          ...(diagnosis.quickWins.verification.requested
            ? [
                `Verified content for ${diagnosis.quickWins.verification.verified} of ${diagnosis.quickWins.items.length} quick-win candidates; ${gapCountLine(diagnosis)}`,
                verificationFetchLine(diagnosis),
              ].filter((line): line is string => Boolean(line))
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
