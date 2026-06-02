function normalizeBrandText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/[^a-z0-9]+/g, ' ')
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

  const queryTokens = new Set(normalized.split(' '))
  return brandTerms.some((term) => {
    const normalizedTerm = normalizeBrandText(term)
    if (!normalizedTerm) return false
    const termTokens = normalizedTerm.split(' ')
    if (termTokens.length === 1) {
      return queryTokens.has(normalizedTerm)
    }
    return normalized.includes(normalizedTerm)
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
