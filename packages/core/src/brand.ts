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

function domainStem(siteUrl: string): string | undefined {
  const value = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '')
  const host = value.split('/')[0]
  if (!host) return undefined
  const parts = host.split('.').filter(Boolean)
  if (!parts.length) return undefined
  const last = parts.at(-1) ?? ''
  const secondLast = parts.at(-2) ?? ''
  const suffixDepth =
    last.length === 2 && COUNTRY_CODE_SECOND_LEVELS.has(secondLast) ? 2 : 1
  return parts.at(-(suffixDepth + 1)) ?? parts[0]
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
