import type {
  PseoObservedPatternKind,
  PseoPatternKind,
} from '../pseo-pattern-contract.js'

export type PseoQueryPattern = {
  kind: PseoObservedPatternKind
  label: string
  heuristic: true
  queryCount: number
  pageCount: number
  clicks: number
  impressions: number
  position: number
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

const CONVERSION_ENTITY =
  '(?:aud|cad|celsius|csv|docx?|eur|fahrenheit|gbp|grams?|inches?|jpe?g|json|kg|kilograms?|km|litres?|meters?|miles?|ounces?|pdf|png|pounds?|usd|webp|xml)'
const CONVERSION_PAIR = new RegExp(
  `\\b${CONVERSION_ENTITY}\\s+(?:in|to)\\s+${CONVERSION_ENTITY}\\b`,
  'u',
)

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

export function pseoQueryPatternKind(
  query: string,
): PseoPatternKind | 'general' {
  const normalized = normalizePseoText(query)
  if (/\b(vs|versus|compare|comparison)\b/.test(normalized)) {
    return 'comparison'
  }
  if (/\balternatives?\b/.test(normalized)) return 'alternatives'
  if (
    /\b(convert|converter|conversion)\b/.test(normalized) ||
    CONVERSION_PAIR.test(normalized)
  ) {
    return 'conversion'
  }
  if (/\btemplate|templates\b/.test(normalized)) return 'template'
  if (/\bexample|examples|inspiration\b/.test(normalized)) return 'examples'
  if (/\bintegration|integrations|sync|connect\b/.test(normalized)) {
    return 'integration'
  }
  if (
    /\b(calculator|generator|checker|lookup|grader|tester)\b/.test(normalized)
  ) {
    return 'utility'
  }
  if (/\bwhat is\b|\bdefinition|defined\b/.test(normalized)) {
    return 'glossary'
  }
  if (/\bbest\b|\btop \d+\b/.test(normalized)) return 'curation'
  if (/\bwithout (account|login|signing|sign in)\b/.test(normalized)) {
    return 'no-login'
  }
  if (/\b(export|download|save|convert)\b/.test(normalized)) {
    return 'workflow-action'
  }
  if (/\bmeaning|origin|history\b/.test(normalized)) return 'meaning-origin'
  if (/\brare|rarity|popular|popularity\b/.test(normalized)) {
    return 'rarity-popularity'
  }
  if (/\bhow many|number of|people with|people have\b/.test(normalized)) {
    return 'count-statistic'
  }
  if (
    /\b(starting with|starts with|start with|beginning with|letter)\b/.test(
      normalized,
    )
  ) {
    return 'list-facet'
  }
  if (/\b(price|pricing|cost|fee)\b/.test(normalized)) return 'pricing'
  if (/\breview|reviews|reddit|forum|community\b/.test(normalized)) {
    return 'reviews-community'
  }
  if (/\bguide|docs|documentation|api\b|\bhow to\b/.test(normalized)) {
    return 'docs-how-to'
  }
  return 'general'
}

export function pseoQueryPatternLabel(
  kind: PseoPatternKind | 'general',
): string {
  const labels: Record<PseoPatternKind | 'general', string> = {
    alternatives: 'alternatives',
    comparison: 'comparison',
    conversion: 'conversion',
    'count-statistic': 'count/statistic',
    curation: 'curation/best',
    directory: 'directory',
    'docs-how-to': 'docs/how-to',
    examples: 'examples',
    glossary: 'glossary/definition',
    integration: 'integration',
    'list-facet': 'list/facet',
    location: 'location',
    'meaning-origin': 'meaning/origin',
    'no-login': 'no-login modifier',
    persona: 'persona/use-case',
    pricing: 'pricing',
    profile: 'profile/entity',
    'rarity-popularity': 'rarity/popularity',
    'reviews-community': 'reviews/community',
    template: 'template',
    utility: 'utility/tool',
    'workflow-action': 'workflow/action',
    custom: 'custom',
    general: 'general',
  }
  return labels[kind]
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

type PseoQueryPatternOptions = {
  limit?: number
  preferRecognized?: boolean
}

export function pseoQueryPatternResult(
  rows: Array<{
    query: string
    clicks: number
    impressions: number
    page?: string
    position?: number
  }>,
  options: PseoQueryPatternOptions = {},
): { available: number; patterns: PseoQueryPattern[] } {
  const patterns = new Map<
    string,
    {
      kind: PseoObservedPatternKind
      label: string
      clicks: number
      impressions: number
      weightedPosition: number
      pages: Set<string>
      queries: Map<
        string,
        { query: string; clicks: number; impressions: number }
      >
    }
  >()
  const learnedThemes = learnedQueryThemeRanks(rows)
  for (const row of rows) {
    const patternKind = pseoQueryPatternKind(row.query)
    const intentLabel = pseoQueryPatternLabel(patternKind)
    const label =
      intentLabel === 'general'
        ? (learnedQueryTheme(row.query, learnedThemes) ?? intentLabel)
        : intentLabel
    const kind: PseoObservedPatternKind = label.startsWith('theme: ')
      ? 'learned-theme'
      : patternKind
    const existing = patterns.get(label) ?? {
      kind,
      label,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      pages: new Set(),
      queries: new Map(),
    }
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    existing.weightedPosition +=
      row.impressions *
      (Number.isFinite(row.position) ? (row.position ?? 0) : 0)
    if (row.page) existing.pages.add(row.page)
    const queryKey = normalizePseoText(row.query)
    const previous = existing.queries.get(queryKey)
    existing.queries.set(queryKey, {
      query:
        previous && previous.query < row.query ? previous.query : row.query,
      clicks: (previous?.clicks ?? 0) + row.clicks,
      impressions: (previous?.impressions ?? 0) + row.impressions,
    })
    patterns.set(label, existing)
  }

  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 5)))
  const results = [...patterns.values()]
    .map(
      (pattern): PseoQueryPattern => ({
        kind: pattern.kind,
        label: pattern.label,
        heuristic: true,
        queryCount: pattern.queries.size,
        pageCount: pattern.pages.size,
        clicks: pattern.clicks,
        impressions: pattern.impressions,
        position: pattern.impressions
          ? pattern.weightedPosition / pattern.impressions
          : 0,
        examples: [...pattern.queries.values()]
          .sort(
            (left, right) =>
              right.impressions - left.impressions ||
              right.clicks - left.clicks ||
              (left.query < right.query
                ? -1
                : left.query > right.query
                  ? 1
                  : 0),
          )
          .slice(0, 3)
          .map((query) => query.query),
      }),
    )
    .sort(
      (left, right) =>
        (options.preferRecognized
          ? Number(left.kind === 'learned-theme' || left.kind === 'general') -
            Number(right.kind === 'learned-theme' || right.kind === 'general')
          : 0) ||
        right.impressions - left.impressions ||
        right.clicks - left.clicks ||
        (left.label < right.label ? -1 : left.label > right.label ? 1 : 0),
    )
  return { available: results.length, patterns: results.slice(0, limit) }
}

export function pseoQueryPatterns(
  rows: Array<{
    query: string
    clicks: number
    impressions: number
    page?: string
    position?: number
  }>,
  options: PseoQueryPatternOptions = {},
): PseoQueryPattern[] {
  return pseoQueryPatternResult(rows, options).patterns
}
