export type PseoQueryPattern = {
  label: string
  queryCount: number
  clicks: number
  impressions: number
  examples: string[]
}

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'best',
  'for',
  'first',
  'from',
  'how',
  'in',
  'is',
  'last',
  'letter',
  'letters',
  'name',
  'names',
  'of',
  'on',
  'or',
  'start',
  'starts',
  'starting',
  'that',
  'the',
  'to',
  'vs',
  'with',
])

const THEME_STOPWORDS = new Set([
  ...QUERY_STOPWORDS,
  'about',
  'after',
  'all',
  'at',
  'be',
  'by',
  'can',
  'chart',
  'check',
  'day',
  'days',
  'did',
  'do',
  'does',
  'each',
  'ever',
  'find',
  'free',
  'get',
  'high',
  'hour',
  'hours',
  'into',
  'low',
  'made',
  'make',
  'makes',
  'many',
  'month',
  'months',
  'much',
  'near',
  'new',
  'page',
  'pages',
  'per',
  'search',
  'show',
  'site',
  'sites',
  'than',
  'they',
  'this',
  'time',
  'times',
  'today',
  'tool',
  'tools',
  'top',
  'what',
  'when',
  'where',
  'year',
  'years',
  'you',
  'your',
])

export function normalizePseoText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/([\p{L}\p{N}])[’']([\p{L}\p{N}])/gu, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsefulQueryTerm(term: string): boolean {
  return term.length > 1 || /^\d$/u.test(term) || /[^\p{ASCII}]/u.test(term)
}

export function pseoQueryTerms(query: string): string[] {
  const terms = normalizePseoText(query)
    .split(' ')
    .filter((term) => isUsefulQueryTerm(term) && !QUERY_STOPWORDS.has(term))
  return [...new Set(terms)]
}

export function canonicalPseoTerm(term: string): string {
  if (!/^[a-z]+$/i.test(term)) return term
  if (['surname', 'surnames'].includes(term)) return 'name'
  if (['beginning', 'begins', 'started'].includes(term)) return 'start'
  if (/(as|is|ss|us)$/.test(term)) return term
  if (term.length > 4 && term.endsWith('ies')) {
    return `${term.slice(0, -3)}y`
  }
  if (term.length > 4 && term.endsWith('xes')) return term.slice(0, -2)
  if (term.length > 4 && term.endsWith('es')) return term.slice(0, -1)
  if (term.length > 4 && term.endsWith('s')) return term.slice(0, -1)
  return term
}

export function pseoQueryThemeTerms(query: string): string[] {
  return normalizePseoText(query)
    .split(' ')
    .filter((term) => isUsefulQueryTerm(term) && !THEME_STOPWORDS.has(term))
}

function queryPatternLabel(query: string): string {
  const normalized = normalizePseoText(query)
  if (/\b(vs|versus|compare|comparison)\b/.test(normalized)) {
    return 'comparison'
  }
  if (/\balternative|alternatives\b/.test(normalized)) return 'alternatives'
  if (/\bwithout (account|login|signing|sign in)\b/.test(normalized)) {
    return 'no-login modifier'
  }
  if (/\b(export|download|save|convert)\b/.test(normalized)) {
    return 'workflow/action'
  }
  if (/\bmeaning|origin|history\b/.test(normalized)) return 'meaning/origin'
  if (/\brare|rarity|popular|popularity\b/.test(normalized)) {
    return 'rarity/popularity'
  }
  if (/\bhow many|number of|people with|people have\b/.test(normalized)) {
    return 'count/statistic'
  }
  if (
    /\b(starting with|starts with|start with|beginning with|letter)\b/.test(
      normalized,
    )
  ) {
    return 'list/facet'
  }
  if (/\b(price|pricing|cost|fee)\b/.test(normalized)) return 'pricing'
  if (/\breview|reviews|reddit|forum|community\b/.test(normalized)) {
    return 'reviews/community'
  }
  if (/\bguide|docs|documentation|api\b/.test(normalized)) {
    return 'docs/how-to'
  }
  return 'general'
}

function queryThemeCandidates(query: string): string[] {
  const terms = pseoQueryThemeTerms(query).map(canonicalPseoTerm)
  const candidates: string[] = []
  for (const size of [3, 2]) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      candidates.push(terms.slice(index, index + size).join(' '))
    }
  }
  candidates.push(...terms)
  return [...new Set(candidates)]
}

function learnedQueryThemeRanks(
  rows: Array<{
    query: string
    impressions: number
  }>,
): Map<string, number> {
  const phraseStats = new Map<
    string,
    { queryCount: number; impressions: number }
  >()

  const rowsByQuery = new Map<string, number>()
  for (const row of rows) {
    rowsByQuery.set(
      row.query,
      (rowsByQuery.get(row.query) ?? 0) + row.impressions,
    )
  }

  for (const [query, impressions] of rowsByQuery) {
    const candidates = queryThemeCandidates(query)
    for (const candidate of candidates) {
      const existing = phraseStats.get(candidate) ?? {
        queryCount: 0,
        impressions: 0,
      }
      existing.queryCount += 1
      existing.impressions += impressions
      phraseStats.set(candidate, existing)
    }
  }

  const totalImpressions = [...rowsByQuery.values()].reduce(
    (sum, impressions) => sum + impressions,
    0,
  )
  const scoredPhrases = [...phraseStats.entries()]
    .filter(([, stats]) => stats.queryCount >= 2)
    .filter(
      ([phrase, stats]) =>
        phrase.includes(' ') || stats.impressions >= totalImpressions * 0.05,
    )
    .sort((a, b) => {
      const impressions = b[1].impressions - a[1].impressions
      if (impressions) return impressions
      return (
        b[0].length - a[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
      )
    })

  return new Map(scoredPhrases.map(([phrase], rank) => [phrase, rank]))
}

function learnedQueryTheme(
  query: string,
  ranks: ReadonlyMap<string, number>,
): string | undefined {
  let selected: string | undefined
  let selectedRank = Number.POSITIVE_INFINITY
  for (const candidate of queryThemeCandidates(query)) {
    const rank = ranks.get(candidate)
    if (rank !== undefined && rank < selectedRank) {
      selected = candidate
      selectedRank = rank
    }
  }
  return selected ? `theme: ${selected}` : undefined
}

export function pseoQueryPatterns(
  rows: Array<{
    query: string
    clicks: number
    impressions: number
  }>,
): PseoQueryPattern[] {
  const patterns = new Map<string, PseoQueryPattern>()
  const patternQueries = new Map<string, Set<string>>()
  const learnedThemes = learnedQueryThemeRanks(rows)
  for (const row of rows) {
    const intentLabel = queryPatternLabel(row.query)
    const label =
      intentLabel === 'general'
        ? (learnedQueryTheme(row.query, learnedThemes) ?? intentLabel)
        : intentLabel
    const existing = patterns.get(label) ?? {
      label,
      queryCount: 0,
      clicks: 0,
      impressions: 0,
      examples: [],
    }
    const queries = patternQueries.get(label) ?? new Set<string>()
    queries.add(row.query)
    patternQueries.set(label, queries)
    existing.queryCount = queries.size
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    if (
      existing.examples.length < 3 &&
      !existing.examples.includes(row.query)
    ) {
      existing.examples.push(row.query)
    }
    patterns.set(label, existing)
  }

  return [...patterns.values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
}
