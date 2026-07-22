import { SeoError } from '../../errors.js'
import type {
  ProviderCapability,
  ProviderCapabilitySupport,
  ProviderEvidence,
  ProviderImportEvidence,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import type {
  OrganicFootprint,
  RankedKeyword,
  RankedKeywordPage,
  RankedKeywordsProvider,
  RankedKeywordsRequest,
  RankingDistribution,
  RankingPage,
  RankingPagePage,
  RankingPagesProvider,
  RankingPagesRequest,
  ResearchImportSource,
  SerpCompetitor,
  SerpCompetitorSet,
  SerpCompetitorsProvider,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import {
  compareImportedResearchRows,
  type ImportedResearchRow,
  importedResearchRowKey,
  importResearchRows,
} from './research-rows.js'

type CombinedResearchRows = {
  rows: ImportedResearchRow[]
  imports: ProviderImportEvidence[]
  warnings: ProviderWarning[]
}

const CAPABILITIES = [
  'ranked-keywords',
  'relevant-pages',
  'serp-competitors',
] as const satisfies readonly ProviderCapability[]

const capabilitySupport: readonly ProviderCapabilitySupport[] =
  CAPABILITIES.map((capability) => ({
    capability,
    status: 'available',
    markets: [
      {
        searchEngines: ['google'],
        location: 'country-only',
      },
    ],
  }))

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

function domain(value: string): string {
  const raw = value
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/u, '')
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
      .replace(/^www\./u, '')
      .replace(/\.$/u, '')
  } catch {
    throw new SeoError('INVALID_INPUT', 'Use a valid research target.')
  }
}

function absoluteUrl(value: string): string | null {
  if (!value.includes('://')) return null
  try {
    const result = new URL(value)
    if (!['http:', 'https:'].includes(result.protocol)) return null
    result.hash = ''
    return result.toString()
  } catch {
    return null
  }
}

function matchesTarget(
  row: ImportedResearchRow,
  target: string,
  includeSubdomains = true,
): boolean {
  const url = absoluteUrl(target)
  if (url && new URL(url).pathname !== '/') return row.url === url
  const targetDomain = domain(target)
  return (
    row.domain === targetDomain ||
    (includeSubdomains && row.domain.endsWith(`.${targetDomain}`))
  )
}

function missing<T>(reason: string): ProviderValue<T> {
  return { state: 'missing', value: null, reason }
}

function observed<T>(value: T): ProviderValue<T> {
  return { state: 'observed', value }
}

function aggregateNumber(
  values: ProviderValue<number>[],
  label: string,
): ProviderValue<number> {
  if (values.length === 0) return observed(0)
  if (!values.every((value) => value.state === 'observed')) {
    return missing(
      `The import cannot calculate ${label} because some rows omit it.`,
    )
  }
  return observed(
    values.reduce(
      (total, value) => total + (value.state === 'observed' ? value.value : 0),
      0,
    ),
  )
}

function distribution(rows: ImportedResearchRow[]): RankingDistribution {
  const ranks = rows.map((row) => row.rankAbsolute)
  return {
    first: ranks.filter((rank) => rank === 1).length,
    top3: ranks.filter((rank) => rank <= 3).length,
    top10: ranks.filter((rank) => rank <= 10).length,
    top20: ranks.filter((rank) => rank <= 20).length,
    top50: ranks.filter((rank) => rank <= 50).length,
    top100: ranks.filter((rank) => rank <= 100).length,
  }
}

function footprint(rows: ImportedResearchRow[]): OrganicFootprint {
  return {
    estimatedMonthlyTraffic: aggregateNumber(
      rows.map((row) => row.estimatedMonthlyTraffic),
      'estimated monthly traffic',
    ),
    rankedKeywords: observed(
      new Set(rows.map((row) => normalizedKeyword(row.keyword))).size,
    ),
    estimatedMonthlyTrafficCostUsd: missing(
      'The ranked-keyword import does not include a typed traffic-cost total.',
    ),
    rankings: observed(distribution(rows)),
    newRankings: missing(
      'The ranked-keyword import does not include comparable movement history.',
    ),
    improvedRankings: missing(
      'The ranked-keyword import does not include comparable movement history.',
    ),
    declinedRankings: missing(
      'The ranked-keyword import does not include comparable movement history.',
    ),
    lostRankings: missing(
      'The ranked-keyword import does not include comparable movement history.',
    ),
  }
}

