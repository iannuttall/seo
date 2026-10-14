const COUNTRY_CODE_SECOND_LEVELS = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'net',
  'org',
])

export function normalizeBrandText(value: string): string {
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

function hostLabels(siteUrl: string): string[] {
  const value = siteUrl
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
  const host = (value.split('/')[0] ?? '').split(':')[0] ?? ''
  return host.split('.').filter(Boolean)
}

function suffixDepth(parts: string[]): number {
  const last = parts.at(-1) ?? ''
  const secondLast = parts.at(-2) ?? ''
  return last.length === 2 &&
    COUNTRY_CODE_SECOND_LEVELS.has(secondLast) &&
    parts.length > 2
    ? 2
    : 1
}

/**
 * The registrable part of a Search Console property host, using the small
 * built-in list of country-code second levels. `sc-domain:docs.example.co.uk`
 * returns `{ domain: 'example.co.uk', stem: 'example', suffix: 'co.uk' }`.
 */
export function registrableDomain(
  siteUrl: string,
): { domain: string; stem: string; suffix: string } | undefined {
  const parts = hostLabels(siteUrl)
  if (parts.length < 2) return undefined
  const depth = suffixDepth(parts)
  const stem = parts.at(-(depth + 1))
  if (!stem) return undefined
  const suffix = parts.slice(-depth).join('.')
  return { domain: `${stem}.${suffix}`, stem, suffix }
}

function domainStem(siteUrl: string): string | undefined {
  const parts = hostLabels(siteUrl)
  if (!parts.length) return undefined
  return parts.at(-(suffixDepth(parts) + 1)) ?? parts[0]
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

// Offsets in the compact (space-free) query where a query token starts or
// ends. An ASCII compact brand match must start and end on these offsets, so
// `examplecom` matches "example.com" and "example com" but not
// "example compare".
function tokenBoundaries(queryTokens: string[]): Set<number> {
  const boundaries = new Set<number>([0])
  let offset = 0
  for (const token of queryTokens) {
    offset += token.length
    boundaries.add(offset)
  }
  return boundaries
}

function alignedCompactMatch(
  compactQuery: string,
  compactTerm: string,
  boundaries: Set<number>,
): boolean {
  let index = compactQuery.indexOf(compactTerm)
  while (index !== -1) {
    if (boundaries.has(index) && boundaries.has(index + compactTerm.length)) {
      return true
    }
    index = compactQuery.indexOf(compactTerm, index + 1)
  }
  return false
}

export function isBrandQuery(query: string, brandTerms: string[]): boolean {
  const normalized = normalizeBrandText(query)
  if (!normalized || !brandTerms.length) return false

  const queryTokens = normalized.split(' ')
  const compactQuery = normalized.replace(/\s+/g, '')
  const boundaries = tokenBoundaries(queryTokens)
  return brandTerms.some((term) => {
    const normalizedTerm = normalizeBrandText(term)
    if (!normalizedTerm) return false
    const compactTerm = normalizedTerm.replace(/\s+/g, '')
    const compactTermLength = [...compactTerm].length
    const nonAscii = /[^\p{ASCII}]/u.test(compactTerm)
    // Scripts written without spaces keep substring matching; ASCII terms
    // must align with query token boundaries.
    const compactMatches = nonAscii
      ? compactTermLength >= 2 && compactQuery.includes(compactTerm)
      : compactTermLength >= 6 &&
        alignedCompactMatch(compactQuery, compactTerm, boundaries)
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
