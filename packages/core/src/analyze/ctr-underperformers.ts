import { querySearchAnalytics } from '../gsc/client.js'
import {
  type CtrUnderperformerDependencies,
  type CtrUnderperformersInput,
  type CtrUnderperformersReport,
  ctrUnderperformersReportWith,
} from './ctr-underperformers-report.js'

export * from './ctr-underperformers-analysis.js'
export * from './ctr-underperformers-report.js'

const defaultDependencies: CtrUnderperformerDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export function ctrUnderperformersReport(
  input: CtrUnderperformersInput,
  dependencies: CtrUnderperformerDependencies = defaultDependencies,
): Promise<CtrUnderperformersReport> {
  return ctrUnderperformersReportWith(input, dependencies)
}
