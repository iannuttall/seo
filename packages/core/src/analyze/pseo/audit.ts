import { shouldExcludeBrandQuery } from '../../brand.js'
import { extractPage } from '../../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../../fetch/page-fetcher.js'
import { inspectUrl } from '../../gsc/client/inspection.js'
import type { UrlInspectionResult } from '../../gsc/client/types.js'
import { countLabel } from '../../phrasing.js'
import type { ProgressReporter } from '../../progress.js'
import type { PageFetchDiagnostics } from '../../types.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import { fetchSiteQueryPageRows } from '../shared.js'
import {
  canonicalPseoTerm,
  normalizePseoText,
  type PseoQueryPattern,
  pseoQueryPatterns,
  pseoQueryTerms,
  pseoQueryThemeTerms,
} from './query-insights.js'
import {
  clusterPseoTemplates,
  type PseoTemplateCluster,
  parsePseoPath,
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
  entityFit: PseoEntityFit
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

type PseoEntityFit = {
  checkedQueries: number
  matchedQueries: number
  impressionShare: number
  weakExamples: Array<{
    url: string
    query: string
    pathTerms: string[]
    impressions: number
  }>
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
  caveats: string[]
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

function termCoverage(
  query: string,
  text?: string,
): {
  coverage: number
  missingTerms: string[]
} {
  const terms = pseoQueryTerms(query)
  if (!terms.length) return { coverage: 1, missingTerms: [] }
  const normalizedText = normalizePseoText(text ?? '')
  const textTerms = normalizedText.split(' ').map(canonicalPseoTerm)
  const matched = terms.filter((term) =>
    textTerms.some(
      (token) =>
        token === canonicalPseoTerm(term) ||
        token.startsWith(canonicalPseoTerm(term)),
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

function readablePatternLabel(label: string): string {
  if (label.startsWith('theme: ')) {
    return `${label.slice('theme: '.length)}-related demand`
  }
  if (label === 'general') return 'broad demand'
  return `${label} demand`
}

function pathVariableTerms(
  url: string,
  cluster: PseoTemplateCluster,
): string[] {
  const parts = parsePseoPath(url)
  const terms = cluster.shape.variableSegments.flatMap((segment) => {
    const value = parts[segment.index]
    return value ? pseoQueryThemeTerms(value) : []
  })
  return [...new Set(terms.map(canonicalPseoTerm))]
}

function queryMatchesPathTerms(query: string, pathTerms: string[]): boolean {
  if (!pathTerms.length) return false
  const queryTermSet = new Set(pseoQueryTerms(query).map(canonicalPseoTerm))
  return pathTerms.some((term) => queryTermSet.has(term))
}

function entityFitForRows(
  rows: Array<{
    query: string
    page: string
    impressions: number
  }>,
  cluster: PseoTemplateCluster,
): PseoEntityFit {
  let checkedQueries = 0
  let matchedQueries = 0
  let checkedImpressions = 0
  let matchedImpressions = 0
  const weakExamples: PseoEntityFit['weakExamples'] = []

  for (const row of rows) {
    const pathTerms = pathVariableTerms(row.page, cluster)
    if (!pathTerms.length) continue

    checkedQueries += 1
    checkedImpressions += row.impressions
    if (queryMatchesPathTerms(row.query, pathTerms)) {
      matchedQueries += 1
      matchedImpressions += row.impressions
      continue
    }

    weakExamples.push({
      url: row.page,
      query: row.query,
      pathTerms: pathTerms.slice(0, 6),
      impressions: row.impressions,
    })
  }

  return {
    checkedQueries,
    matchedQueries,
    impressionShare: checkedImpressions
      ? matchedImpressions / checkedImpressions
      : 0,
    weakExamples: weakExamples
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5),
  }
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
  cluster: PseoTemplateCluster,
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
    impressionsPerUrl: cluster.urlCount ? impressions / cluster.urlCount : 0,
    clicksPerUrl: cluster.urlCount ? clicks / cluster.urlCount : 0,
    queryCount: byQuery.size,
    pageCountWithGsc: new Set(rows.map((row) => row.page)).size,
    zeroClickImpressions: rows
      .filter((row) => row.clicks === 0)
      .reduce((sum, row) => sum + row.impressions, 0),
    entityFit: entityFitForRows(rows, cluster),
    queryPatterns: pseoQueryPatterns(rows),
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
    ? readablePatternLabel(topPattern.label)
    : 'known query demand'
  if (template.verdict === 'index-risk') {
    return `${template.signature} has indexing risk. Check URL Inspection, canonicals, robots/noindex, redirects, and sitemap inclusion before rewriting any generated copy.`
  }
  if (template.verdict === 'crawl-risk') {
    return `${template.signature} was blocked, slow, or failed during sampling. Fix fetch/render reliability first; content recommendations are not trustworthy until these pages can be crawled.`
  }
  if (template.verdict === 'content-risk') {
    const weakCoverage = template.crawl.weakQueryCoverage
      ? `${countLabel(template.crawl.weakQueryCoverage, 'sampled URL')} weakly cover their top query`
      : `median content is ${template.crawl.medianWordCount ?? '?'} words`
    return `${template.signature} looks thin or weak for the queries it ranks for. ${weakCoverage}. Add page-specific facts, make the heading match the real query angle, and ensure title/meta are generated uniquely per URL.`
  }
  if (template.verdict === 'opportunity') {
    const examples = topPattern?.examples.slice(0, 2).join('; ')
    if (
      template.metrics.entityFit.checkedQueries >= 5 &&
      template.metrics.entityFit.impressionShare < 0.5
    ) {
      const weak = template.metrics.entityFit.weakExamples[0]
      return `Many impressions for ${template.signature} come from broad queries that do not name the page's specific entity or location. Make titles, H1s, intros, and internal links clearer about the exact page target${weak ? `; start by checking "${weak.query}" against path terms ${weak.pathTerms.join(', ')}` : ''}. If the broad query should rank, build or strengthen a better hub page for it.`
    }
    return `${template.signature} already has ${patternLabel}${examples ? ` (${examples})` : ''}. Improve the template by testing clearer title/H1/meta wording, adding internal links from related pages, and filling any repeated query angles that the page body does not answer.`
  }
  if (!input.crawlSamplesRequested || !input.inspectionSamplesRequested) {
    return `GSC does not show a clear issue for this template. Run again with --crawl-samples and --inspect-samples before deciding it is healthy.`
  }
  return `No material issue found for this template. Keep monitoring it and spend time on higher-impact templates first.`
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
      `${Math.round(input.metrics.impressions).toLocaleString('en-GB')} impressions across ${countLabel(input.metrics.pageCountWithGsc, 'GSC page')}`,
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
      `top demand pattern: ${readablePatternLabel(topPattern.label)} (${Math.round(topPattern.impressions).toLocaleString('en-GB')} impressions)`,
    )
  }
  if (input.metrics.entityFit.checkedQueries >= 3) {
    evidence.push(
      `${Math.round(input.metrics.entityFit.impressionShare * 100)}% of checked query impressions matched path variable terms`,
    )
  }
  const inspected = input.inspectionSamples.filter((sample) => !sample.warning)
  if (inspected.length) {
    const indexed = inspected.filter((sample) =>
      /pass|indexed/i.test(`${sample.verdict} ${sample.coverageState}`),
    ).length
    evidence.push(
      `${indexed}/${inspected.length} inspected ${inspected.length === 1 ? 'URL is' : 'URLs are'} indexed`,
    )
  }
  const weakCoverage = input.crawlSamples.filter(
    (sample) => sample.queryCoverage?.classification === 'content-gap',
  ).length
  if (weakCoverage) {
    evidence.push(
      `${countLabel(weakCoverage, 'sampled URL')} weakly cover top query`,
    )
  }
  const failedCrawls = input.crawlSamples.filter(
    (sample) => sample.warning || sample.fetchDiagnostics?.blocked,
  ).length
  if (failedCrawls) {
    evidence.push(
      `${countLabel(failedCrawls, 'sampled URL')} blocked or failed to fetch`,
    )
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
  if (
    input.metrics.entityFit.checkedQueries >= 10 &&
    input.metrics.entityFit.impressionShare < 0.35 &&
    input.metrics.impressions > 100
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
  progress?: ProgressReporter
}): Promise<PseoAuditReport> {
  const days = input.days ?? 28
  const warnings: string[] = []
  input.progress?.('Fetching sitemap URLs')
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

  input.progress?.(`Fetching ${days} days of GSC query/page rows`)
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
  input.progress?.(`Clustering ${allUrls.length} URLs into pSEO templates`)
  const clusters = clusterPseoTemplates(allUrls, {
    limit: input.templateLimit ?? 25,
  })
  input.progress?.(`Found ${countLabel(clusters.length, 'template group')}`)
  const rowsByTemplate = new Map<string, typeof gscRows>()
  for (const row of gscRows) {
    const signature = templateForUrl(row.page, clusters)
    const existing = rowsByTemplate.get(signature) ?? []
    existing.push(row)
    rowsByTemplate.set(signature, existing)
  }

  const templates: PseoAuditTemplate[] = []
  for (const [index, cluster] of clusters.entries()) {
    input.progress?.(
      `Auditing template ${index + 1}/${clusters.length}: ${cluster.signature}`,
    )
    const directRows = rowsByTemplate.get(cluster.signature) ?? []
    const broadRows = directRows.length
      ? directRows
      : gscRows.filter((row) => cluster.sampleUrls.includes(row.page))
    const metrics = metricsForRows(broadRows, cluster)
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
    if (crawled.length) {
      input.progress?.(
        `Fetched ${countLabel(crawled.length, 'sample URL')} for ${cluster.signature}`,
      )
    }
    const inspected =
      input.inspectSamples && input.inspectSamples > 0
        ? await inspectSamples({
            site: input.site,
            urls: cluster.sampleUrls,
            limit: input.inspectSamples,
          })
        : []
    if (inspected.length) {
      input.progress?.(
        `Inspected ${countLabel(inspected.length, 'sample URL')} for ${cluster.signature}`,
      )
    }
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
  input.progress?.('Scoring pSEO templates')

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
    caveats: [
      `GSC window: last ${countLabel(days, 'day')}.`,
      `Brand queries: ${
        input.includeBrand
          ? 'included'
          : input.brandTerms?.length
            ? 'excluded where saved brand terms matched'
            : 'no saved brand terms, so no brand filter was applied'
      }.`,
      `Data freshness: ${input.refresh ? 'fresh fetch requested; local cache bypassed where supported' : 'local cache allowed; rerun with --refresh to bypass cached GSC/HTTP data'}.`,
      `Crawl samples: ${countLabel(input.crawlSamples ?? 0, 'URL')} per detected template.`,
      `URL Inspection samples: ${countLabel(input.inspectSamples ?? 0, 'URL')} per detected template.`,
      input.sitemaps?.length
        ? `Sitemaps: ${countLabel(input.sitemaps.length, 'sitemap URL')} provided.`
        : 'Sitemaps: none provided; template discovery used GSC page rows only.',
    ],
    templates,
    warnings,
  }
}
