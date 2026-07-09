import { deriveBrandTerms, shouldExcludeBrandQuery } from '../../brand.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import {
  assessPseoTemplate,
  pseoTemplateEvidence,
  pseoTemplateRecommendation,
  selectedPseoSampleUrls,
  summarizePseoCrawl,
  summarizePseoInspection,
} from './assessment.js'
import {
  aggregatePseoPageRows,
  aggregatePseoQueryPageRows,
  comparePseoText,
  pseoMetricsForRows,
  validPseoHttpUrl,
  validPseoPageRow,
  validPseoQueryPageRow,
} from './row-analysis.js'
import { clusterPseoTemplates, templateForUrl } from './templates.js'
import type {
  PseoAuditReport,
  PseoAuditTemplate,
  PseoCrawlSample,
  PseoInspectionSample,
  PseoPageRow,
  PseoQueryPageRow,
} from './types.js'

export { pseoIndexStatus } from './assessment.js'
export { pseoQueryCoverage } from './row-analysis.js'

const SAMPLE_SELECTION = 'page-demand-stratified-url-v1' as const
const TEMPLATE_ORDER = 'page-impressions-clicks-url-count-signature-v1' as const

export type PseoDatasetInput = {
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  days: number
  queryPageRows: PseoQueryPageRow[]
  pageRows: PseoPageRow[]
  sitemapUrls?: string[]
  crawlSamples?: PseoCrawlSample[]
  inspectionSamples?: PseoInspectionSample[]
  templateLimit: number
  minimumTemplateUrls: number
  minimumTemplateShare: number
  minimumTemplateImpressions: number
  crawlSamplesPerTemplate: number
  inspectionSamplesPerTemplate: number
  maxRowsPerRequest: number
  pageRowsFetched: number
  queryPageRowsFetched: number
  sitemapsRequested: number
  maxUrlsPerSitemap: number
  brandTerms?: string[]
  includeBrand?: boolean
  warnings?: string[]
  caveats?: string[]
}

function retainedQueryRows(input: PseoDatasetInput) {
  const invalid = input.queryPageRows.filter(
    (row) => !validPseoQueryPageRow(row),
  ).length
  const valid = input.queryPageRows.filter(validPseoQueryPageRow)
  const lowActionability = valid.filter((row) =>
    isLowActionabilityQuery(row.query),
  ).length
  const actionable = valid.filter((row) => !isLowActionabilityQuery(row.query))
  const classified = actionable.map((row) => ({
    row,
    isBrand: shouldExcludeBrandQuery({
      query: row.query,
      siteUrl: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    }),
  }))
  return {
    rows: aggregatePseoQueryPageRows(
      classified.filter((item) => !item.isBrand).map((item) => item.row),
    ),
    invalid,
    lowActionability,
    brand: classified.filter((item) => item.isBrand).length,
  }
}

function groupRowsByTemplate<T extends { page: string }>(
  rows: T[],
  clusters: ReturnType<typeof clusterPseoTemplates>,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const signature = templateForUrl(row.page, clusters)
    grouped.set(signature, [...(grouped.get(signature) ?? []), row])
  }
  return grouped
}

