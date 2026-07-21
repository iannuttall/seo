import type { PseoAuditReport } from '../pseo/audit.js'
import type {
  PseoDataSourceBrief,
  PseoDiscoveryEvidence,
  PseoExternalCandidate,
  PseoOpportunitiesReport,
  PseoOpportunityFinding,
  PseoOpportunityTemplate,
  PseoSerpEvidence,
} from '../pseo-opportunity-contract.js'
import { PSEO_OPPORTUNITY_LIMITS } from './input.js'

const DATA_SOURCE_CHECKS = [
  'entities and required fields',
  'stable identifiers and join keys',
  'geographic and language coverage',
  'update cadence and stale-data handling',
  'source provenance, licensing, and attribution',
  'validation rules and missing-value stop conditions',
  'bounded inventory and duplicate prevention',
  'representative output, crawl, canonical, and internal-link review',
] as const

export function buildPseoDataSourceBriefs(
  candidates: PseoExternalCandidate[],
): PseoDataSourceBrief[] {
  return candidates
    .filter(
      (candidate) => candidate.classification !== 'existing-first-party-query',
    )
    .slice(0, PSEO_OPPORTUNITY_LIMITS.dataSourceBriefs)
    .map((candidate) => ({
      candidateRef: candidate.evidenceRef,
      proposalType:
        candidate.classification === 'search-evidenced-template-expansion'
          ? 'template-expansion'
          : 'new-template-research',
      instruction:
        'Use the referenced candidate only as research evidence. Identify likely official or primary data sources, then document the required entities, fields, identifiers, coverage, freshness, usage rights, validation rules, and stop conditions before proposing any generated pages.',
      requiredChecks: DATA_SOURCE_CHECKS,
      evidenceBoundary:
        'This brief does not establish that a suitable dataset exists, may be reused, supports enough differentiated pages, or should be turned into a template.',
    }))
}

export function buildPseoOpportunityFindings(input: {
  candidates: PseoExternalCandidate[]
  competitors: PseoOpportunitiesReport['competitors']
}): PseoOpportunityFinding[] {
  const output: PseoOpportunityFinding[] = []
  for (const candidate of input.candidates) {
    if (
      candidate.classification === 'search-evidenced-template-expansion' &&
      candidate.templateRefs[0]
    ) {
      output.push({
        code: 'template-expansion-candidate',
        evidenceRefs: [candidate.evidenceRef, candidate.templateRefs[0]],
        detail: `${candidate.keyword} was returned from a seed tied to a search-evidenced template and was not present in the bounded first-party query set.`,
        action:
          'Review shared intent, representative result pages, the existing template fields, and data coverage before adding entities or pages.',
      })
    } else if (candidate.classification === 'new-template-research') {
      output.push({
        code: 'new-template-research-candidate',
        evidenceRefs: [candidate.evidenceRef],
        detail: `${candidate.keyword} was returned from a query cluster without a mapped observed template.`,
        action:
          'Treat this as research for a possible hub, editorial page, or template. Do not choose the page type until intent, inventory, and data-source checks are complete.',
      })
    }
    if (output.length >= 8) break
  }
  for (const [index, competitor] of input.competitors.entries()) {
    if (!competitor.repeatedTemplates.length) continue
    output.push({
      code: 'competitor-repeated-pattern',
      evidenceRefs: [`competitors[${index}]`],
      detail: `${competitor.domain} appeared for ${competitor.queryCount} retained queries with ${competitor.repeatedTemplates.length} repeated URL pattern${competitor.repeatedTemplates.length === 1 ? '' : 's'}.`,
      action:
        'Inspect representative pages for intent, result type, useful fields, and navigation. The URL pattern alone does not establish quality or a template worth reproducing.',
    })
    if (output.length >= 12) break
  }
  return output
}

export function pseoOpportunityDataStatus(input: {
  audit: PseoAuditReport
  discovery: PseoDiscoveryEvidence
  serps: PseoSerpEvidence
}): PseoOpportunitiesReport['dataStatus'] {
  if (!input.audit.templates.length) return 'empty'
  if (
    input.audit.dataStatus !== 'complete' ||
    input.discovery.status === 'partial' ||
    input.discovery.status === 'unavailable' ||
    input.serps.failedQueries > 0 ||
    input.serps.observations.some(
      (observation) => observation.status === 'partial',
    )
  ) {
    return 'partial'
  }
  if (input.discovery.omittedCandidates > 0) return 'filtered'
  return 'complete'
}

export function pseoOpportunityVerdict(input: {
  templates: PseoOpportunityTemplate[]
  candidates: PseoExternalCandidate[]
  competitors: PseoOpportunitiesReport['competitors']
  discovery: PseoDiscoveryEvidence
}): string {
  const searchTemplates = input.templates.filter(
    (template) => template.evidenceClass === 'search-evidenced-template',
  ).length
  if (!input.templates.length) {
    return 'No repeated template family met the bounded first-party selection rules.'
  }
  if (!input.discovery.requested) {
    return `${searchTemplates} search-evidenced template${searchTemplates === 1 ? '' : 's'} can seed optional external research; no paid provider calls were made.`
  }
  if (input.discovery.status === 'unavailable') {
    return `${searchTemplates} search-evidenced template${searchTemplates === 1 ? '' : 's'} were retained, but external discovery was unavailable.`
  }
  const expansions = input.candidates.filter(
    (candidate) =>
      candidate.classification === 'search-evidenced-template-expansion',
  ).length
  return `${expansions} template-expansion candidate${expansions === 1 ? '' : 's'} and ${input.competitors.length} observed competitor domain${input.competitors.length === 1 ? '' : 's'} were retained for review.`
}
