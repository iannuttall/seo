import { querySearchAnalytics } from '../gsc/client.js'
import { verifyQueryContent } from './content-coverage.js'
import {
  type StrikingDistanceDependencies,
  type StrikingDistanceInput,
  type StrikingDistanceReport,
  strikingDistanceWith,
} from './striking-distance-report.js'

export * from './striking-distance-analysis.js'
export * from './striking-distance-report.js'

const defaultDependencies: StrikingDistanceDependencies = {
  searchAnalytics: querySearchAnalytics,
  verifyContent: verifyQueryContent,
  now: () => new Date(),
}

export function strikingDistance(
  input: StrikingDistanceInput,
  dependencies: StrikingDistanceDependencies = defaultDependencies,
): Promise<StrikingDistanceReport> {
  return strikingDistanceWith(input, dependencies)
}