function buildTemplates(input: {
  dataset: PseoDatasetInput
  allUrls: string[]
  pageRows: PseoPageRow[]
  queryRows: PseoQueryPageRow[]
}): { templates: PseoAuditTemplate[]; eligibleTemplates: number } {
  const clusters = clusterPseoTemplates(input.allUrls, {
    minUrls: input.dataset.minimumTemplateUrls,
    minShare: input.dataset.minimumTemplateShare,
    limit: Math.max(1, input.allUrls.length),
    sampleSize: 0,
  })
  const urlsByTemplate = new Map<string, string[]>()
  for (const url of input.allUrls) {
    const signature = templateForUrl(url, clusters)
    urlsByTemplate.set(signature, [
      ...(urlsByTemplate.get(signature) ?? []),
      url,
    ])
  }
  const pageRowsByTemplate = groupRowsByTemplate(input.pageRows, clusters)
  const queryRowsByTemplate = groupRowsByTemplate(input.queryRows, clusters)
  const ranked = clusters
    .map((cluster) => {
      const pageRows = pageRowsByTemplate.get(cluster.signature) ?? []
      const queryRows = queryRowsByTemplate.get(cluster.signature) ?? []
      return {
        cluster,
        urls: urlsByTemplate.get(cluster.signature) ?? [],
        pageRows,
        metrics: pseoMetricsForRows({ pageRows, queryRows, cluster }),
      }
    })
    .filter(
      (item) =>
        item.metrics.impressions >= input.dataset.minimumTemplateImpressions,
    )
    .sort(
      (left, right) =>
        right.metrics.impressions - left.metrics.impressions ||
        right.metrics.clicks - left.metrics.clicks ||
        right.cluster.urlCount - left.cluster.urlCount ||
        comparePseoText(left.cluster.signature, right.cluster.signature),
    )
  const crawlsByUrl = new Map(
    (input.dataset.crawlSamples ?? []).map((sample) => [sample.url, sample]),
  )
  const inspectionsByUrl = new Map(
    (input.dataset.inspectionSamples ?? []).map((sample) => [
      sample.url,
      sample,
    ]),
  )
  const templates = ranked
    .slice(0, input.dataset.templateLimit)
    .map((item): PseoAuditTemplate => {
      const sampleLimit = Math.max(
        input.dataset.crawlSamplesPerTemplate,
        input.dataset.inspectionSamplesPerTemplate,
      )
      const sampleUrls = selectedPseoSampleUrls(
        item.urls,
        item.pageRows,
        sampleLimit,
      )
      const crawl = summarizePseoCrawl(
        sampleUrls
          .slice(0, input.dataset.crawlSamplesPerTemplate)
          .map((url) => crawlsByUrl.get(url))
          .filter((sample): sample is PseoCrawlSample => Boolean(sample)),
        input.dataset.crawlSamplesPerTemplate,
      )
      const inspection = summarizePseoInspection(
        sampleUrls
          .slice(0, input.dataset.inspectionSamplesPerTemplate)
          .map((url) => inspectionsByUrl.get(url))
          .filter((sample): sample is PseoInspectionSample => Boolean(sample)),
        input.dataset.inspectionSamplesPerTemplate,
      )
      const base: PseoAuditTemplate = {
        ...item.cluster,
        sampleUrls,
        population: {
          discoveredUrls: item.cluster.urlCount,
          gscVisibleUrls: item.pageRows.length,
          untestedUrls: Math.max(
            0,
            item.cluster.urlCount -
              Math.max(crawl.attempted, inspection.attempted),
          ),
          sampleSelection: SAMPLE_SELECTION,
        },
        metrics: item.metrics,
        crawl,
        inspection,
        evidence: [],
        verdict: 'inconclusive',
        confidence: 'low',
        recommendation: '',
      }
      const assessed = { ...base, ...assessPseoTemplate(base) }
      return {
        ...assessed,
        evidence: pseoTemplateEvidence(assessed),
        recommendation: pseoTemplateRecommendation(assessed),
      }
    })
  return { templates, eligibleTemplates: ranked.length }
}

