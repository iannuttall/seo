import { aiSearchReports } from './ai-search'
import { orderReportsForReaders } from './categories'
import { crawlReports } from './crawl'
import { diagnosisReports } from './diagnosis'
import { experimentReports } from './experiments'
import { legacyReportAliases, reportIds, reportSlugs } from './manifest.mjs'
import { monitoringReports } from './monitoring'
import { opportunityReports } from './opportunities'
import { reportingReports } from './reporting'
import { setupReports } from './setup'
import type { ReportEditorial } from './types'
import { workflowReports } from './workflows'

const catalog = [
  ...aiSearchReports,
  ...crawlReports,
  ...diagnosisReports,
  ...experimentReports,
  ...monitoringReports,
  ...opportunityReports,
  ...reportingReports,
  ...setupReports,
  ...workflowReports,
] satisfies readonly ReportEditorial[]

export const reports: ReportEditorial[] = [...catalog].sort((a, b) =>
  a.id.localeCompare(b.id),
)
export const editorialReports = orderReportsForReaders(catalog)
export const reportsById = new Map<string, ReportEditorial>(
  reports.map((report) => [report.id, report]),
)
export { legacyReportAliases, reportIds, reportSlugs }

const catalogIds = reports.map((report) => report.id)
if (new Set(catalogIds).size !== catalogIds.length) {
  throw new Error('Report editorial catalog contains a duplicate id.')
}

if (catalogIds.join('\n') !== [...reportIds].sort().join('\n')) {
  throw new Error('Report editorial catalog does not match the route manifest.')
}

for (const report of reports) {
  for (const relatedId of report.related) {
    if (!reportsById.has(relatedId)) {
      throw new Error(
        `${report.id} references unknown related report ${relatedId}.`,
      )
    }
  }
}

for (const [alias, target] of Object.entries(legacyReportAliases)) {
  const validTarget = target.startsWith('/') || reportsById.has(target)
  if (reportsById.has(alias) || !validTarget) {
    throw new Error(`Invalid legacy report alias ${alias} -> ${target}.`)
  }
}

for (const [id, slug] of Object.entries(reportSlugs)) {
  if (!reportsById.has(id) || reportsById.has(slug)) {
    throw new Error(`Invalid public report slug ${id} -> ${slug}.`)
  }
}
