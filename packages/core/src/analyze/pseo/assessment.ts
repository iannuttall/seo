import { countLabel } from '../../phrasing.js'
import { normalizePseoText } from './query-insights.js'
import { comparePseoText } from './row-analysis.js'
import type {
  PseoAuditTemplate,
  PseoCrawlSample,
  PseoIndexStatus,
  PseoInspectionSample,
  PseoPageRow,
} from './types.js'

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[middle]
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function duplicateAffectedCount(values: Array<string | undefined>): number {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = normalizePseoText(value ?? '')
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return [...counts.values()].reduce(
    (sum, count) => sum + (count > 1 ? count : 0),
    0,
  )
}

export function pseoIndexStatus(verdict?: string): PseoIndexStatus {
  if (verdict === 'PASS') return 'indexed'
  if (verdict === 'NEUTRAL') return 'excluded'
  if (verdict === 'FAIL') return 'invalid'
  return 'unknown'
}

export function selectedPseoSampleUrls(
  urls: string[],
  pageRows: PseoPageRow[],
  limit: number,
): string[] {
  if (!limit) return []
  const demand = new Map(pageRows.map((row) => [row.page, row]))
  const ranked = [...urls].sort((left, right) => {
    const leftRow = demand.get(left)
    const rightRow = demand.get(right)
    return (
      (rightRow?.clicks ?? 0) - (leftRow?.clicks ?? 0) ||
      (rightRow?.impressions ?? 0) - (leftRow?.impressions ?? 0) ||
      comparePseoText(left, right)
    )
  })
  const indexes = [0, ranked.length - 1, Math.floor((ranked.length - 1) / 2)]
  const selected: string[] = []
  for (const index of indexes) {
    const url = ranked[index]
    if (url && !selected.includes(url)) selected.push(url)
    if (selected.length >= limit) return selected
  }
  for (const url of ranked) {
    if (!selected.includes(url)) selected.push(url)
    if (selected.length >= limit) break
  }
  return selected
}

export function summarizePseoCrawl(
  samples: PseoCrawlSample[],
  requested: number,
) {
  const succeeded = samples.filter(
    (sample) => sample.technicalStatus !== 'fetch-error',
  ).length
  const usableSamples = samples.filter((sample) =>
    ['ok', 'redirected'].includes(sample.technicalStatus),
  )
  const wordCounts = usableSamples
    .map((sample) => sample.wordCount)
    .filter((value): value is number => value !== undefined)
  const middle = median(wordCounts)
  return {
    requested,
    attempted: samples.length,
    succeeded,
    failed: samples.length - succeeded,
    usable: usableSamples.length,
    samples,
    wordCount:
      wordCounts.length && middle !== undefined
        ? {
            min: Math.min(...wordCounts),
            median: middle,
            max: Math.max(...wordCounts),
          }
        : undefined,
    medianWordCount: middle,
    weakQueryCoverage: usableSamples.filter(
      (sample) => sample.queryCoverage?.classification === 'body-term-review',
    ).length,
    duplicateTitles: duplicateAffectedCount(
      usableSamples.map((sample) => sample.title),
    ),
    duplicateMetaDescriptions: duplicateAffectedCount(
      usableSamples.map((sample) => sample.metaDescription),
    ),
    blockedOrFailed: samples.filter(
      (sample) => !['ok', 'redirected'].includes(sample.technicalStatus),
    ).length,
  }
}

export function summarizePseoInspection(
  samples: PseoInspectionSample[],
  requested: number,
) {
  const successful = samples.filter((sample) => !sample.warning)
  const indexed = successful.filter(
    (sample) => sample.indexStatus === 'indexed',
  ).length
  const notIndexed = successful.filter((sample) =>
    ['excluded', 'invalid'].includes(sample.indexStatus),
  ).length
  return {
    requested,
    attempted: samples.length,
    succeeded: successful.length,
    failed: samples.length - successful.length,
    samples,
    indexed,
    notIndexed,
    unknown: successful.length - indexed - notIndexed,
    warnings: samples.length - successful.length,
  }
}

