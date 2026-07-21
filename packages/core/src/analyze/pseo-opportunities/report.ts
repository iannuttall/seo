import { randomUUID } from 'node:crypto'
import type { keywordResearchReport } from '../keyword-research.js'
import type {
  PseoOpportunitiesInput,
  PseoOpportunitiesReport,
} from '../pseo-opportunity-contract.js'
import type { serpResultsReport } from '../serp-results.js'
import { findPseoCompetitorPatterns } from './competitors.js'
import { acquirePseoDiscovery } from './discovery.js'
import { aggregatePseoExternalCost } from './external-common.js'
import {
  projectPseoOpportunityClusters,
  projectPseoOpportunityTemplates,
  pseoFirstPartyQueries,
  selectPseoResearchSeeds,
} from './first-party.js'
import { pseoOpportunityFirstPartyReport } from './first-party-acquisition.js'
import {
  PSEO_OPPORTUNITY_LIMITS,
  validatePseoOpportunitiesInput,
} from './input.js'
import {
  buildPseoDataSourceBriefs,
  buildPseoOpportunityFindings,
  pseoOpportunityDataStatus,
  pseoOpportunityVerdict,
} from './insights.js'
import { acquirePseoSerps } from './serps.js'

export type PseoOpportunitiesDependencies = {
  firstPartyReport?: typeof pseoOpportunityFirstPartyReport
  keywordResearchReport?: typeof keywordResearchReport
  serpResultsReport?: typeof serpResultsReport
  now?: () => Date
}

