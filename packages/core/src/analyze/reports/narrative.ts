import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { countLabel } from '../../phrasing.js'
import type { ProgressReporter } from '../../progress.js'
import { diagnoseProperty } from '../diagnose-property.js'
import { listChanges } from '../experiments.js'
import {
  latestCrawlSummaries,
  latestIndexWatchSummary,
  latestLinkRecoverSummary,
} from '../monitoring.js'
import {
  changeMeasurementCaveats,
  measureSavedChanges,
  narrativeDataStatus,
} from './change-measurements.js'
import { rangeDays } from './dates.js'
import { renderMarkdown } from './markdown.js'
import {
  changeMeasurementLine,
  contentOpportunityBullets,
  diagnosisAvailabilityCaveats,
  headlineLine,
  monitoringBullets,
  movementLine,
  topSegmentLine,
  updateAttributionLine,
} from './sections.js'
import type { ReportNarrative } from './types.js'

function reportCaveats(input: {
  period: { startDate: string; endDate: string }
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  verified: number
  quickWinCount: number
}): string[] {
  return [
    `Date window: ${input.period.startDate} to ${input.period.endDate}.`,
    `Brand queries: ${
      input.includeBrand
        ? 'included'
        : input.brandTerms?.length
          ? 'excluded where saved brand terms matched'
          : 'no saved brand terms, so no brand filter was applied'
    }.`,
    `Data freshness: ${input.refresh ? 'fresh fetch requested; local cache bypassed where supported' : 'local cache allowed; rerun with --refresh to bypass cached GSC/HTTP data'}.`,
    'GA4: not included in this narrative; use refresh-priorities when GA4 value should influence prioritisation.',
    input.verifyContent
      ? `Content verification: checked ${input.verified} of ${countLabel(input.quickWinCount, 'quick-win candidate')}, limit ${input.verifyLimit ?? 3}.`
      : 'Content verification: not run; recommendations are based on GSC/query data unless stated otherwise.',
  ]
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
  rate?: FetchRateControls
  refresh?: boolean
  progress?: ProgressReporter
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
  input.progress?.('Running diagnosis primitives')
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
    progress: input.progress,
  })
  input.progress?.('Measuring saved changes')
  const changes = listChanges({
    site: input.site,
    limit: input.changeLimit ?? 5,
  })
  const changeMeasurementAttempts = await measureSavedChanges(changes, {
    refresh: input.refresh,
  })
  const changeMeasurements = changeMeasurementAttempts.flatMap((attempt) =>
    attempt.status === 'measured' ? [attempt.measurement] : [],
  )
  const monitoring = {
    crawlRuns: latestCrawlSummaries(input.site),
    indexWatch: latestIndexWatchSummary(input.site),
    linkRecover: latestLinkRecoverSummary(input.site),
  }
  input.progress?.('Rendering narrative')
  const diagnosisPeriod = period ?? {
    startDate:
      diagnosis.anomaly.anomalies[0]?.baselineStart ??
      diagnosis.quickWins.range.startDate,
    endDate:
      diagnosis.anomaly.anomalies[0]?.comparisonEnd ??
      diagnosis.quickWins.range.endDate,
  }

  const report: ReportNarrative = {
    site: input.site,
    generatedAt: new Date().toISOString(),
    dataStatus: narrativeDataStatus(
      diagnosis.dataStatus,
      changeMeasurementAttempts,
    ),
    periodDays: period ? rangeDays(period) : periodDays,
    period: diagnosisPeriod,
    headline: headlineLine(diagnosis),
    caveats: [
      ...reportCaveats({
        period: diagnosisPeriod,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
        refresh: input.refresh,
        verifyContent: input.verifyContent,
        verifyLimit: input.verifyLimit,
        verified: diagnosis.quickWins.verification.verified,
        quickWinCount: diagnosis.quickWins.items.length,
      }),
      ...diagnosisAvailabilityCaveats(diagnosis),
      ...changeMeasurementCaveats(changeMeasurementAttempts),
    ],
    sections: [
      {
        title: 'Performance',
        bullets: [
          movementLine(diagnosis),
          topSegmentLine(diagnosis),
          updateAttributionLine(diagnosis),
        ],
      },
      {
        title: 'Content Opportunities',
        bullets: contentOpportunityBullets(diagnosis),
      },
      {
        title: 'Change Measurements',
        bullets: changeMeasurementAttempts.length
          ? changeMeasurementAttempts.map(changeMeasurementLine)
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
    changeMeasurementAttempts,
    monitoring,
  }

  return { ...report, markdown: renderMarkdown(report) }
}
