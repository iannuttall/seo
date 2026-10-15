import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import type { ResearchImportSource } from '../../providers/domain-contracts.js'
import { cannibalImportReport } from './cannibal-import.js'
import {
  type CannibalDependencies,
  type CannibalSearchConsoleInput,
  cannibalReportWith,
} from './cannibal-report.js'
import type { CannibalImportReport, CannibalReport } from './cannibal-types.js'

export * from './cannibal-analysis.js'
export * from './cannibal-import.js'
export * from './cannibal-report.js'

export interface CannibalReportInput extends CannibalSearchConsoleInput {
  researchFiles?: ResearchImportSource[]
}

const defaultDependencies: CannibalDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export function cannibalReport(
  input: CannibalReportInput & { researchFiles: ResearchImportSource[] },
  dependencies?: CannibalDependencies,
): Promise<CannibalImportReport>
export function cannibalReport(
  input: CannibalReportInput & { researchFiles?: undefined },
  dependencies?: CannibalDependencies,
): Promise<CannibalReport>
export async function cannibalReport(
  input: CannibalReportInput,
  dependencies: CannibalDependencies = defaultDependencies,
): Promise<CannibalReport | CannibalImportReport> {
  if (input.researchFiles) {
    const conflicts = [
      ['days', input.days],
      ['startDate', input.startDate],
      ['endDate', input.endDate],
      ['minImpressions', input.minImpressions],
      ['refresh', input.refresh === true ? true : undefined],
    ]
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name)
    if (conflicts.length > 0) {
      throw new SeoError(
        'INVALID_INPUT',
        `Pick one evidence path. researchFiles reads local provider exports instead of Search Console, so remove ${conflicts.join(', ')} to use the files, or drop researchFiles to run the Search Console report.`,
      )
    }
    return cannibalImportReport(
      {
        site: input.site,
        researchFiles: input.researchFiles,
        limit: input.limit,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      },
      { now: dependencies.now },
    )
  }
  return cannibalReportWith(input, dependencies)
}
