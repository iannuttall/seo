import { normalizeBrandText, registrableDomain } from './brand.js'
import type { GscRow } from './types.js'

// Data-driven brand terms. The compound host forms ("example.com",
// "example com", "examplecom", "example-com") always count as brand. The bare
// domain stem ("example") counts only when Search Console shows the property
// is the navigational answer for that exact query. A stem such as
// "example" on example.dev is a generic word, and treating every query
// that contains it as brand hides real non-brand demand.
//
// The stem thresholds are heuristics chosen for this report family, not
// Google rules:
// - average position at or above 2: the property is a top answer;
// - CTR of at least 0.2: searchers choose it, which generic words rarely show;
// - at least 20 impressions: enough exposure that one click cannot qualify it.

export const NAVIGATIONAL_STEM_THRESHOLDS = {
  maximumPosition: 2,
  minimumCtr: 0.2,
  minimumImpressions: 20,
} as const

export type BrandQueryEvidence = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  sourceRows: number
}

export type BrandTermEvidence = {
  term: string
  source: 'host-compound' | 'navigational-stem' | 'provided'
  reason: string
  query?: BrandQueryEvidence
}

export type ExcludedBrandTerm = {
  term: string
  source: 'domain-stem'
  reason: string
  query?: BrandQueryEvidence
}

export type BrandTermsFromQueryRows = {
  terms: string[]
  evidence: BrandTermEvidence[]
  excluded: ExcludedBrandTerm[]
  method: {
    id: 'gsc_navigational_brand_terms_v1'
    heuristic: true
    stemRule: typeof NAVIGATIONAL_STEM_THRESHOLDS
    stemMatch: 'exact_query_ignoring_spaces_and_punctuation'
  }
}

function compact(value: string): string {
  return normalizeBrandText(value).replace(/\s+/g, '')
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function stemQueryEvidence(
  rows: GscRow[],
  stem: string,
): BrandQueryEvidence | undefined {
  const target = compact(stem)
  if (!target) return undefined
  let clicks = 0
  let impressions = 0
  let weightedPosition = 0
  let sourceRows = 0
  let query: string | undefined
  for (const row of rows) {
    const value = row.keys?.[0]
    if (typeof value !== 'string' || compact(value) !== target) continue
    if (
      !Number.isFinite(row.clicks) ||
      !Number.isFinite(row.impressions) ||
      !Number.isFinite(row.position) ||
      row.impressions <= 0 ||
      row.clicks < 0
    ) {
      continue
    }
    const trimmed = value.trim()
    if (query === undefined || trimmed < query) query = trimmed
    clicks += row.clicks
    impressions += row.impressions
    weightedPosition += row.position * row.impressions
    sourceRows++
  }
  if (!sourceRows || query === undefined) return undefined
  return {
    query,
    clicks,
    impressions,
    ctr: round(clicks / impressions, 4),
    position: round(weightedPosition / impressions, 2),
    sourceRows,
  }
}

/**
 * Brand terms for a property, decided from its own Search Console query rows.
 * `rows` are query rows (`keys[0]` is the query); query/page rows also work
 * because rows for the same query are summed. Pure and Worker-safe.
 */
export function brandTermsFromQueryRows(input: {
  siteUrl: string
  rows: GscRow[]
}): BrandTermsFromQueryRows {
  const evidence: BrandTermEvidence[] = []
  const excluded: ExcludedBrandTerm[] = []
  const host = registrableDomain(input.siteUrl)
  const method = {
    id: 'gsc_navigational_brand_terms_v1' as const,
    heuristic: true as const,
    stemRule: NAVIGATIONAL_STEM_THRESHOLDS,
    stemMatch: 'exact_query_ignoring_spaces_and_punctuation' as const,
  }
  if (!host) return { terms: [], evidence, excluded, method }

  const suffixWords = host.suffix.split('.')
  const compounds = [
    host.domain,
    [host.stem, ...suffixWords].join(' '),
    [host.stem, ...suffixWords].join(''),
    [host.stem, ...suffixWords].join('-'),
  ]
  for (const term of [...new Set(compounds)]) {
    evidence.push({
      term,
      source: 'host-compound',
      reason: `Contains the property host ${host.domain}.`,
    })
  }

  const stemEvidence = stemQueryEvidence(input.rows, host.stem)
  const thresholds = NAVIGATIONAL_STEM_THRESHOLDS
  if (!stemEvidence) {
    excluded.push({
      term: host.stem,
      source: 'domain-stem',
      reason: `No retained Search Console row for the exact query "${host.stem}", so the bare stem is not treated as brand.`,
    })
  } else if (
    stemEvidence.impressions >= thresholds.minimumImpressions &&
    stemEvidence.position <= thresholds.maximumPosition &&
    stemEvidence.ctr >= thresholds.minimumCtr
  ) {
    evidence.push({
      term: host.stem,
      source: 'navigational-stem',
      reason: `The exact query "${stemEvidence.query}" averages position ${stemEvidence.position} with CTR ${stemEvidence.ctr} over ${stemEvidence.impressions} impressions, so the property looks like its navigational answer (heuristic).`,
      query: stemEvidence,
    })
  } else {
    excluded.push({
      term: host.stem,
      source: 'domain-stem',
      reason: `The exact query "${stemEvidence.query}" averages position ${stemEvidence.position} with CTR ${stemEvidence.ctr} over ${stemEvidence.impressions} impressions. That does not meet position <= ${thresholds.maximumPosition}, CTR >= ${thresholds.minimumCtr} and impressions >= ${thresholds.minimumImpressions}, so the bare stem is treated as a generic word.`,
      query: stemEvidence,
    })
  }

  return {
    terms: evidence.map((item) => item.term),
    evidence,
    excluded,
    method,
  }
}

export type ReportBrandTerms = {
  source: 'provided' | 'search-console-navigational'
  filtering: 'included' | 'excluded'
  terms: string[]
  evidence: BrandTermEvidence[]
  excluded: ExcludedBrandTerm[]
  heuristic: boolean
}

/**
 * Brand terms a report uses: the caller's terms when given, otherwise terms
 * derived from the same Search Console rows the report analyses.
 */
export function resolveReportBrandTerms(input: {
  siteUrl: string
  rows: GscRow[]
  brandTerms?: string[]
  includeBrand?: boolean
}): ReportBrandTerms {
  const filtering = input.includeBrand ? 'included' : 'excluded'
  const provided = (input.brandTerms ?? []).filter((term) =>
    normalizeBrandText(term),
  )
  if (provided.length) {
    return {
      source: 'provided',
      filtering,
      terms: provided,
      evidence: provided.map((term) => ({
        term,
        source: 'provided',
        reason: 'Supplied by the caller or saved project profile.',
      })),
      excluded: [],
      heuristic: false,
    }
  }
  const derived = brandTermsFromQueryRows({
    siteUrl: input.siteUrl,
    rows: input.rows,
  })
  return {
    source: 'search-console-navigational',
    filtering,
    terms: derived.terms,
    evidence: derived.evidence,
    excluded: derived.excluded,
    heuristic: true,
  }
}
