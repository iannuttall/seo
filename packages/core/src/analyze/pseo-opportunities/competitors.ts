import { clusterPseoTemplates } from '../pseo/templates.js'
import type { PseoCompetitorPattern } from '../pseo-opportunity-contract.js'
import type { SerpResultsReport } from '../serp-results.js'
import { comparePseoOpportunityText, PSEO_OPPORTUNITY_LIMITS } from './input.js'

function siteDomain(site: string): string | null {
  const value = site.replace(/^sc-domain:/u, '')
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
      .replace(/^www\./u, '')
      .toLowerCase()
  } catch {
    return null
  }
}

export function findPseoCompetitorPatterns(
  reports: SerpResultsReport[],
  site: string,
): PseoCompetitorPattern[] {
  const self = siteDomain(site)
  const byDomain = new Map<
    string,
    {
      queries: Set<string>
      results: Array<{ rank: number; url: string }>
      evidenceRefs: Set<string>
    }
  >()
  for (const [reportIndex, report] of reports.entries()) {
    for (const result of report.evidence.data.organicResults) {
      const domain = result.domain.replace(/^www\./u, '').toLowerCase()
      if (
        !domain ||
        (self && (domain === self || domain.endsWith(`.${self}`)))
      ) {
        continue
      }
      const current = byDomain.get(domain) ?? {
        queries: new Set<string>(),
        results: [],
        evidenceRefs: new Set<string>(),
      }
      current.queries.add(report.summary.keyword)
      current.results.push({ rank: result.rankAbsolute, url: result.url })
      current.evidenceRefs.add(
        `source.external.serps.observations[${reportIndex}]`,
      )
      byDomain.set(domain, current)
    }
  }
  return [...byDomain.entries()]
    .map(([domain, value]) => {
      const urls = [...new Set(value.results.map((result) => result.url))]
      return {
        domain,
        queryCount: value.queries.size,
        resultCount: value.results.length,
        bestRank: Math.min(...value.results.map((result) => result.rank)),
        queries: [...value.queries].sort(comparePseoOpportunityText),
        sampleUrls: urls.sort(comparePseoOpportunityText).slice(0, 3),
        repeatedTemplates: clusterPseoTemplates(urls, {
          minUrls: 2,
          minShare: 0,
          limit: 3,
          sampleSize: 3,
        }).map((template) => ({
          signature: template.signature,
          urlCount: template.urlCount,
          sampleUrls: template.sampleUrls,
        })),
        evidenceRefs: [...value.evidenceRefs].sort(comparePseoOpportunityText),
      }
    })
    .sort(
      (left, right) =>
        right.queryCount - left.queryCount ||
        right.resultCount - left.resultCount ||
        left.bestRank - right.bestRank ||
        comparePseoOpportunityText(left.domain, right.domain),
    )
    .slice(0, PSEO_OPPORTUNITY_LIMITS.competitors)
}
