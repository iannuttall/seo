import { deriveBrandTerms, isBrandQuery, normalizeBrandText } from './brand.js'
import { querySearchAnalytics } from './gsc/client.js'
import { finalGscDateRange } from './gsc/dates.js'

// Brand term detection reads Search Console through the local client, so it
// lives apart from the pure brand matching in brand.ts.
type BrandEvidence = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type BrandTermCandidate = {
  term: string
  score: number
  evidence: BrandEvidence[]
}

function defaultDateRange(days = 28): { startDate: string; endDate: string } {
  return finalGscDateRange(days)
}

function addCandidate(
  candidates: Map<string, BrandTermCandidate>,
  term: string,
  evidence: BrandEvidence,
): void {
  const normalized = normalizeBrandText(term)
  if (!normalized) return
  const existing = candidates.get(normalized) ?? {
    term: normalized,
    score: 0,
    evidence: [],
  }
  existing.score +=
    evidence.clicks * 2 +
    evidence.impressions * evidence.ctr +
    Math.max(0, 5 - evidence.position) * 10
  existing.evidence.push(evidence)
  candidates.set(normalized, existing)
}

function isExactBrandVariant(query: string, terms: string[]): boolean {
  const normalizedQuery = normalizeBrandText(query)
  const compactQuery = normalizedQuery.replace(/\s+/g, '')
  return terms.some((term) => {
    const normalizedTerm = normalizeBrandText(term)
    const compactTerm = normalizedTerm.replace(/\s+/g, '')
    return normalizedQuery === normalizedTerm || compactQuery === compactTerm
  })
}

export async function detectBrandTerms(input: {
  site: string
  id?: string
  name?: string
  days?: number
  limit?: number
  minImpressions?: number
  refresh?: boolean
}): Promise<{
  site: string
  generatedAt: string
  derivedTerms: string[]
  suggestedTerms: string[]
  candidates: BrandTermCandidate[]
}> {
  const derivedTerms = deriveBrandTerms({
    id: input.id,
    name: input.name,
    siteUrl: input.site,
  })
  const range = defaultDateRange(input.days ?? 28)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const minImpressions = input.minImpressions ?? 10
  const candidates = new Map<string, BrandTermCandidate>()

  for (const row of rows) {
    const query = row.keys[0] ?? ''
    if (
      row.impressions < minImpressions ||
      row.position > 3 ||
      row.ctr < 0.1 ||
      !isBrandQuery(query, derivedTerms)
    ) {
      continue
    }

    const evidence = {
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }
    const normalizedQuery = normalizeBrandText(query)
    const queryTokens = normalizedQuery.split(' ')
    if (
      queryTokens.length <= 4 &&
      (isExactBrandVariant(query, derivedTerms) || query.includes('.'))
    ) {
      addCandidate(candidates, normalizedQuery, evidence)
    }
    for (const term of derivedTerms) {
      if (isBrandQuery(query, [term])) {
        addCandidate(candidates, term, evidence)
      }
    }
  }

  const ranked = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      score: Number(candidate.score.toFixed(2)),
      evidence: candidate.evidence
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 10)

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    derivedTerms,
    suggestedTerms: ranked.length
      ? ranked.map((candidate) => candidate.term)
      : derivedTerms,
    candidates: ranked,
  }
}
