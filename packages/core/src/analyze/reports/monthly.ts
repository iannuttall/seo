import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import type { ProgressReporter } from '../../progress.js'
import { finalGscDate, monthRange, rangeDays } from './dates.js'
import { reportNarrative } from './narrative.js'
import type { ReportNarrative } from './types.js'

export async function monthlyReport(input: {
  site: string
  month?: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
  progress?: ProgressReporter
}): Promise<ReportNarrative & { markdown: string; month: string }> {
  const month = input.month ?? finalGscDate().slice(0, 7)
  const period = monthRange(month)
  input.progress?.(`Preparing monthly period ${month}`)
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
    rate: input.rate,
    refresh: input.refresh,
    progress: input.progress,
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
