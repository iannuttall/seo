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
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/([a-z0-9])[’']([a-z0-9])/gi, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pseoQueryTerms(query: string): string[] {
  const terms = normalizePseoText(query)
    .split(' ')
    .filter((term) => term.length > 2 && !QUERY_STOPWORDS.has(term))
  return [...new Set(terms)]
}

export function canonicalPseoTerm(term: string): string {
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
    .filter(
      (term) =>
        term.length > 2 && !THEME_STOPWORDS.has(term) && !/^\d+$/.test(term),
    )
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

function learnedQueryThemeLabels(
  rows: Array<{
    query: string
    impressions: number
  }>,
): Map<string, string> {
  const phraseStats = new Map<
    string,
    { queryCount: number; impressions: number }
  >()
  const queryCandidates = new Map<string, string[]>()

  for (const row of rows) {
    const candidates = queryThemeCandidates(row.query)
    queryCandidates.set(row.query, candidates)
    for (const candidate of candidates) {
      const existing = phraseStats.get(candidate) ?? {
        queryCount: 0,
        impressions: 0,
      }
      existing.queryCount += 1
      existing.impressions += row.impressions
      phraseStats.set(candidate, existing)
    }
  }

  const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const scoredPhrases = [...phraseStats.entries()]
    .filter(([, stats]) => stats.queryCount >= 2)
    .filter(
      ([phrase, stats]) =>
        phrase.includes(' ') || stats.impressions >= totalImpressions * 0.05,
    )
    .sort((a, b) => {
      const impressions = b[1].impressions - a[1].impressions
      if (impressions) return impressions
      return b[0].length - a[0].length
    })

  const labels = new Map<string, string>()
  for (const [query, candidates] of queryCandidates) {
    const match = scoredPhrases.find(([phrase]) => candidates.includes(phrase))
    if (match) labels.set(query, `theme: ${match[0]}`)
  }
  return labels
}

export function pseoQueryPatterns(
  rows: Array<{
    query: string
    clicks: number
    impressions: number
  }>,
): PseoQueryPattern[] {
  const patterns = new Map<string, PseoQueryPattern>()
  const learnedThemes = learnedQueryThemeLabels(rows)
  for (const row of rows) {
    const intentLabel = queryPatternLabel(row.query)
    const label =
      intentLabel === 'general'
        ? (learnedThemes.get(row.query) ?? intentLabel)
        : intentLabel
    const existing = patterns.get(label) ?? {
      label,
      queryCount: 0,
      clicks: 0,
      impressions: 0,
      examples: [],
    }
    existing.queryCount += 1
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
