import { tokenize } from './shared.js'

function hasLetter(value: string): boolean {
  return /[a-z]/i.test(value)
}

function hasDigit(value: string): boolean {
  return /\d/.test(value)
}

function looksLikeSearchOperatorDump(query: string): boolean {
  const lower = query.toLowerCase()
  return (
    query.length > 120 &&
    (lower.includes('x_keyword_search') ||
      lower.includes('min_faves') ||
      lower.includes('filter:') ||
      lower.includes(' since:') ||
      lower.includes(' until:'))
  )
}

function looksLikeDomainQuery(query: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(query.trim())
}

export function isLowActionabilityQuery(query: string): boolean {
  const tokens = tokenize(query)
  if (!tokens.length || !hasLetter(query)) return true
  if (looksLikeSearchOperatorDump(query)) return true
  if (looksLikeDomainQuery(query)) return true

  const letterTokens = tokens.filter(hasLetter)
  if (tokens.length === 1 && hasDigit(tokens[0] ?? '')) return true
  if (letterTokens.length <= 1 && tokens.some(hasDigit)) return true

  return false
}
