import { shouldExcludeBrandQuery } from '../../brand.js'
import { SeoError } from '../../errors.js'
import type { ResearchImportSource } from '../../providers/domain-contracts.js'
import { combineResearchRows } from '../../providers/imports/research-provider.js'
import type { ImportedResearchRow } from '../../providers/imports/research-rows.js'
import { validatedResearchImportSources } from '../../providers/imports/research-rows.js'
import {
  detectPageTemplate,
  type PageTemplate,
  summarizeTemplates,
} from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import {
  compareCannibalText,
  normalizeCannibalQuery,
} from './cannibal-analysis-primitives.js'
import { cannibalBrandEvidence } from './cannibal-item.js'
import type {
  AnalyzeCannibalImportRowsInput,
  CannibalImportAnalysis,
  CannibalImportItem,
  CannibalImportPage,
  CannibalImportReport,
  CannibalSuppression,
} from './cannibal-types.js'
import { integerOption } from './quick-wins-report-input.js'

const MAX_SUPPRESSIONS = 100

export interface CannibalImportReportInput {
  site: string
  researchFiles: ResearchImportSource[]
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}

export interface CannibalImportDependencies {
  now?: () => Date
}

type SiteScope = {
  domain: string
  pathPrefix: string | null
}

function siteScope(site: string): SiteScope {
  const trimmed = site.trim()
  const withoutScDomain = trimmed.replace(/^sc-domain:/iu, '')
  const hasProtocol = withoutScDomain.includes('://')
  let url: URL
  try {
    url = new URL(hasProtocol ? withoutScDomain : `https://${withoutScDomain}`)
  } catch {
    throw new SeoError(
      'INVALID_INPUT',
      'Use a valid Search Console property or domain for site.',
    )
  }
  const domain = url.hostname
    .toLowerCase()
    .replace(/^www\./u, '')
    .replace(/\.$/u, '')
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !domain.includes('.') ||
    domain.length > 253
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use a valid Search Console property or domain for site.',
    )
  }
  const pathPrefix =
    hasProtocol && url.pathname !== '/'
      ? url.pathname.endsWith('/')
        ? url.pathname
        : `${url.pathname}/`
      : null
  return { domain, pathPrefix }
}

function rowMatchesScope(row: ImportedResearchRow, scope: SiteScope): boolean {
  if (row.domain !== scope.domain && !row.domain.endsWith(`.${scope.domain}`)) {
    return false
  }
  if (!scope.pathPrefix) return true
  try {
    return new URL(row.url).pathname.startsWith(scope.pathPrefix)
  } catch {
    return false
  }
}

function compareGroupRows(
  left: ImportedResearchRow,
  right: ImportedResearchRow,
): number {
  return (
    left.rankAbsolute - right.rankAbsolute ||
    compareCannibalText(left.resultType, right.resultType) ||
    compareCannibalText(left.keyword, right.keyword)
  )
}

function buildPage(
  url: string,
  rows: ImportedResearchRow[],
): CannibalImportPage {
  const ordered = [...rows].sort(compareGroupRows)
  const best = ordered[0]
  const traffic = best?.estimatedMonthlyTraffic
  return {
    url,
    providerBestPosition: best?.rankAbsolute ?? 0,
    providerEstimatedMonthlyTraffic:
      traffic?.state === 'observed' ? traffic.value : null,
    resultTypes: [...new Set(rows.map((row) => row.resultType))].sort(
      compareCannibalText,
    ),
    clicks: null,
    impressions: null,
    ctr: null,
    template: detectPageTemplate(url),
  }
}

function dominantPageTemplate(
  pages: CannibalImportPage[],
): PageTemplate | undefined {
  const counts = new Map<string, { template: PageTemplate; count: number }>()
  for (const page of pages) {
    const existing = counts.get(page.template.id) ?? {
      template: page.template,
      count: 0,
    }
    existing.count += 1
    counts.set(page.template.id, existing)
  }
  const top = [...counts.values()].sort(
    (left, right) => right.count - left.count,
  )[0]
  return top && top.count / pages.length >= 0.8 ? top.template : undefined
}

function providerVolume(rows: ImportedResearchRow[]): number | null {
  let volume: number | null = null
  for (const row of rows) {
    if (row.monthlySearchVolume.state !== 'observed') continue
    if (volume === null || row.monthlySearchVolume.value > volume) {
      volume = row.monthlySearchVolume.value
    }
  }
  return volume
}

function buildItem(input: {
  keyword: string
  pages: CannibalImportPage[]
  providerMonthlySearchVolume: number | null
  provider: ResearchImportSource['provider']
}): CannibalImportItem {
  return {
    keyword: input.keyword,
    pages: input.pages,
    urlCount: input.pages.length,
    providerMonthlySearchVolume: input.providerMonthlySearchVolume,
    finding: 'multiple-ranking-urls',
    requiresIntentReview: true,
    template: dominantPageTemplate(input.pages),
    recommendation: {
      principle: 'C.6',
      evidenceRef: `The ${input.provider} export retained ${input.pages.length} ranking URLs for "${input.keyword}". Positions and volume are provider estimates.`,
      action:
        'Compare the intent and technical state of these URLs. If they satisfy the same intent, choose a preferred page and align internal links, canonicals, and on-page focus. Verify real query exposure with Search Console or a current result snapshot before changing URLs.',
      effort: 'M',
      confidence: 'low',
    },
  }
}

