import { shouldExcludeBrandQuery } from '../../brand.js'
import { extractPage } from '../../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../../fetch/page-fetcher.js'
import { inspectUrl } from '../../gsc/client/inspection.js'
import type { UrlInspectionResult } from '../../gsc/client/types.js'
import type { PageFetchDiagnostics } from '../../types.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import { fetchSiteQueryPageRows } from '../shared.js'
import {
  clusterPseoTemplates,
  type PseoTemplateCluster,
  templateForUrl,
} from './templates.js'

type PseoTemplateMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
  impressionsPerUrl: number
  clicksPerUrl: number
  queryCount: number
  pageCountWithGsc: number
  zeroClickImpressions: number
  queryPatterns: PseoQueryPattern[]
  topQueries: Array<{
    query: string
    clicks: number
    impressions: number
    position: number
  }>
}

type PseoCrawlSample = {
  url: string
  finalUrl?: string
  status?: number
  title?: string
  h1?: string
  metaDescription?: string
  wordCount?: number
  queryCoverage?: PseoQueryCoverage
  fetchDiagnostics?: PageFetchDiagnostics
  warning?: string
}

type PseoQueryPattern = {
  label: string
  queryCount: number
  clicks: number
  impressions: number
  examples: string[]
}

type PseoQueryCoverage = {
  query: string
  classification: 'covered' | 'serp-framing' | 'content-gap'
  titleCoverage: number
  h1Coverage: number
  bodyCoverage: number
  missingTerms: string[]
}

type PseoInspectionSample = {
  url: string
  verdict?: string
  coverageState?: string
  indexingState?: string
  pageFetchState?: string
  lastCrawlTime?: string
  userCanonical?: string
  googleCanonical?: string
  warning?: string
}

export type PseoAuditTemplate = PseoTemplateCluster & {
  metrics: PseoTemplateMetrics
  crawl: {
    samples: PseoCrawlSample[]
    medianWordCount?: number
    lowWordCount: number
    weakQueryCoverage: number
    duplicateTitles: number
    duplicateMetaDescriptions: number
    blockedOrFailed: number
  }
  inspection: {
    samples: PseoInspectionSample[]
    indexed: number
    notIndexed: number
    warnings: number
  }
  evidence: string[]
  verdict:
    | 'healthy'
    | 'opportunity'
    | 'index-risk'
    | 'content-risk'
    | 'crawl-risk'
    | 'no-data'
  confidence: 'high' | 'medium' | 'low'
  recommendation: string
}

export type PseoAuditReport = {
  site: string
  generatedAt: string
  rangeDays: number
  summary: {
    sitemapUrls: number
    gscPages: number
    templates: number
    clicks: number
    impressions: number
    inspectedUrls: number
    crawledUrls: number
  }
  templates: PseoAuditTemplate[]
  warnings: string[]
}

function weightedPosition(
  rows: Array<{ impressions: number; position: number }>,
) {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  if (!impressions) return 0
  return (
    rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
    impressions
  )
}

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'best',
  'for',
  'first',
  'from',
  'how',
  'in',
  'is',
  'last',
  'letter',
  'letters',
  'name',
  'names',
  'of',
  'on',
  'or',
  'start',
  'starts',
  'starting',
  'that',
  'the',
  'to',
  'vs',
  'with',
])

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/([a-z0-9])[’']([a-z0-9])/gi, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryTerms(query: string): string[] {
  const terms = normalizeText(query)
    .split(' ')
    .filter((term) => term.length > 2 && !QUERY_STOPWORDS.has(term))
  return [...new Set(terms)]
}

function canonicalTerm(term: string): string {
  if (['surname', 'surnames'].includes(term)) return 'name'
  if (['beginning', 'begins', 'started'].includes(term)) return 'start'
  if (term.length > 4 && term.endsWith('s')) return term.slice(0, -1)
  return term
}