function completeness(input: {
  imported: CombinedResearchRows
  returnedRows: number
  retainedRows: number
}): 'partial' | 'capped' | 'filtered' | 'unknown' {
  if (input.imported.imports.some((item) => item.capped)) return 'capped'
  if (input.imported.imports.some((item) => item.invalidRows > 0))
    return 'partial'
  if (input.retainedRows < input.returnedRows) return 'filtered'
  return 'unknown'
}

function evidence<T>(input: {
  imported: CombinedResearchRows
  provider: ResearchImportSource['provider']
  capability: (typeof CAPABILITIES)[number]
  market: SearchMarket
  data: T
  requestedRows: number
  returnedRows: number
  retainedRows: number
  filters: Record<string, string | number | boolean>
  sort: string[]
}): ProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: input.provider,
    capability: input.capability,
    market: input.market,
    data: input.data,
    observedAt:
      input.imported.imports
        .map((item) => item.exportedAt)
        .sort(compareText)
        .at(-1) ?? new Date(0).toISOString(),
    coverage: {
      requestedRows: input.requestedRows,
      returnedRows: input.returnedRows,
      retainedRows: input.retainedRows,
      invalidRows: input.imported.imports.reduce(
        (total, item) => total + item.invalidRows,
        0,
      ),
      providerTotalRows: null,
      completeness: completeness(input),
      nextCursor: null,
    },
    cache: {
      status: 'bypass',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: 0,
      actualMicros: 0,
      taskIds: [],
    },
    request: {
      operation: 'ranked-keyword-import',
      endpoint: 'local-file',
      limit: input.requestedRows,
      filters: input.filters,
      sort: input.sort,
    },
    imports: input.imported.imports,
    warnings: [
      ...input.imported.warnings,
      {
        code: 'import-coverage-unknown',
        message:
          'The file does not prove that the provider export covered its full database. Missing rows are not definitive zeros.',
      },
    ],
  }
}

function rankedRowOrder(left: RankedKeyword, right: RankedKeyword): number {
  return (
    left.rankAbsolute - right.rankAbsolute ||
    compareText(left.keyword, right.keyword) ||
    compareText(left.url, right.url)
  )
}

function page<T>(rows: T[], limit: number, offset = 0): T[] {
  return rows.slice(offset, offset + limit)
}