export function assessPseoTemplate(
  template: Pick<PseoAuditTemplate, 'metrics' | 'crawl' | 'inspection'>,
): Pick<PseoAuditTemplate, 'verdict' | 'confidence'> {
  const conclusive =
    template.inspection.indexed + template.inspection.notIndexed
  if (template.inspection.notIndexed) {
    if (
      conclusive === 1 ||
      template.inspection.notIndexed / conclusive >= 0.5
    ) {
      return {
        verdict: 'index-risk',
        confidence: conclusive >= 2 ? 'medium' : 'low',
      }
    }
  }
  if (template.crawl.blockedOrFailed) {
    if (
      template.crawl.attempted === 1 ||
      template.crawl.blockedOrFailed / template.crawl.attempted >= 0.5
    ) {
      return {
        verdict: 'crawl-risk',
        confidence: template.crawl.attempted >= 2 ? 'medium' : 'low',
      }
    }
  }
  if (
    template.crawl.usable >= 3 &&
    (template.crawl.weakQueryCoverage / template.crawl.usable >= 0.5 ||
      template.crawl.duplicateTitles >= 2 ||
      template.crawl.duplicateMetaDescriptions >= 2)
  ) {
    return { verdict: 'content-review', confidence: 'medium' }
  }
  if (
    template.metrics.impressions > 0 &&
    (template.metrics.position > 8 ||
      (template.metrics.position <= 10 && template.metrics.ctr < 0.01) ||
      (template.metrics.entityFit.checkedQueries >= 10 &&
        template.metrics.entityFit.impressionShare < 0.35))
  ) {
    return { verdict: 'opportunity', confidence: 'low' }
  }
  if (
    conclusive >= 2 &&
    template.inspection.indexed === conclusive &&
    template.crawl.usable >= 2 &&
    template.crawl.blockedOrFailed === 0
  ) {
    return { verdict: 'healthy', confidence: 'medium' }
  }
  if (template.metrics.impressions > 0) {
    return { verdict: 'inconclusive', confidence: 'low' }
  }
  return { verdict: 'no-data', confidence: 'low' }
}

export function pseoTemplateEvidence(template: PseoAuditTemplate): string[] {
  const evidence: string[] = []
  if (template.metrics.impressions) {
    evidence.push(
      `${Math.round(template.metrics.impressions).toLocaleString('en-GB')} impressions from ${countLabel(template.metrics.pageCountWithGsc, 'retained GSC page row')}`,
    )
  }
  if (template.inspection.attempted) {
    const untested = Math.max(
      0,
      template.population.discoveredUrls - template.inspection.attempted,
    )
    evidence.push(
      `${template.inspection.indexed}/${template.inspection.attempted} sampled URLs returned exact PASS verdicts; ${untested} discovered URLs were not inspected`,
    )
  }
  if (template.crawl.attempted) {
    const untested = Math.max(
      0,
      template.population.discoveredUrls - template.crawl.attempted,
    )
    evidence.push(
      `${template.crawl.usable}/${template.crawl.attempted} sampled URLs returned usable 2xx crawl evidence; ${untested} discovered URLs were not sampled`,
    )
  }
  if (template.crawl.weakQueryCoverage) {
    evidence.push(
      `${countLabel(template.crawl.weakQueryCoverage, 'usable sample')} need literal query-term review`,
    )
  }
  if (template.crawl.duplicateTitles) {
    evidence.push(
      `${countLabel(template.crawl.duplicateTitles, 'sampled URL')} share duplicate titles`,
    )
  }
  return evidence
}

export function pseoTemplateRecommendation(
  template: PseoAuditTemplate,
): string {
  if (template.verdict === 'index-risk') {
    return `${countLabel(template.inspection.notIndexed, 'inspected URL')} returned an exact excluded or invalid verdict as of Google's last indexed crawl. Review their robots/noindex, canonical, fetch, and sitemap evidence; do not generalise the result to ${countLabel(template.population.untestedUrls, 'untested URL')}.`
  }
  if (template.verdict === 'crawl-risk') {
    return `${countLabel(template.crawl.blockedOrFailed, 'sampled URL')} returned objective HTTP, robots, noindex, canonical, or fetch failures. Fix those sampled URLs first, then rerun before assessing content.`
  }
  if (template.verdict === 'content-review') {
    return `Review the sampled pages for distinct utility and intent fit. Literal term coverage and repeated metadata are heuristics, not proof that pages need more words or violate Google's policies.`
  }
  if (template.verdict === 'opportunity') {
    return `Retained GSC page rows show search visibility but weak average position, CTR, or entity-fit heuristics. Inspect the top queries and sampled pages before changing this template.`
  }
  if (template.verdict === 'healthy') {
    return `No material issue was found in the bounded crawl and URL Inspection samples. Keep monitoring; this is sample evidence, not a guarantee for every URL.`
  }
  if (template.verdict === 'inconclusive') {
    return `Retained GSC rows show search visibility, but technical sampling is not strong enough for a health verdict. Add bounded crawl and URL Inspection samples.`
  }
  return `No retained page-level Search Analytics evidence was found for this discovered template. That is not proof of zero demand or low quality; inspect representative URLs and canonical attribution.`
}