function termCoverage(
  query: string,
  text?: string,
): {
  coverage: number
  missingTerms: string[]
} {
  const terms = queryTerms(query)
  if (!terms.length) return { coverage: 1, missingTerms: [] }
  const normalizedText = normalizeText(text ?? '')
  const textTerms = normalizedText.split(' ').map(canonicalTerm)
  const matched = terms.filter((term) =>
    textTerms.some(
      (token) =>
        token === canonicalTerm(term) || token.startsWith(canonicalTerm(term)),
    ),
  )
  return {
    coverage: matched.length / terms.length,
    missingTerms: terms.filter((term) => !matched.includes(term)),
  }
}

function classifyQueryCoverage(input: {
  query: string
  title?: string
  h1?: string
  body?: string
}): PseoQueryCoverage {
  const title = termCoverage(input.query, input.title)
  const h1 = termCoverage(input.query, input.h1)
  const body = termCoverage(input.query, input.body)
  const classification =
    body.coverage < 0.75
      ? 'content-gap'
      : title.coverage < 0.75 || h1.coverage < 0.75
        ? 'serp-framing'
        : 'covered'

  return {
    query: input.query,
    classification,
    titleCoverage: title.coverage,
    h1Coverage: h1.coverage,
    bodyCoverage: body.coverage,
    missingTerms: body.missingTerms.slice(0, 8),
  }
}

function queryPatternLabel(query: string): string {
  const normalized = normalizeText(query)
  if (/\b(vs|versus|compare|comparison)\b/.test(normalized)) {
    return 'comparison'
  }
  if (/\balternative|alternatives\b/.test(normalized)) return 'alternatives'
  if (/\bwithout (account|login|signing|sign in)\b/.test(normalized)) {
    return 'no-login modifier'
  }
  if (/\b(export|download|save|convert)\b/.test(normalized)) {
    return 'workflow/action'
  }
  if (/\bmeaning|origin|history\b/.test(normalized)) return 'meaning/origin'
  if (/\brare|rarity|popular|popularity\b/.test(normalized)) {
    return 'rarity/popularity'
  }
  if (/\bhow many|number of|people with|people have\b/.test(normalized)) {
    return 'count/statistic'
  }
  if (
    /\b(starting with|starts with|start with|beginning with|letter)\b/.test(
      normalized,
    )
  ) {
    return 'list/facet'
  }
  if (/\b(price|pricing|cost|fee)\b/.test(normalized)) return 'pricing'
  if (/\breview|reviews|reddit|forum|community\b/.test(normalized)) {
    return 'reviews/community'
  }
  if (/\bguide|docs|documentation|api\b/.test(normalized)) {
    return 'docs/how-to'
  }
  return 'general'
}

