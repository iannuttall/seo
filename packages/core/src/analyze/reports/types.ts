import type { DiagnosePropertyReport } from '../diagnose-property.js'
import type { ChangeMeasurement } from '../experiments.js'
import type {
  latestCrawlSummaries,
  latestIndexWatchSummary,
  latestLinkRecoverSummary,
} from '../monitoring.js'

export type NarrativeSection = {
  title: string
  bullets: string[]
}

export type ReportNarrative = {
  site: string
  generatedAt: string
  dataStatus: DiagnosePropertyReport['dataStatus']
  periodDays: number
  period: {
    startDate: string
    endDate: string
  }
  headline: string
  caveats: string[]
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
    linkRecover: ReturnType<typeof latestLinkRecoverSummary>
  }
}