export async function pseoOpportunitiesReport(
  input: PseoOpportunitiesInput,
  dependencies: PseoOpportunitiesDependencies = {},
): Promise<PseoOpportunitiesReport> {
  const options = validatePseoOpportunitiesInput(input)
  const runId = randomUUID()
  const { audit, queryClusters: clusterReport } = await (
    dependencies.firstPartyReport ?? pseoOpportunityFirstPartyReport
  )(options)
  const templates = projectPseoOpportunityTemplates(audit)
  const queryClusters = projectPseoOpportunityClusters(clusterReport, templates)
  const seeds = selectPseoResearchSeeds({
    templates,
    clusters: queryClusters,
  })
  const discovery = await acquirePseoDiscovery({
    options,
    seeds,
    knownQueries: pseoFirstPartyQueries({
      templates,
      clusters: queryClusters,
    }),
    runId,
    report: dependencies.keywordResearchReport,
  })
  const serp = await acquirePseoSerps({
    options,
    candidates: discovery.candidates,
    runId,
    report: dependencies.serpResultsReport,
  })
  const competitors = findPseoCompetitorPatterns(serp.reports, options.site)
  const dataSourceBriefs = buildPseoDataSourceBriefs(discovery.candidates)
  const costs = [
    ...(discovery.acquisition ? [discovery.acquisition.cost] : []),
    ...serp.evidence.observations.flatMap((observation) =>
      observation.acquisition ? [observation.acquisition.cost] : [],
    ),
  ]
  const templateExpansionCandidates = discovery.candidates.filter(
    (candidate) =>
      candidate.classification === 'search-evidenced-template-expansion',
  ).length
  const newTemplateResearchCandidates = discovery.candidates.filter(
    (candidate) => candidate.classification === 'new-template-research',
  ).length

  return {
    schemaVersion: 1,
    methodology: 'pseo_opportunities_v1',
    site: options.site,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    dataStatus: pseoOpportunityDataStatus({
      audit,
      discovery,
      serps: serp.evidence,
    }),
    market: options.market ?? null,
    summary: {
      observedTemplates: templates.length,
      searchEvidencedTemplates: templates.filter(
        (template) => template.evidenceClass === 'search-evidenced-template',
      ).length,
      queryClusters: queryClusters.length,
      researchSeeds: seeds.length,
      discoveredCandidates: discovery.candidates.length,
      templateExpansionCandidates,
      newTemplateResearchCandidates,
      serpSnapshots: serp.evidence.completedQueries,
      observedCompetitors: competitors.length,
      dataSourceBriefs: dataSourceBriefs.length,
      verdict: pseoOpportunityVerdict({
        templates,
        candidates: discovery.candidates,
        competitors,
        discovery,
      }),
    },
    source: {
      pseoAudit: {
        range: audit.range,
        dataStatus: audit.dataStatus,
        pageRows: audit.source.searchAnalytics.pageRows,
        queryPageRows: audit.source.searchAnalytics.queryPageRows,
        pageRowsPossiblyTruncated:
          audit.source.searchAnalytics.pageRowsPossiblyTruncated,
        queryPageRowsPossiblyTruncated:
          audit.source.searchAnalytics.queryPageRowsPossiblyTruncated,
        discoveredUrls: audit.selection.discoveredUrls,
        returnedTemplates: audit.selection.returnedTemplates,
      },
      queryClusters: {
        range: clusterReport.range,
        returnedClusters: clusterReport.summary.clusters,
        returnedQueries: clusterReport.summary.queries,
        completeness: 'returned-clusters-only',
        minImpressions: clusterReport.summary.minImpressions,
        limit: clusterReport.summary.limit,
      },
      external: {
        discovery,
        serps: serp.evidence,
        cost: aggregatePseoExternalCost(costs),
      },
    },
    selection: {
      templateLimit: options.templateLimit,
      clusterLimit: options.clusterLimit,
      seedLimit: PSEO_OPPORTUNITY_LIMITS.seeds,
      discoveryLimit: options.discoveryLimit,
      candidateLimit: options.candidateLimit,
      serpLimit: options.serpLimit,
      serpDepth: options.serpDepth,
      organicResultsPerSnapshot:
        PSEO_OPPORTUNITY_LIMITS.organicResultsPerSnapshot,
      competitorLimit: PSEO_OPPORTUNITY_LIMITS.competitors,
      dataSourceBriefLimit: PSEO_OPPORTUNITY_LIMITS.dataSourceBriefs,
      candidateOrder: 'classification-source-count-volume-keyword-v1',
    },
    templates,
    queryClusters,
    competitors,
    findings: buildPseoOpportunityFindings({
      candidates: discovery.candidates,
      competitors,
    }),
    dataSourceBriefs,
    caveats: [
      'Search Console impressions, clicks, CTR, and average position remain first-party evidence. External search volume, difficulty, intent, and result counts remain provider estimates.',
      'Template and query-cluster matching uses bounded URL-pattern and lexical heuristics. It does not prove shared intent, page quality, or that more pages should exist.',
      'Only phrase-matching suggestions tied to a template are classified as template expansion candidates. Category ideas and related-search terms remain new-template research until intent and page type are verified.',
      'A discovered term absent from retained Search Console rows is not proof that the site has no impressions for it; Search Console omits anonymized queries and both sources are bounded.',
      'Live result snapshots describe one market, location, language, device, and observation time. Repeated domains and URL patterns are not authority or ranking-feasibility scores.',
      'Data-source briefs are next-step research instructions. They do not establish that a dataset exists, may be reused, or can support differentiated pages.',
    ],
    nextSteps: [
      discovery.requested
        ? 'Review the retained candidates by first-party template evidence, provider source, metric state, and live result intent before choosing a page type.'
        : 'Rerun with includeExternal, an explicit market, and a small discovery limit when independent keyword expansion would change the decision.',
      options.serpLimit
        ? 'Open representative ranking pages for the retained competitor patterns and compare useful fields, result types, and navigation without copying their content.'
        : 'Set serpLimit to 1 to 3 only for the strongest candidates when current competitor and intent evidence would change the decision.',
      'Use each data-source brief to verify identifiers, fields, coverage, freshness, rights, missing-value rules, bounded inventory, and representative page value before expanding a template.',
      'Run pseo-audit with bounded crawl and URL Inspection samples before changing an existing generator or launching a new template family.',
    ],
  }
}