export class ResearchImportProvider
  implements
    RankedKeywordsProvider,
    RankingPagesProvider,
    SerpCompetitorsProvider
{
  readonly provider: ResearchImportSource['provider']
  readonly capabilitySupport = capabilitySupport
  readonly #sources: readonly ResearchImportSource[]
  readonly #now: Date
  #imported?: Promise<CombinedResearchRows>

  constructor(sources: readonly ResearchImportSource[], now = new Date()) {
    const provider = sources[0]?.provider
    if (
      sources.length < 1 ||
      sources.length > 4 ||
      !provider ||
      sources.some((source) => source.provider !== provider)
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        'Research files must contain one to four exports from the same provider.',
      )
    }
    this.#sources = [...sources].sort(
      (left, right) =>
        compareText(left.file, right.file) ||
        compareText(left.exportedAt, right.exportedAt) ||
        compareText(left.format ?? '', right.format ?? '') ||
        (left.rowLimit ?? 0) - (right.rowLimit ?? 0),
    )
    this.#now = now
    this.provider = provider
  }

  #rows(): Promise<CombinedResearchRows> {
    this.#imported ??= this.#loadRows()
    return this.#imported
  }

  async #loadRows(): Promise<CombinedResearchRows> {
    const rowsByKey = new Map<string, ImportedResearchRow>()
    const imports: ProviderImportEvidence[] = []
    const warnings: ProviderWarning[] = []
    let crossFileDuplicates = 0
    for (const source of this.#sources) {
      const imported = await importResearchRows(source, this.#now)
      imports.push(imported.importEvidence)
      warnings.push(...imported.warnings)
      for (const row of imported.rows) {
        const key = importedResearchRowKey(row)
        const existing = rowsByKey.get(key)
        if (!existing) {
          rowsByKey.set(key, row)
        } else {
          crossFileDuplicates += 1
          if (compareImportedResearchRows(row, existing) < 0) {
            rowsByKey.set(key, row)
          }
        }
      }
    }
    if (crossFileDuplicates > 0) {
      warnings.push({
        code: 'cross-file-duplicate-rows',
        message: `${crossFileDuplicates} duplicate row${crossFileDuplicates === 1 ? '' : 's'} across research files were removed deterministically.`,
      })
    }
    if (new Set(imports.map((item) => item.exportedAt)).size > 1) {
      warnings.push({
        code: 'mixed-export-times',
        message:
          'The research files were exported at different times. Compare each imports entry before interpreting differences between domains.',
      })
    }
    return {
      rows: [...rowsByKey.values()].sort(compareImportedResearchRows),
      imports,
      warnings,
    }
  }

  async rankedKeywords(
    input: RankedKeywordsRequest,
  ): Promise<ProviderEvidence<RankedKeywordPage>> {
    const imported = await this.#rows()
    const exclude = (input.excludeTerms ?? []).map(normalizedKeyword)
    const resultTypes = new Set(input.resultTypes ?? [])
    const matching = imported.rows.filter((row) =>
      matchesTarget(row, input.target, input.includeSubdomains),
    )
    const filtered = matching
      .filter(
        (row) =>
          (resultTypes.size === 0 || resultTypes.has(row.resultType)) &&
          (input.maxRank === undefined || row.rankAbsolute <= input.maxRank) &&
          (input.minSearchVolume === undefined ||
            (row.monthlySearchVolume.state === 'observed' &&
              row.monthlySearchVolume.value >= input.minSearchVolume)) &&
          !exclude.some((term) =>
            normalizedKeyword(row.keyword).includes(term),
          ),
      )
      .sort(rankedRowOrder)
    const retained = page(filtered, input.limit, input.offset)
    return evidence({
      imported,
      provider: this.provider,
      capability: 'ranked-keywords',
      market: input.market,
      data: {
        target: input.target,
        rows: retained,
        totalRows: null,
      },
      requestedRows: input.limit,
      returnedRows: matching.length,
      retainedRows: retained.length,
      filters: {
        target: input.target,
        includeSubdomains: input.includeSubdomains ?? true,
        ...(input.minSearchVolume === undefined
          ? {}
          : { minSearchVolume: input.minSearchVolume }),
        ...(input.maxRank === undefined ? {} : { maxRank: input.maxRank }),
        ...(resultTypes.size === 0
          ? {}
          : { resultTypes: [...resultTypes].sort().join(',') }),
        ...(exclude.length === 0
          ? {}
          : { excludeTerms: exclude.sort().join(',') }),
        offset: input.offset ?? 0,
      },
      sort: ['rankAbsolute:asc', 'keyword:asc', 'url:asc'],
    })
  }

  async rankingPages(
    input: RankingPagesRequest,
  ): Promise<ProviderEvidence<RankingPagePage>> {
    const imported = await this.#rows()
    const matching = imported.rows.filter((row) =>
      matchesTarget(row, input.domain, true),
    )
    const grouped = new Map<string, ImportedResearchRow[]>()
    for (const row of matching) {
      const rows = grouped.get(row.url) ?? []
      rows.push(row)
      grouped.set(row.url, rows)
    }
    const filtered: RankingPage[] = [...grouped.entries()]
      .map(([url, rows]) => ({ url, organic: footprint(rows) }))
      .filter((row) => {
        const traffic = row.organic.estimatedMonthlyTraffic
        const keywords = row.organic.rankedKeywords
        return (
          (input.minEstimatedTraffic === undefined ||
            (traffic.state === 'observed' &&
              traffic.value >= input.minEstimatedTraffic)) &&
          (input.minRankedKeywords === undefined ||
            (keywords.state === 'observed' &&
              keywords.value >= input.minRankedKeywords))
        )
      })
      .sort((left, right) => {
        const leftTraffic = left.organic.estimatedMonthlyTraffic
        const rightTraffic = right.organic.estimatedMonthlyTraffic
        const trafficDifference =
          (rightTraffic.state === 'observed' ? rightTraffic.value : -1) -
          (leftTraffic.state === 'observed' ? leftTraffic.value : -1)
        const leftKeywords = left.organic.rankedKeywords
        const rightKeywords = right.organic.rankedKeywords
        return (
          trafficDifference ||
          (rightKeywords.state === 'observed' ? rightKeywords.value : -1) -
            (leftKeywords.state === 'observed' ? leftKeywords.value : -1) ||
          compareText(left.url, right.url)
        )
      })
    const retained = page(filtered, input.limit, input.offset)
    return evidence({
      imported,
      provider: this.provider,
      capability: 'relevant-pages',
      market: input.market,
      data: { domain: domain(input.domain), rows: retained, totalRows: null },
      requestedRows: input.limit,
      returnedRows: grouped.size,
      retainedRows: retained.length,
      filters: {
        domain: domain(input.domain),
        ...(input.minEstimatedTraffic === undefined
          ? {}
          : { minEstimatedTraffic: input.minEstimatedTraffic }),
        ...(input.minRankedKeywords === undefined
          ? {}
          : { minRankedKeywords: input.minRankedKeywords }),
        offset: input.offset ?? 0,
      },
      sort: ['estimatedMonthlyTraffic:desc', 'rankedKeywords:desc', 'url:asc'],
    })
  }

  async serpCompetitors(
    input: SerpCompetitorsRequest,
  ): Promise<ProviderEvidence<SerpCompetitorSet>> {
    const imported = await this.#rows()
    const requestedKeywords = [
      ...new Set(input.keywords.map(normalizedKeyword)),
    ]
      .filter(Boolean)
      .sort(compareText)
    const requested = new Set(requestedKeywords)
    const resultTypes = new Set(input.resultTypes ?? [])
    const matching = imported.rows.filter(
      (row) =>
        requested.has(normalizedKeyword(row.keyword)) &&
        (resultTypes.size === 0 || resultTypes.has(row.resultType)),
    )
    const grouped = new Map<string, ImportedResearchRow[]>()
    for (const row of matching) {
      const rows = grouped.get(row.domain) ?? []
      rows.push(row)
      grouped.set(row.domain, rows)
    }
    const competitors: SerpCompetitor[] = [...grouped.entries()]
      .map(([rowDomain, rows]) => {
        const keywordPositions = [
          ...new Set(rows.map((row) => normalizedKeyword(row.keyword))),
        ]
          .sort(compareText)
          .map((keyword) => ({
            keyword,
            positions: rows
              .filter((row) => normalizedKeyword(row.keyword) === keyword)
              .map((row) => row.rankAbsolute)
              .sort((left, right) => left - right),
          }))
        const positions = rows
          .map((row) => row.rankAbsolute)
          .sort((left, right) => left - right)
        const midpoint = Math.floor(positions.length / 2)
        const median =
          positions.length % 2 === 0
            ? ((positions[midpoint - 1] ?? 0) + (positions[midpoint] ?? 0)) / 2
            : (positions[midpoint] ?? 0)
        return {
          domain: rowDomain,
          matchedKeywords: keywordPositions.length,
          averagePosition: observed(
            positions.reduce((total, position) => total + position, 0) /
              positions.length,
          ),
          medianPosition: observed(median),
          visibility: missing<number>(
            'The ranked-keyword import does not include a comparable provider visibility metric.',
          ),
          estimatedMonthlyTraffic: aggregateNumber(
            rows.map((row) => row.estimatedMonthlyTraffic),
            'estimated monthly traffic',
          ),
          relevantResults: observed(rows.length),
          keywordPositions,
        }
      })
      .sort(
        (left, right) =>
          right.matchedKeywords - left.matchedKeywords ||
          (left.averagePosition.state === 'observed'
            ? left.averagePosition.value
            : Number.POSITIVE_INFINITY) -
            (right.averagePosition.state === 'observed'
              ? right.averagePosition.value
              : Number.POSITIVE_INFINITY) ||
          compareText(left.domain, right.domain),
      )
    const retained = page(competitors, input.limit, input.offset)
    return evidence({
      imported,
      provider: this.provider,
      capability: 'serp-competitors',
      market: input.market,
      data: { keywords: requestedKeywords, rows: retained, totalRows: null },
      requestedRows: input.limit,
      returnedRows: competitors.length,
      retainedRows: retained.length,
      filters: {
        keywordCount: requested.size,
        includeSubdomains: input.includeSubdomains ?? true,
        ...(resultTypes.size === 0
          ? {}
          : { resultTypes: [...resultTypes].sort().join(',') }),
        offset: input.offset ?? 0,
      },
      sort: ['matchedKeywords:desc', 'averagePosition:asc', 'domain:asc'],
    })
  }
}