function queryPatterns(
  rows: Array<{
    query: string
    clicks: number
    impressions: number
  }>,
): PseoQueryPattern[] {
  const patterns = new Map<string, PseoQueryPattern>()
  for (const row of rows) {
    const label = queryPatternLabel(row.query)
    const existing = patterns.get(label) ?? {
      label,
      queryCount: 0,
      clicks: 0,
      impressions: 0,
      examples: [],
    }
    existing.queryCount += 1
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    if (
      existing.examples.length < 3 &&
      !existing.examples.includes(row.query)
    ) {
      existing.examples.push(row.query)
    }
    patterns.set(label, existing)
  }

  return [...patterns.values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
}

function primaryActionPattern(
  patterns: PseoQueryPattern[],
): PseoQueryPattern | undefined {
  const top = patterns[0]
  if (!top) return undefined
  if (top.label !== 'general') return top
  const specific = patterns.find(
    (pattern) =>
      pattern.label !== 'general' &&
      pattern.impressions >= top.impressions * 0.45,
  )
  return specific ?? top
}

function metricsForRows(
  rows: Array<{
    query: string
    page: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>,
  urlCount: number,
): PseoTemplateMetrics {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const byQuery = new Map<string, PseoTemplateMetrics['topQueries'][number]>()
  for (const row of rows) {
    const existing = byQuery.get(row.query) ?? {
      query: row.query,
      clicks: 0,
      impressions: 0,
      position: 0,
    }
    const previousImpressions = existing.impressions
    const previousPosition = existing.position
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    existing.position = weightedPosition([
      { impressions: previousImpressions, position: previousPosition },
      { impressions: row.impressions, position: row.position },
    ])
    byQuery.set(row.query, existing)
  }

  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedPosition(rows),
    impressionsPerUrl: urlCount ? impressions / urlCount : 0,
    clicksPerUrl: urlCount ? clicks / urlCount : 0,
    queryCount: byQuery.size,
    pageCountWithGsc: new Set(rows.map((row) => row.page)).size,
    zeroClickImpressions: rows
      .filter((row) => row.clicks === 0)
      .reduce((sum, row) => sum + row.impressions, 0),
    queryPatterns: queryPatterns(rows),
    topQueries: [...byQuery.values()]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5),
  }
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function duplicateCount(values: Array<string | undefined>): number {
  const counts = new Map<string, number>()
  for (const value of values
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.values()].filter((count) => count > 1).length
}

function topQueryByUrl(
  rows: Array<{
    query: string
    page: string
    clicks: number
    impressions: number
  }>,
): Map<string, string> {
  const best = new Map<string, { query: string; score: number }>()
  for (const row of rows) {
    const score = row.impressions + row.clicks * 10
    const existing = best.get(row.page)
    if (!existing || score > existing.score) {
      best.set(row.page, { query: row.query, score })
    }
  }
  return new Map([...best.entries()].map(([url, value]) => [url, value.query]))
}

async function crawlSamples(input: {
  urls: string[]
  limit: number
  topQueryByUrl: ReadonlyMap<string, string>
  refresh?: boolean
  js?: boolean | 'auto'
  rate?: FetchRateControls
}): Promise<PseoCrawlSample[]> {
  const samples: PseoCrawlSample[] = []
  for (const url of input.urls.slice(0, input.limit)) {
    try {
      const fetched = await fetchPage(url, {
        refresh: input.refresh,
        js: input.js ?? 'auto',
        rate: input.rate,
      })
      const page = await extractPage(fetched)
      const h1 = page.headings.find((heading) => heading.level === 1)?.text
      const topQuery = input.topQueryByUrl.get(url)
      samples.push({
        url,
        finalUrl: page.finalUrl,
        status: fetched.status,
        title: page.title,
        h1,
        metaDescription: page.metaDescription,
        wordCount: page.wordCount,
        queryCoverage: topQuery
          ? classifyQueryCoverage({
              query: topQuery,
              title: page.title,
              h1,
              body: page.contentText,
            })
          : undefined,
        fetchDiagnostics: fetched.diagnostics,
      })
    } catch (error) {
      samples.push({
        url,
        warning: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return samples
}

function inspectionStatus(
  result: UrlInspectionResult,
): Omit<PseoInspectionSample, 'url'> {
  const status = result.inspectionResult?.indexStatusResult
  return {
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    indexingState: status?.indexingState,
    pageFetchState: status?.pageFetchState,
    lastCrawlTime: status?.lastCrawlTime,
    userCanonical: status?.userCanonical,
    googleCanonical: status?.googleCanonical,
  }
}

async function inspectSamples(input: {
  site: string
  urls: string[]
  limit: number
}): Promise<PseoInspectionSample[]> {
  const samples: PseoInspectionSample[] = []
  for (const url of input.urls.slice(0, input.limit)) {
    try {
      samples.push({
        url,
        ...inspectionStatus(
          await inspectUrl({
            siteUrl: input.site,
            inspectionUrl: url,
          }),
        ),
      })
    } catch (error) {
      samples.push({
        url,
        warning: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return samples
}

function buildRecommendation(input: {
  template: PseoAuditTemplate
  crawlSamplesRequested: boolean
  inspectionSamplesRequested: boolean
}): string {
  const template = input.template
  const topPattern = primaryActionPattern(template.metrics.queryPatterns)
  const patternLabel = topPattern
    ? `${topPattern.label} demand`
    : 'known query demand'
  if (template.verdict === 'index-risk') {
    return `Prioritise indexability for ${template.signature}: inspect canonicals, robots/noindex, soft 404 states, and sitemap quality before rewriting content.`
  }
  if (template.verdict === 'crawl-risk') {
    return `Fix fetch reliability for ${template.signature}: blocked/slow/failed samples make content conclusions unreliable.`
  }
  if (template.verdict === 'content-risk') {
    const weakCoverage = template.crawl.weakQueryCoverage
      ? `${template.crawl.weakQueryCoverage} sampled URL(s) weakly cover their top query`
      : `median content is ${template.crawl.medianWordCount ?? '?'} words`
    return `Improve ${template.signature} around ${patternLabel}: ${weakCoverage}. Add record-specific facts, query-matched headings, and unique title/meta logic.`
  }
  if (template.verdict === 'opportunity') {
    const examples = topPattern?.examples.slice(0, 2).join('; ')
    return `Grow ${template.signature} around ${patternLabel}${examples ? ` (${examples})` : ''}: test title/H1/meta phrasing, add internal links, and fill missing query angles.`
  }
  if (!input.crawlSamplesRequested || !input.inspectionSamplesRequested) {
    return `Looks stable from GSC. Add --crawl-samples and --inspect-samples for stronger template-level confidence.`
  }
  return `Keep monitoring this template; current first-party evidence does not show a material issue.`
}

function buildEvidence(input: {
  cluster: PseoTemplateCluster
  metrics: PseoTemplateMetrics
  crawlSamples: PseoCrawlSample[]
  inspectionSamples: PseoInspectionSample[]
}): string[] {
  const evidence: string[] = []
  if (input.metrics.impressions > 0) {
    evidence.push(
      `${Math.round(input.metrics.impressions).toLocaleString('en-GB')} impressions across ${input.metrics.pageCountWithGsc.toLocaleString('en-GB')} GSC page(s)`,
    )
  }
  if (input.metrics.zeroClickImpressions > 0) {
    evidence.push(
      `${Math.round(input.metrics.zeroClickImpressions).toLocaleString('en-GB')} impressions had zero clicks`,
    )
  }
  const topPattern = primaryActionPattern(input.metrics.queryPatterns)
  if (topPattern) {
    evidence.push(
      `top demand pattern: ${topPattern.label} (${Math.round(topPattern.impressions).toLocaleString('en-GB')} impressions)`,
    )
  }
  const inspected = input.inspectionSamples.filter((sample) => !sample.warning)
  if (inspected.length) {
    const indexed = inspected.filter((sample) =>
      /pass|indexed/i.test(`${sample.verdict} ${sample.coverageState}`),
    ).length
    evidence.push(`${indexed}/${inspected.length} inspected URL(s) indexed`)
  }
  const weakCoverage = input.crawlSamples.filter(
    (sample) => sample.queryCoverage?.classification === 'content-gap',
  ).length
  if (weakCoverage) {
    evidence.push(`${weakCoverage} sampled URL(s) weakly cover top query`)
  }
  const failedCrawls = input.crawlSamples.filter(
    (sample) => sample.warning || sample.fetchDiagnostics?.blocked,
  ).length
  if (failedCrawls) {
    evidence.push(`${failedCrawls} sampled URL(s) blocked or failed to fetch`)
  }
  return evidence
}

function classifyTemplate(input: {
  cluster: PseoTemplateCluster
  metrics: PseoTemplateMetrics
  crawlSamples: PseoCrawlSample[]
  inspectionSamples: PseoInspectionSample[]
}): Pick<PseoAuditTemplate, 'verdict' | 'confidence'> {
  const inspected = input.inspectionSamples.filter((sample) => !sample.warning)
  const notIndexed = inspected.filter(
    (sample) =>
      sample.verdict &&
      !/pass|indexed/i.test(`${sample.verdict} ${sample.coverageState}`),
  ).length
  const failedCrawls = input.crawlSamples.filter(
    (sample) => sample.warning || sample.fetchDiagnostics?.blocked,
  ).length
  const wordCounts = input.crawlSamples
    .map((sample) => sample.wordCount)
    .filter((value): value is number => typeof value === 'number')
  const medianWords = median(wordCounts)
  const weakCoverage = input.crawlSamples.filter(
    (sample) => sample.queryCoverage?.classification === 'content-gap',
  ).length

  if (!input.metrics.impressions && !input.cluster.urlCount) {
    return { verdict: 'no-data', confidence: 'low' }
  }
  if (inspected.length && notIndexed / inspected.length >= 0.5) {
    return { verdict: 'index-risk', confidence: 'high' }
  }
  if (
    input.crawlSamples.length &&
    failedCrawls / input.crawlSamples.length >= 0.5
  ) {
    return { verdict: 'crawl-risk', confidence: 'high' }
  }
  if (
    wordCounts.length >= 2 &&
    medianWords !== undefined &&
    medianWords < 250 &&
    input.metrics.impressions < input.cluster.urlCount * 5
  ) {
    return { verdict: 'content-risk', confidence: 'medium' }
  }
  if (input.crawlSamples.length >= 2 && input.metrics.impressions > 0) {
    const weakRate = weakCoverage / input.crawlSamples.length
    if (input.crawlSamples.length >= 3 && weakRate >= 0.5) {
      return { verdict: 'content-risk', confidence: 'high' }
    }
    if (weakRate > 0.5) {
      return { verdict: 'content-risk', confidence: 'medium' }
    }
  }
  if (
    input.metrics.impressions > 0 &&
    (input.metrics.position > 8 || input.metrics.ctr < 0.01)
  ) {
    return { verdict: 'opportunity', confidence: 'medium' }
  }
  if (input.metrics.impressions > 0) {
    return {
      verdict: 'healthy',
      confidence: inspected.length ? 'high' : 'medium',
    }
  }
  return { verdict: 'no-data', confidence: 'low' }
}

export async function pseoAuditReport(input: {
  site: string
  days?: number
  sitemaps?: string[]
  maxSitemapUrls?: number
  templateLimit?: number
  crawlSamples?: number
  inspectSamples?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
  js?: boolean | 'auto'
  rate?: FetchRateControls
}): Promise<PseoAuditReport> {
  const days = input.days ?? 28
  const warnings: string[] = []
  const sitemapUrls = (
    await Promise.all(
      (input.sitemaps ?? []).map((sitemapUrl) =>
        fetchSitemapUrls({
          sitemapUrl,
          limit: input.maxSitemapUrls ?? 50_000,
        }),
      ),
    )
  ).flatMap((result) => {
    warnings.push(...result.warnings)
    return result.urls
  })

  const { rows } = await fetchSiteQueryPageRows(input.site, days, input.refresh)
  const gscRows = rows
    .map((row) => ({
      query: row.keys[0] ?? '',
      page: row.keys[1] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter(
      (row) =>
        row.page &&
        row.query &&
        !isLowActionabilityQuery(row.query) &&
        !shouldExcludeBrandQuery({
          query: row.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }),
    )
  const pageTopQuery = topQueryByUrl(gscRows)

  const allUrls = [
    ...new Set([...sitemapUrls, ...gscRows.map((row) => row.page)]),
  ]
  const clusters = clusterPseoTemplates(allUrls, {
    limit: input.templateLimit ?? 25,
  })
  const rowsByTemplate = new Map<string, typeof gscRows>()
  for (const row of gscRows) {
    const signature = templateForUrl(row.page, clusters)
    const existing = rowsByTemplate.get(signature) ?? []
    existing.push(row)
    rowsByTemplate.set(signature, existing)
  }

  const templates: PseoAuditTemplate[] = []
  for (const cluster of clusters) {
    const directRows = rowsByTemplate.get(cluster.signature) ?? []
    const broadRows = directRows.length
      ? directRows
      : gscRows.filter((row) => cluster.sampleUrls.includes(row.page))
    const metrics = metricsForRows(broadRows, cluster.urlCount)
    const crawled =
      input.crawlSamples && input.crawlSamples > 0
        ? await crawlSamples({
            urls: cluster.sampleUrls,
            limit: input.crawlSamples,
            topQueryByUrl: pageTopQuery,
            refresh: input.refresh,
            js: input.js,
            rate: input.rate,
          })
        : []
    const inspected =
      input.inspectSamples && input.inspectSamples > 0
        ? await inspectSamples({
            site: input.site,
            urls: cluster.sampleUrls,
            limit: input.inspectSamples,
          })
        : []
    const classified = classifyTemplate({
      cluster,
      metrics,
      crawlSamples: crawled,
      inspectionSamples: inspected,
    })
    const crawl = {
      samples: crawled,
      medianWordCount: median(
        crawled
          .map((sample) => sample.wordCount)
          .filter((value): value is number => typeof value === 'number'),
      ),
      lowWordCount: crawled.filter(
        (sample) =>
          typeof sample.wordCount === 'number' && sample.wordCount < 250,
      ).length,
      weakQueryCoverage: crawled.filter(
        (sample) => sample.queryCoverage?.classification === 'content-gap',
      ).length,
      duplicateTitles: duplicateCount(crawled.map((sample) => sample.title)),
      duplicateMetaDescriptions: duplicateCount(
        crawled.map((sample) => sample.metaDescription),
      ),
      blockedOrFailed: crawled.filter(
        (sample) => sample.warning || sample.fetchDiagnostics?.blocked,
      ).length,
    }
    const inspection = {
      samples: inspected,
      indexed: inspected.filter((sample) =>
        /pass|indexed/i.test(`${sample.verdict} ${sample.coverageState}`),
      ).length,
      notIndexed: inspected.filter(
        (sample) =>
          sample.verdict &&
          !/pass|indexed/i.test(`${sample.verdict} ${sample.coverageState}`),
      ).length,
      warnings: inspected.filter((sample) => sample.warning).length,
    }
    const template: PseoAuditTemplate = {
      ...cluster,
      metrics,
      crawl,
      inspection,
      evidence: buildEvidence({
        cluster,
        metrics,
        crawlSamples: crawled,
        inspectionSamples: inspected,
      }),
      ...classified,
      recommendation: '',
    }
    templates.push({
      ...template,
      recommendation: buildRecommendation({
        template,
        crawlSamplesRequested: Boolean(input.crawlSamples),
        inspectionSamplesRequested: Boolean(input.inspectSamples),
      }),
    })
  }

  templates.sort(
    (a, b) =>
      b.metrics.clicks - a.metrics.clicks ||
      b.metrics.impressions - a.metrics.impressions ||
      b.urlCount - a.urlCount,
  )

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    summary: {
      sitemapUrls: new Set(sitemapUrls).size,
      gscPages: new Set(gscRows.map((row) => row.page)).size,
      templates: templates.length,
      clicks: gscRows.reduce((sum, row) => sum + row.clicks, 0),
      impressions: gscRows.reduce((sum, row) => sum + row.impressions, 0),
      inspectedUrls: templates.reduce(
        (sum, template) => sum + template.inspection.samples.length,
        0,
      ),
      crawledUrls: templates.reduce(
        (sum, template) => sum + template.crawl.samples.length,
        0,
      ),
    },
    templates,
    warnings,
  }
}
