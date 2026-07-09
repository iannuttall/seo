import { querySearchAnalytics } from './gsc/client.js'

function normalizeBrandText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function domainStem(siteUrl: string): string | undefined {
  const value = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '')
  const host = value.split('/')[0]
  if (!host) return undefined
  const parts = host.split('.').filter(Boolean)
  if (!parts.length) return undefined
  return parts.length > 2 ? parts.at(-2) : parts[0]
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeBrandText).filter(Boolean))]
}

function tokenStem(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token
}

function tokensMatch(a: string, b: string): boolean {
  return a === b || tokenStem(a) === tokenStem(b)
}

function includesTokenSequence(queryTokens: string[], termTokens: string[]) {
  if (!termTokens.length || termTokens.length > queryTokens.length) return false
  for (
    let index = 0;
    index <= queryTokens.length - termTokens.length;
    index++
  ) {
    if (
      termTokens.every((termToken, offset) =>
        tokensMatch(queryTokens[index + offset] ?? '', termToken),
      )
    ) {
      return true
    }
  }
  return false
}

export function deriveBrandTerms(input: {
  id?: string
  name?: string
  siteUrl: string
}): string[] {
  const stem = domainStem(input.siteUrl)
  const candidates = [input.name, input.id, stem]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      const normalized = normalizeBrandText(value)
      const compact = normalized.replace(/\s+/g, '')
      return [normalized, compact]
    })

  return unique(candidates)
}

export function isBrandQuery(query: string, brandTerms: string[]): boolean {
  const normalized = normalizeBrandText(query)
  if (!normalized || !brandTerms.length) return false

  const queryTokens = normalized.split(' ')
  const compactQuery = normalized.replace(/\s+/g, '')
  return brandTerms.some((term) => {
    const normalizedTerm = normalizeBrandText(term)
    if (!normalizedTerm) return false
    const compactTerm = normalizedTerm.replace(/\s+/g, '')
    const compactTermLength = [...compactTerm].length
    const compactMatches =
      (compactTermLength >= 6 ||
        (/[^\p{ASCII}]/u.test(compactTerm) && compactTermLength >= 2)) &&
      compactQuery.includes(compactTerm)
    const termTokens = normalizedTerm.split(' ')
    if (termTokens.length === 1) {
      return (
        queryTokens.some((queryToken) =>
          tokensMatch(queryToken, normalizedTerm),
        ) || compactMatches
      )
    }
    return includesTokenSequence(queryTokens, termTokens) || compactMatches
  })
}

export function shouldExcludeBrandQuery(input: {
  query: string
  siteUrl: string
  brandTerms?: string[]
  includeBrand?: boolean
}): boolean {
  if (input.includeBrand) return false
  const terms = input.brandTerms?.length
    ? input.brandTerms
    : deriveBrandTerms({ siteUrl: input.siteUrl })
  return isBrandQuery(input.query, terms)
}

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
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
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
