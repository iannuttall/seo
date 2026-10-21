import { querySearchAnalytics } from '../gsc/client.js'
import {
  findOverlappingSearchUpdates,
  listSearchUpdates,
} from '../updates/search-status.js'
import {
  changeWindow,
  interpretUpdateCorrelation,
  type TrafficAnomaly,
  type TrafficAnomalyReport,
  type UpdateConfounder,
  type UpdateCorrelationReport,
} from './traffic-anomaly-analysis.js'
import {
  type TrafficAnomalyDependencies,
  type TrafficAnomalyInput,
  trafficAnomalyWith,
} from './traffic-anomaly-report.js'

export * from './traffic-anomaly-analysis.js'
export * from './traffic-anomaly-report.js'

const defaultDependencies: TrafficAnomalyDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export function trafficAnomaly(
  input: TrafficAnomalyInput,
  dependencies: TrafficAnomalyDependencies = defaultDependencies,
): Promise<TrafficAnomalyReport> {
  return trafficAnomalyWith(input, dependencies)
}

export async function updateCorrelation(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  paddingDays?: number
  knownConfounders?: string[]
  refresh?: boolean
  trafficAnomalies?: TrafficAnomaly[]
}): Promise<UpdateCorrelationReport> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  const paddingDays = input.paddingDays ?? 3
  const anomalies =
    input.trafficAnomalies ?? (await trafficAnomaly(input)).anomalies
  // A step change is checked at its own date, not across the whole
  // comparison window, so a later update is not reported as overlapping.
  const window = changeWindow(anomalies)
  const comparisonStart = window?.start
  const comparisonEnd = window?.end
  const updates = await listSearchUpdates({
    product: 'Ranking',
    limit: Number.POSITIVE_INFINITY,
  })
  const overlappingUpdates =
    comparisonStart && comparisonEnd
      ? findOverlappingSearchUpdates({
          updates,
          startDate: comparisonStart,
          endDate: comparisonEnd,
          paddingDays,
        })
      : []
  const confounders = (input.knownConfounders ?? []).map(
    (title): UpdateConfounder => ({
      source: 'manual',
      title,
    }),
  )

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies,
    overlappingUpdates,
    ...interpretUpdateCorrelation({
      site: input.site,
      anomalies,
      overlappingUpdates,
      confounders,
      days,
      recentDays,
      paddingDays,
      refresh: input.refresh,
    }),
  }
}