function compareItems(
  left: CannibalImportItem,
  right: CannibalImportItem,
): number {
  return (
    right.urlCount - left.urlCount ||
    (right.providerMonthlySearchVolume ?? -1) -
      (left.providerMonthlySearchVolume ?? -1) ||
    compareCannibalText(left.keyword, right.keyword)
  )
}

export function analyzeCannibalImportRows(
  input: AnalyzeCannibalImportRowsInput,
): CannibalImportAnalysis {
  const limit = integerOption({
    value: input.limit,
    fallback: 25,
    minimum: 1,
    maximum: 100,
    label: 'limit',
  })
  const selection: CannibalImportAnalysis['selection'] = {
    retainedRows: input.rows.length,
    keywordGroups: 0,
    lowActionabilityKeywords: 0,
    brandKeywords: 0,
    singleUrlKeywords: 0,
    suppressedKeywords: 0,
    eligibleKeywords: 0,
    returnedKeywords: 0,
    limitedKeywords: 0,
    returnedSuppressions: 0,
    limitedSuppressions: 0,
  }
  const groups = new Map<
    string,
    { keyword: string; rows: ImportedResearchRow[] }
  >()
  for (const row of input.rows) {
    const key = normalizeCannibalQuery(row.keyword)
    if (!key) continue
    const group = groups.get(key) ?? { keyword: row.keyword, rows: [] }
    if (compareCannibalText(row.keyword, group.keyword) < 0) {
      group.keyword = row.keyword
    }
    group.rows.push(row)
    groups.set(key, group)
  }
  selection.keywordGroups = groups.size

  const items: CannibalImportItem[] = []
  const allSuppressed: CannibalSuppression[] = []
  for (const group of groups.values()) {
    const urls = new Map<string, ImportedResearchRow[]>()
    for (const row of group.rows) {
      const rows = urls.get(row.url) ?? []
      rows.push(row)
      urls.set(row.url, rows)
    }
    if (isLowActionabilityQuery(group.keyword)) {
      selection.lowActionabilityKeywords++
      continue
    }
    if (
      shouldExcludeBrandQuery({
        query: group.keyword,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandKeywords++
      if (urls.size >= 2) {
        allSuppressed.push({
          query: group.keyword,
          reason: 'brand_query',
          urlCount: urls.size,
          evidenceRef: cannibalBrandEvidence(group.keyword),
        })
      }
      continue
    }
    if (urls.size < 2) {
      selection.singleUrlKeywords++
      continue
    }
    const pages = [...urls.entries()]
      .map(([url, rows]) => buildPage(url, rows))
      .sort(
        (left, right) =>
          left.providerBestPosition - right.providerBestPosition ||
          compareCannibalText(left.url, right.url),
      )
    items.push(
      buildItem({
        keyword: group.keyword,
        pages,
        providerMonthlySearchVolume: providerVolume(group.rows),
        provider: input.provider,
      }),
    )
  }

  const eligibleItems = items.sort(compareItems)
  const returnedItems = eligibleItems.slice(0, limit)
  const orderedSuppressions = allSuppressed.sort(
    (left, right) =>
      compareCannibalText(left.query, right.query) ||
      compareCannibalText(left.reason, right.reason),
  )
  const suppressed = orderedSuppressions.slice(0, MAX_SUPPRESSIONS)
  selection.suppressedKeywords = allSuppressed.length
  selection.eligibleKeywords = eligibleItems.length
  selection.returnedKeywords = returnedItems.length
  selection.limitedKeywords = eligibleItems.length - returnedItems.length
  selection.returnedSuppressions = suppressed.length
  selection.limitedSuppressions = allSuppressed.length - suppressed.length

  return {
    filters: {
      limit,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    selection,
    items: returnedItems,
    suppressed,
    suppressionSummary: allSuppressed.reduce<Record<string, number>>(
      (summary, item) => {
        summary[item.reason] = (summary[item.reason] ?? 0) + 1
        return summary
      },
      {},
    ),
    templates: summarizeTemplates(returnedItems.flatMap((item) => item.pages)),
  }
}

function importVerdict(input: {
  dataStatus: CannibalImportReport['dataStatus']
  provider: ResearchImportSource['provider']
  siteDomain: string
  retainedRows: number
  eligible: number
  returned: number
  partialEvidence: boolean
}): string {
  if (input.dataStatus === 'empty') {
    return 'The research files contained no retained ranked-keyword rows.'
  }
  if (input.retainedRows === 0) {
    return `No imported rows ranked ${input.siteDomain}. Check that the export covers this site before reading anything into the result.`
  }
  if (!input.eligible) {
    const base = `No keyword kept two or more of the site's ranking URLs in the retained imported rows.`
    return input.partialEvidence
      ? `${base} Partial import evidence prevents an all-clear.`
      : base
  }
  const result = `${input.returned} of ${input.eligible} multi-URL keyword candidate${input.eligible === 1 ? '' : 's'} from the ${input.provider} export returned for intent and technical review.`
  return input.partialEvidence
    ? `${result} The import evidence is partial.`
    : result
}

export async function cannibalImportReport(
  input: CannibalImportReportInput,
  dependencies: CannibalImportDependencies = {},
): Promise<CannibalImportReport> {
  const now = (dependencies.now ?? (() => new Date()))()
  const validated = validatedResearchImportSources({
    sources: input.researchFiles,
  })
  const scope = siteScope(input.site)
  const combined = await combineResearchRows(validated.sources, now)
  const retained = combined.rows.filter((row) => rowMatchesScope(row, scope))
  const analysis = analyzeCannibalImportRows({
    site: input.site,
    provider: validated.provider,
    rows: retained,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const capped = combined.imports.some((item) => item.capped)
  const invalidRows = combined.imports.reduce(
    (total, item) => total + item.invalidRows,
    0,
  )
  const filteredRows = combined.imports.reduce(
    (total, item) => total + item.filteredRows,
    0,
  )
  const partialEvidence = capped || invalidRows > 0
  const completeness: CannibalImportReport['source']['completeness'] = capped
    ? 'capped'
    : invalidRows > 0
      ? 'partial'
      : filteredRows > 0
        ? 'filtered'
        : 'unknown'
  const dataStatus: CannibalImportReport['dataStatus'] =
    combined.rows.length === 0
      ? 'empty'
      : !partialEvidence && analysis.selection.eligibleKeywords === 0
        ? 'filtered'
        : 'partial'
  const offPropertyRows = combined.rows.length - retained.length
  const fileCount = validated.sources.length

  return {
    schemaVersion: 1,
    dataSource: 'research-import',
    site: input.site,
    siteDomain: scope.domain,
    generatedAt: now.toISOString(),
    dataStatus,
    source: {
      provider: validated.provider,
      evidenceType: 'ranked-keyword-import',
      files: fileCount,
      completeness,
    },
    methodology: {
      id: 'import_url_overlap_v1',
      version: 1,
      matching: 'normalized_exact_keyword',
      finding: 'multiple-ranking-urls',
      requiresIntentReview: true,
    },
    filters: analysis.filters,
    selection: {
      importedRows: combined.rows.length,
      offPropertyRows,
      ...analysis.selection,
    },
    summary: {
      eligibleKeywords: analysis.selection.eligibleKeywords,
      returnedKeywords: analysis.selection.returnedKeywords,
      suppressedKeywords: analysis.selection.suppressedKeywords,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: importVerdict({
        dataStatus,
        provider: validated.provider,
        siteDomain: scope.domain,
        retainedRows: retained.length,
        eligible: analysis.selection.eligibleKeywords,
        returned: analysis.selection.returnedKeywords,
        partialEvidence,
      }),
    },
    templates: analysis.templates,
    suppressed: analysis.suppressed,
    suppressionSummary: analysis.suppressionSummary,
    items: analysis.items,
    evidence: {
      imports: combined.imports,
      warnings: combined.warnings,
    },
    caveats: [
      `Rows come from ${fileCount} local ${validated.provider} ranked-keyword export${fileCount === 1 ? '' : 's'}. Positions, volumes, and traffic are provider estimates, not Search Console observations.`,
      'A keyword with two or more ranking URLs in the export is a review candidate. The export cannot prove that the URLs compete, satisfy the same intent, or split real traffic.',
      'The files do not prove full provider coverage, so a missing keyword or URL is not a definitive zero.',
      'Search Console clicks and impressions are unavailable from imports, so no impression filters were applied and click evidence is absent.',
      'Check evidence.imports for each export time, file hash, included fields, rejected rows, and cap before interpreting missing rows.',
      ...(offPropertyRows > 0
        ? [
            `${offPropertyRows} imported row${offPropertyRows === 1 ? '' : 's'} ranked other sites and ${offPropertyRows === 1 ? 'was' : 'were'} excluded from this analysis.`,
          ]
        : []),
    ],
    recommendations: analysis.items.length
      ? [
          'Review the highest-volume candidates first. Confirm whether the URLs serve the same intent and inspect technical state before changing canonicals, redirects, or content.',
          'Run this report against Search Console for the same site to confirm real query exposure before consolidating URLs.',
        ]
      : partialEvidence
        ? [
            'No multi-URL action is recommended from the retained imported rows. Inspect or re-export the provider data before treating this result as an all-clear.',
          ]
        : [
            'No multi-URL action is recommended from the retained imported rows.',
          ],
  }
}
