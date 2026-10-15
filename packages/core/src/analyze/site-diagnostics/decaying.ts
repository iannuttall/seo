import { querySearchAnalytics } from '../../gsc/client.js'
import type { DecayReport } from './decay-types.js'
import {
  type DecayingDependencies,
  type DecayingReportInput,
  decayingReportWith,
} from './decaying-report.js'

export * from './decaying-report.js'

const defaultDependencies: DecayingDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export function decayingReport(
  input: DecayingReportInput,
  dependencies: DecayingDependencies = defaultDependencies,
): Promise<DecayReport> {
  return decayingReportWith(input, dependencies)
}
