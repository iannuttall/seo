import { extractPage } from '../../extract/page-extractor.js'
import { fetchPage } from '../../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import {
  type QuickWinsDependencies,
  type QuickWinsInput,
  type QuickWinsReport,
  quickWinsReportWith,
} from './quick-wins-report.js'

export * from './quick-wins-analysis.js'
export * from './quick-wins-report.js'

const defaultDependencies: QuickWinsDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetch: fetchPage,
  extract: extractPage,
  now: () => new Date(),
}

export function quickWinsReport(
  input: QuickWinsInput,
  dependencies: QuickWinsDependencies = defaultDependencies,
): Promise<QuickWinsReport> {
  return quickWinsReportWith(input, dependencies)
}