export function buildPseoAuditReportFromRows(
  input: PseoDatasetInput,
): PseoAuditReport {
  const querySelection = retainedQueryRows(input)
  const invalidPageRows = input.pageRows.filter(
    (row) => !validPseoPageRow(row),
  ).length
  const pageRows = aggregatePseoPageRows(
    input.pageRows.filter(validPseoPageRow),
  )
  const sitemapUrls = [...new Set(input.sitemapUrls ?? [])]
    .filter(validPseoHttpUrl)
    .sort(comparePseoText)
  const allUrls = [
    ...new Set([
      ...sitemapUrls,
      ...pageRows.map((row) => row.page),
      ...querySelection.rows.map((row) => row.page),
    ]),
  ].sort(comparePseoText)
  const { templates, eligibleTemplates } = buildTemplates({
    dataset: input,
    allUrls,
    pageRows,
    queryRows: querySelection.rows,
  })
  const warnings = [...new Set(input.warnings ?? [])]
  const pageRowsPossiblyTruncated =
    input.pageRowsFetched >= input.maxRowsPerRequest
  const queryPageRowsPossiblyTruncated =
    input.queryPageRowsFetched >= input.maxRowsPerRequest
  const crawlAttempts = templates.reduce(
    (sum, template) => sum + template.crawl.attempted,
    0,
  )
  const crawledUrls = templates.reduce(
    (sum, template) => sum + template.crawl.usable,
    0,
  )
  const inspectionAttempts = templates.reduce(
    (sum, template) => sum + template.inspection.attempted,
    0,
  )
  const inspectedUrls = templates.reduce(
    (sum, template) => sum + template.inspection.succeeded,
    0,
  )
  const hasInput =
    input.queryPageRows.length > 0 ||
    input.pageRows.length > 0 ||
    sitemapUrls.length > 0
  const hasPartialEvidence =
    pageRowsPossiblyTruncated ||
    queryPageRowsPossiblyTruncated ||
    querySelection.invalid > 0 ||
    invalidPageRows > 0 ||
    warnings.length > 0 ||
    crawlAttempts > crawledUrls ||
    inspectionAttempts > inspectedUrls
  const dataStatus: PseoAuditReport['dataStatus'] = !hasInput
    ? 'empty'
    : !allUrls.length
      ? 'filtered'
      : hasPartialEvidence
        ? 'partial'
        : 'complete'
  const brandTerms = input.brandTerms?.length
    ? input.brandTerms
    : deriveBrandTerms({ siteUrl: input.site })
  return {
    schemaVersion: 1,
    methodology: 'pseo-audit-v2',
    site: input.site,
    generatedAt: input.generatedAt,
    rangeDays: input.days,
    range: input.range,
    dataStatus,
    source: {
      searchAnalytics: {
        pageRows: input.pageRowsFetched,
        queryPageRows: input.queryPageRowsFetched,
        maxRowsPerRequest: input.maxRowsPerRequest,
        pageRowsPossiblyTruncated,
        queryPageRowsPossiblyTruncated,
        dimensions: { page: ['page'], queryPage: ['query', 'page'] },
        searchType: 'web',
        dataState: 'final',
        aggregation: 'auto',
      },
      sitemaps: {
        requested: input.sitemapsRequested,
        discoveredUrls: sitemapUrls.length,
        maxUrlsPerSitemap: input.maxUrlsPerSitemap,
      },
    },
    selection: {
      inputQueryPageRows: input.queryPageRows.length,
      invalidQueryPageRows: querySelection.invalid,
      lowActionabilityRows: querySelection.lowActionability,
      brandRows: querySelection.brand,
      retainedQueryPageRows: querySelection.rows.length,
      inputPageRows: input.pageRows.length,
      invalidPageRows,
      retainedPageRows: pageRows.length,
      discoveredUrls: allUrls.length,
      eligibleTemplates,
      returnedTemplates: templates.length,
      templateLimit: input.templateLimit,
      minimumTemplateUrls: input.minimumTemplateUrls,
      minimumTemplateShare: input.minimumTemplateShare,
      minimumTemplateImpressions: input.minimumTemplateImpressions,
      templateOrder: TEMPLATE_ORDER,
    },
    summary: {
      sitemapUrls: sitemapUrls.length,
      gscPages: pageRows.length,
      templates: templates.length,
      clicks: pageRows.reduce((sum, row) => sum + row.clicks, 0),
      impressions: pageRows.reduce((sum, row) => sum + row.impressions, 0),
      crawlAttempts,
      crawledUrls,
      crawlFailures: crawlAttempts - crawledUrls,
      inspectionAttempts,
      inspectedUrls,
      inspectionFailures: inspectionAttempts - inspectedUrls,
    },
    caveats: [
      ...(input.caveats ?? []),
      `Search Analytics range: ${input.range.startDate} through ${input.range.endDate}, using finalized web data.`,
      'Clicks, impressions, CTR, and position use retained page-dimension rows; Search Console does not guarantee every row or complete totals.',
      'Query patterns and examples use retained query/page rows, which omit anonymized and lower-ranked data.',
      `Brand queries: ${input.includeBrand ? 'included' : `excluded using ${brandTerms.join(', ') || 'no terms'}`}.`,
      `Template detection requires at least ${input.minimumTemplateUrls} URLs and ${(input.minimumTemplateShare * 100).toFixed(2)}% of discovered URLs.`,
      `Samples use ${SAMPLE_SELECTION}; observations apply to sampled URLs, not every URL in a template.`,
      "URL Inspection reports Google's indexed snapshot for a specific URL; an exact PASS verdict does not guarantee current search appearance.",
      'Word counts are descriptive only. This report has no preferred or minimum word-count rule.',
      'Literal term coverage and path entity fit are review heuristics, not Google ranking factors or scaled-content policy verdicts.',
    ],
    templates,
    warnings,
  }
}

export function pseoSampleUrls(report: PseoAuditReport): {
  crawl: string[]
  inspection: string[]
} {
  return {
    crawl: report.templates.flatMap((template) =>
      template.sampleUrls.slice(0, template.crawl.requested),
    ),
    inspection: report.templates.flatMap((template) =>
      template.sampleUrls.slice(0, template.inspection.requested),
    ),
  }
}
