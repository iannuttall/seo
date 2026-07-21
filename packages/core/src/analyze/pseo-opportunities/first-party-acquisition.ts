import {
  acquirePseoAuditEvidence,
  buildPseoAuditFromAcquisition,
  type PseoAuditReport,
} from '../pseo/audit.js'
import {
  buildQueryClusterReportFromRows,
  type QueryClusterReport,
  type QueryClusterSourceRow,
} from '../query-cluster.js'
import type { ValidatedPseoOpportunitiesInput } from './input.js'

export type PseoOpportunityFirstPartyReport = {
  audit: PseoAuditReport
  queryClusters: QueryClusterReport
}

export async function pseoOpportunityFirstPartyReport(
  options: ValidatedPseoOpportunitiesInput,
  dependencies: {
    acquirePseoAuditEvidence?: typeof acquirePseoAuditEvidence
  } = {},
): Promise<PseoOpportunityFirstPartyReport> {
  const auditInput = {
    site: options.site,
    days: options.days,
    sitemaps: options.sitemaps,
    maxSitemapUrls: options.maxSitemapUrls,
    templateLimit: options.templateLimit,
    minimumTemplateUrls: options.minimumTemplateUrls,
    minimumTemplateShare: options.minimumTemplateShare,
    minimumTemplateImpressions: options.minimumTemplateImpressions,
    crawlSamples: 0,
    inspectSamples: 0,
    brandTerms: options.brandTerms,
    includeBrand: options.includeBrand,
    refresh: options.refresh,
  }
  const acquisition = await (
    dependencies.acquirePseoAuditEvidence ?? acquirePseoAuditEvidence
  )(auditInput)
  const rows: QueryClusterSourceRow[] = acquisition.queryPageRows.map(
    (row) => ({
      keys: [row.query, row.page],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions ? row.clicks / row.impressions : 0,
      position: row.position,
    }),
  )
  return {
    audit: buildPseoAuditFromAcquisition(auditInput, acquisition),
    queryClusters: buildQueryClusterReportFromRows({
      site: options.site,
      days: options.days,
      range: acquisition.range,
      generatedAt: acquisition.generatedAt,
      rows,
      brandTerms: options.brandTerms,
      includeBrand: options.includeBrand,
      limit: options.clusterLimit,
    }),
  }
}
