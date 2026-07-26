import { selectPseoQueryRows } from '../pseo/analysis.js'
import {
  acquirePseoAuditEvidence,
  buildPseoAuditFromAcquisition,
} from '../pseo/audit.js'
import { comparePseoText } from '../pseo/row-analysis.js'
import type { PseoPageRow, PseoQueryPageRow } from '../pseo/types.js'
import type { ValidatedPseoPatternsInput } from './input.js'

export type PseoPatternsFirstPartyEvidence = {
  audit: ReturnType<typeof buildPseoAuditFromAcquisition>
  queryRows: PseoQueryPageRow[]
  pageRows: PseoPageRow[]
  discoveredUrls: string[]
}

export async function pseoPatternsFirstPartyReport(
  input: ValidatedPseoPatternsInput,
): Promise<PseoPatternsFirstPartyEvidence> {
  const acquisition = await acquirePseoAuditEvidence({
    site: input.site,
    days: input.days,
    sitemaps: input.sitemaps,
    maxSitemapUrls: input.maxSitemapUrls,
    templateLimit: input.templateLimit,
    minimumTemplateUrls: input.minimumTemplateUrls,
    minimumTemplateShare: input.minimumTemplateShare,
    minimumTemplateImpressions: input.minimumTemplateImpressions,
    crawlSamples: 0,
    inspectSamples: 0,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
    refresh: input.refresh,
  })
  const audit = buildPseoAuditFromAcquisition(input, acquisition)
  const selected = selectPseoQueryRows({
    site: input.site,
    queryPageRows: acquisition.queryPageRows,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  return {
    audit,
    queryRows: selected.rows,
    pageRows: acquisition.pageRows,
    discoveredUrls: [
      ...new Set([
        ...acquisition.sitemapUrls,
        ...acquisition.pageRows.map((row) => row.page),
        ...selected.rows.map((row) => row.page),
      ]),
    ].sort(comparePseoText),
  }
}
