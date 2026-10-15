import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { SecondPageReport } from './second-page-analysis-types.js'
import {
  type SecondPageDependencies,
  type SecondPageInput,
  secondPageWith,
} from './second-page-report.js'

export * from './second-page-analysis.js'
export * from './second-page-report.js'

const defaultDependencies: SecondPageDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetch: fetchPage,
  extract: extractPage,
  now: () => new Date(),
}

export function secondPage(
  input: SecondPageInput,
  dependencies: SecondPageDependencies = defaultDependencies,
): Promise<SecondPageReport> {
  return secondPageWith(input, dependencies)
}
