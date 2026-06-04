import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { countLabel } from '../../phrasing.js'
import type { ProgressReporter } from '../../progress.js'
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
  changeLine,
  contentOpportunityBullets,
  headlineLine,
  monitoringBullets,
  movementLine,
  topSegmentLine,
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
  input.progress?.('Rendering narrative')

  const report: ReportNarrative = {
    site: input.site,
    generatedAt: new Date().toISOString(),
    periodDays: period ? rangeDays(period) : periodDays,
    period: period ?? {
      startDate: diagnosis.anomaly.anomalies[0]?.baselineStart ?? '',
      endDate: diagnosis.anomaly.anomalies[0]?.comparisonEnd ?? '',
    },
    headline: headlineLine(diagnosis),
    caveats: reportCaveats({
      period: period ?? {
        startDate: diagnosis.anomaly.anomalies[0]?.baselineStart ?? '',
        endDate: diagnosis.anomaly.anomalies[0]?.comparisonEnd ?? '',
      },
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
      refresh: input.refresh,
      verifyContent: input.verifyContent,
      verifyLimit: input.verifyLimit,
      verified: diagnosis.quickWins.verification.verified,
      quickWinCount: diagnosis.quickWins.items.length,
    }),
    sections: [
      {
        title: 'Performance',
        bullets: [
          movementLine(diagnosis),
          topSegmentLine(diagnosis),
          `${countLabel(diagnosis.summary.updateMatches, 'official Google update window')} overlapped recent movement.`,
        ],
      },
      {
        title: 'Content Opportunities',
        bullets: contentOpportunityBullets(diagnosis),
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
