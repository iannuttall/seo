import { aiQueryKind, aiQueryNoise } from '../analyze/ai-queries.js'
import { isSearchArtifactQuery } from '../analyze/query-quality.js'
import { isBrandQuery } from '../brand.js'
import { resolveReportBrandTerms } from '../brand-evidence.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { finalGscDateRange } from '../gsc/dates.js'
import type { ResearchProvider } from './research-providers.js'
import { spamHint } from './rows.js'

// Zero-volume keywords: a site's own Search Console queries that earn
// impressions while the keyword provider rates them at zero or does not
// know them. keyword_metrics with a site and no keywords asks the provider
// about the site's top queries by impressions, in one call.

// One provider call: DataForSEO's keyword overview takes 700 keywords a
// task, Ahrefs' overview 100.
export const ZERO_VOLUME_KEYWORDS: Record<ResearchProvider, number> = {
  dataforseo: 700,
  ahrefs: 100,
}
const DAYS = 28
const MAX_ROWS = 25_000
// Google Ads, where the volumes come from, takes keywords of at most 80
// characters and 10 words, in letters, digits and a few marks.
const ASKABLE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} '’.&-]*$/u
const MAX_CHARACTERS = 80
const MAX_WORDS = 10

export type SiteQuery = {
  keyword: string
  impressions: number
  clicks: number
  position: number
  page: string
}

export type ZeroVolumeCandidates = {
  range: { startDate: string; endDate: string }
  queries: SiteQuery[]
  // Queries with impressions that were not asked about, and why.
  skipped: { brand: number; notAKeyword: number; overLimit: number }
  brandTerms: string[]
  capped: boolean
}

export async function zeroVolumeCandidates(
  site: string,
  searchAnalytics: SearchAnalyticsQuery,
  most: number,
): Promise<ZeroVolumeCandidates> {
  const range = finalGscDateRange(DAYS)
  const { rows, rowsFetched } = await searchAnalytics(site, {
    ...range,
    dimensions: ['query', 'page'],
    type: 'web',
    dataState: 'final',
    maxRows: MAX_ROWS,
  })
  const byQuery = new Map<
    string,
    SiteQuery & { positionWeight: number; pageImpressions: number }
  >()
  for (const row of rows) {
    const keyword = String(row.keys[0] ?? '')
      .trim()
      .toLowerCase()
    const page = String(row.keys[1] ?? '')
    if (!keyword || row.impressions <= 0) continue
    const entry = byQuery.get(keyword) ?? {
      keyword,
      impressions: 0,
      clicks: 0,
      position: 0,
      page,
      positionWeight: 0,
      pageImpressions: 0,
    }
    byQuery.set(keyword, entry)
    entry.impressions += row.impressions
    entry.clicks += row.clicks
    entry.positionWeight += row.position * row.impressions
    if (
      row.impressions > entry.pageImpressions ||
      (row.impressions === entry.pageImpressions && page < entry.page)
    ) {
      entry.page = page
      entry.pageImpressions = row.impressions
    }
  }
  const brand = resolveReportBrandTerms({ siteUrl: site, rows })
  const skipped = { brand: 0, notAKeyword: 0, overLimit: 0 }
  const kept: SiteQuery[] = []
  const ordered = [...byQuery.values()].sort(
    (a, b) =>
      b.impressions - a.impressions || a.keyword.localeCompare(b.keyword),
  )
  for (const entry of ordered) {
    const { keyword } = entry
    if (isBrandQuery(keyword, brand.terms)) {
      skipped.brand += 1
      continue
    }
    if (
      keyword.length > MAX_CHARACTERS ||
      keyword.split(/\s+/u).length > MAX_WORDS ||
      !ASKABLE.test(keyword) ||
      isSearchArtifactQuery(keyword) ||
      spamHint(keyword) ||
      aiQueryNoise(keyword) ||
      aiQueryKind(keyword) === 'operator'
    ) {
      skipped.notAKeyword += 1
      continue
    }
    if (kept.length >= most) {
      skipped.overLimit += 1
      continue
    }
    kept.push({
      keyword,
      impressions: entry.impressions,
      clicks: entry.clicks,
      position:
        Math.round((entry.positionWeight / entry.impressions) * 10) / 10,
      page: entry.page,
    })
  }
  return {
    range,
    queries: kept,
    skipped,
    brandTerms: brand.terms,
    capped: rowsFetched >= MAX_ROWS,
  }
}

type Row = Record<string, string | number | boolean | null>

// The asked queries the provider rated at zero (volume 0) or does not know
// (no row, or no volume), with the site's own Search Console numbers.
// Highest impressions first.
export function zeroVolumeRows(
  candidates: ZeroVolumeCandidates,
  providerRows: Row[],
  provider: ResearchProvider,
): { rows: Row[]; zero: number; unknown: number; rated: number } {
  const metric = provider === 'dataforseo' ? 'search_volume' : 'volume'
  const volumes = new Map<string, number | null>()
  for (const row of providerRows) {
    const keyword = String(row.keyword ?? '').toLowerCase()
    const value = row[metric]
    const volume = typeof value === 'number' ? value : null
    // A keyword the provider answers twice keeps its known volume.
    if (!volumes.has(keyword) || volume !== null) volumes.set(keyword, volume)
  }
  let zero = 0
  let unknown = 0
  const rows: Row[] = []
  for (const query of candidates.queries) {
    const volume = volumes.get(query.keyword)
    if (typeof volume === 'number' && volume > 0) continue
    const known = typeof volume === 'number'
    if (known) zero += 1
    else unknown += 1
    rows.push({
      keyword: query.keyword,
      [metric]: known ? volume : null,
      status: known ? 'zero' : 'unknown',
      impressions: query.impressions,
      clicks: query.clicks,
      position: query.position,
      page: query.page,
    })
  }
  return {
    rows,
    zero,
    unknown,
    rated: candidates.queries.length - zero - unknown,
  }
}
