import type { PseoAuditReport } from '../pseo/audit.js'
import { normalizePseoText } from '../pseo/query-insights.js'
import type {
  PseoOpportunityCluster,
  PseoOpportunityTemplate,
  PseoResearchSeed,
} from '../pseo-opportunity-contract.js'
import type { QueryClusterReport } from '../query-cluster.js'
import { comparePseoOpportunityText, PSEO_OPPORTUNITY_LIMITS } from './input.js'

export function projectPseoOpportunityTemplates(
  report: PseoAuditReport,
): PseoOpportunityTemplate[] {
  return report.templates.map((template, index) => ({
    signature: template.signature,
    shape: template.shape,
    sampleUrls: template.sampleUrls.slice(0, 3),
    population: {
      discoveredUrls: template.population.discoveredUrls,
      gscVisibleUrls: template.population.gscVisibleUrls,
      untestedUrls: template.population.untestedUrls,
    },
    searchEvidence: {
      clicks: template.metrics.clicks,
      impressions: template.metrics.impressions,
      averagePosition: template.metrics.position,
      topQueries: template.metrics.topQueries.slice(0, 5),
      queryPatterns: template.metrics.queryPatterns.slice(0, 5),
    },
    evidenceClass:
      template.metrics.impressions > 0
        ? 'search-evidenced-template'
        : 'observed-template',
    auditVerdict: template.verdict,
    confidence: template.confidence,
    evidenceRef: `templates[${index}]`,
  }))
}

export function projectPseoOpportunityClusters(
  report: QueryClusterReport,
  templates: PseoOpportunityTemplate[],
): PseoOpportunityCluster[] {
  const templateRefs = new Map(
    templates.map((template) => [template.signature, template.evidenceRef]),
  )
  return report.clusters.map((cluster, index) => {
    const templateRef = cluster.template
      ? (templateRefs.get(cluster.template.signature) ?? null)
      : null
    return {
      label: cluster.label,
      intent: cluster.intent,
      queries: cluster.queries.slice(0, 5),
      totals: cluster.totals,
      template: cluster.template,
      summary: cluster.summary,
      recommendation: cluster.recommendation,
      evidenceClass: templateRef ? 'template-mapped' : 'query-cluster',
      templateRef,
      evidenceRef: `queryClusters[${index}]`,
    }
  })
}

export function selectPseoResearchSeeds(input: {
  templates: PseoOpportunityTemplate[]
  clusters: PseoOpportunityCluster[]
}): PseoResearchSeed[] {
  const candidates: Array<PseoResearchSeed & { impressions: number }> = []
  for (const template of input.templates) {
    if (template.evidenceClass !== 'search-evidenced-template') continue
    const query = template.searchEvidence.topQueries[0]
    if (!query) continue
    candidates.push({
      keyword: query.query,
      source: 'template',
      evidenceRef: template.evidenceRef,
      templateRef: template.evidenceRef,
      impressions: query.impressions,
    })
  }
  for (const cluster of input.clusters) {
    const query = cluster.queries[0]
    if (!query) continue
    candidates.push({
      keyword: query.query,
      source: 'query-cluster',
      evidenceRef: cluster.evidenceRef,
      templateRef: cluster.templateRef,
      impressions: query.impressions,
    })
  }
  const seen = new Set<string>()
  return candidates
    .sort(
      (left, right) =>
        Number(right.source === 'template') -
          Number(left.source === 'template') ||
        right.impressions - left.impressions ||
        comparePseoOpportunityText(left.keyword, right.keyword),
    )
    .filter((candidate) => {
      const normalized = normalizePseoText(candidate.keyword)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .slice(0, PSEO_OPPORTUNITY_LIMITS.seeds)
    .map(({ impressions: _, ...seed }) => seed)
}

export function pseoFirstPartyQueries(input: {
  templates: PseoOpportunityTemplate[]
  clusters: PseoOpportunityCluster[]
}): Set<string> {
  return new Set(
    [
      ...input.templates.flatMap((template) =>
        template.searchEvidence.topQueries.map((query) => query.query),
      ),
      ...input.clusters.flatMap((cluster) =>
        cluster.queries.map((query) => query.query),
      ),
    ].map(normalizePseoText),
  )
}
