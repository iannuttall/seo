import { tokenize } from './shared.js'

function hasLetter(value: string): boolean {
  return /\p{L}/u.test(value)
}

function hasDigit(value: string): boolean {
  return /\d/.test(value)
}

function looksLikeSearchOperatorDump(query: string): boolean {
  const lower = query.toLowerCase()
  const operatorCount = (lower.match(/(?:^|\s)-?(?:site|filetype):/g) ?? [])
    .length
  return (
    query.length > 120 &&
    (lower.includes('x_keyword_search') ||
      lower.includes('min_faves') ||
      lower.includes('filter:') ||
      lower.includes(' since:') ||
      lower.includes(' until:') ||
      operatorCount >= 3)
  )
}

function looksLikeSearchOperatorQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return /(?:^|\s)-?(?:site|filetype|inurl|intitle|intext):\S+/.test(lower)
}

function looksLikeInternalSnippet(query: string): boolean {
  const lower = query.toLowerCase()
  return lower.includes('ranking/') || /\bmoved up\b/.test(lower)
}

function looksLikeDomainQuery(query: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(query.trim())
}

export function isSearchArtifactQuery(query: string): boolean {
  const tokens = tokenize(query)
  if (!tokens.length) return true
  return (
    looksLikeSearchOperatorQuery(query) ||
    looksLikeSearchOperatorDump(query) ||
    looksLikeInternalSnippet(query) ||
    looksLikeDomainQuery(query)
  )
}

export function isLowActionabilityQuery(query: string): boolean {
  const tokens = tokenize(query)
  if (!tokens.length || !hasLetter(query)) return true
  if (isSearchArtifactQuery(query)) return true

  const letterTokens = tokens.filter(hasLetter)
  if (tokens.length === 1 && hasDigit(tokens[0] ?? '')) return true
  if (letterTokens.length <= 1 && tokens.some(hasDigit)) return true

  return false
}

// Query flags are heuristic labels. Reports keep flagged rows, show the flag,
// and rank them after unflagged rows. A flag is never proof of intent.
export type QueryFlag = 'likely-automated' | 'navigational-other'

export const QUERY_FLAG_METHOD = {
  id: 'query_flags_v1',
  heuristic: true,
  ranking: 'flagged_rows_after_unflagged_rows',
  flags: {
    'likely-automated':
      'Snake_case identifier tokens, 20 or more words, or 8 or more ASCII words with no common function word. Such queries often come from scripts, prompts or tools, not people.',
    'navigational-other':
      "Names a domain that is not the property's host, ends with a spoken domain suffix or a login/site/app word, starts with a large platform name and adds no topic word, or is one short ASCII word that is not a brand term. Such queries usually look for another site.",
  },
} as const

const FUNCTION_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'best',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'my',
  'not',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'without',
  'you',
  'your',
  // Common short words in other Latin-script languages.
  'con',
  'de',
  'del',
  'der',
  'des',
  'die',
  'du',
  'el',
  'en',
  'et',
  'il',
  'la',
  'le',
  'les',
  'para',
  'per',
  'por',
  'que',
  'und',
])

const IDENTIFIER_TOKEN = /[\p{L}\p{N}]_[\p{L}\p{N}]/u

/** Heuristic: the query looks machine-generated rather than typed by a person. */
export function isLikelyAutomatedQuery(query: string): boolean {
  const rawTokens = query.trim().split(/\s+/).filter(Boolean)
  if (rawTokens.some((token) => IDENTIFIER_TOKEN.test(token))) return true
  const tokens = tokenize(query)
  if (tokens.length >= 20) return true
  if (
    tokens.length >= 8 &&
    !/[^\p{ASCII}]/u.test(query) &&
    !tokens.some((token) => FUNCTION_WORDS.has(token))
  ) {
    return true
  }
  return false
}

// File extensions that look like top-level domains in a query ("skill.md").
const FILE_EXTENSIONS = new Set([
  'cfg',
  'css',
  'csv',
  'env',
  'exe',
  'gif',
  'go',
  'gz',
  'htm',
  'html',
  'ini',
  'ipynb',
  'java',
  'jpeg',
  'jpg',
  'js',
  'json',
  'lock',
  'log',
  'md',
  'mdx',
  'pdf',
  'php',
  'png',
  'py',
  'rb',
  'rs',
  'svg',
  'tar',
  'toml',
  'ts',
  'txt',
  'xml',
  'yaml',
  'yml',
  'zip',
])

// Suffixes that, as the last word of a two-word query, usually spell a
// domain ("skills sh" for skills.sh). Common English words such as "app",
// "ai" and "me" are left out because they are ordinary query words too.
const SPOKEN_DOMAIN_SUFFIXES = new Set([
  'com',
  'gg',
  'io',
  'net',
  'org',
  'sh',
  'xyz',
])

const NAVIGATION_WORDS = new Set([
  'account',
  'dashboard',
  'directory',
  'homepage',
  'login',
  'official',
  'portal',
  'signin',
  'site',
  'website',
])

// Large platforms whose name, followed only by a product name or version,
// usually looks for that platform ("google gemini 3").
const PLATFORM_NAMES = new Set([
  'amazon',
  'anthropic',
  'apple',
  'aws',
  'chatgpt',
  'facebook',
  'github',
  'google',
  'instagram',
  'meta',
  'microsoft',
  'nvidia',
  'openai',
  'reddit',
  'youtube',
])

// Words that turn a platform query into a topic the property can answer.
const TOPIC_WORDS = new Set([
  'alternative',
  'alternatives',
  'api',
  'benchmark',
  'compare',
  'comparison',
  'cost',
  'docs',
  'example',
  'examples',
  'free',
  'guide',
  'how',
  'example',
  'install',
  'integration',
  'local',
  'price',
  'pricing',
  'review',
  'sdk',
  'tutorial',
  'vs',
  'what',
])

const DOMAIN_TOKEN = /^(?:[a-z0-9-]+\.)+([a-z]{2,})$/

function siteHosts(siteUrl: string): string[] {
  const host =
    siteUrl
      .trim()
      .toLowerCase()
      .replace(/^sc-domain:/, '')
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0]
      ?.replace(/^www\./, '') ?? ''
  return host ? [host] : []
}

function isOwnHost(token: string, hosts: string[]): boolean {
  const value = token.replace(/^www\./, '')
  return hosts.some(
    (host) =>
      value === host ||
      value.endsWith(`.${host}`) ||
      host.endsWith(`.${value}`),
  )
}

/**
 * Heuristic: the query looks navigational to a site other than the property.
 * Rows the caller already treats as brand should not be passed in.
 */
export function isLikelyNavigationalOtherQuery(
  query: string,
  context: { siteUrl: string },
): boolean {
  const lower = query.trim().toLowerCase()
  const rawTokens = lower.split(/\s+/).filter(Boolean)
  const hosts = siteHosts(context.siteUrl)
  for (const token of rawTokens) {
    const cleaned = token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    const match = DOMAIN_TOKEN.exec(cleaned)
    if (
      match &&
      !FILE_EXTENSIONS.has(match[1] ?? '') &&
      !isOwnHost(cleaned, hosts)
    ) {
      return true
    }
  }
  const tokens = tokenize(query)
  if (!tokens.length) return false
  const last = tokens.at(-1) ?? ''
  if (tokens.length === 2 && SPOKEN_DOMAIN_SUFFIXES.has(last)) {
    const spoken = `${tokens[0]}.${last}`
    return !isOwnHost(spoken, hosts)
  }
  if (tokens.length <= 3 && tokens.length >= 2 && NAVIGATION_WORDS.has(last)) {
    return true
  }
  if (
    tokens.length >= 2 &&
    tokens.length <= 4 &&
    PLATFORM_NAMES.has(tokens[0] ?? '') &&
    !tokens.some((token) => TOPIC_WORDS.has(token))
  ) {
    return true
  }
  if (tokens.length === 1 && /^[a-z]{3,6}$/.test(tokens[0] ?? '')) {
    return true
  }
  return false
}

/** Heuristic query flags, in a fixed order. */
export function queryFlags(
  query: string,
  context: { siteUrl: string },
): QueryFlag[] {
  const flags: QueryFlag[] = []
  if (isLikelyAutomatedQuery(query)) flags.push('likely-automated')
  if (isLikelyNavigationalOtherQuery(query, context)) {
    flags.push('navigational-other')
  }
  return flags
}

/** Sort helper: rows with any flag rank after rows with none. */
export function compareQueryFlags(
  left: readonly QueryFlag[],
  right: readonly QueryFlag[],
): number {
  return Number(left.length > 0) - Number(right.length > 0)
}

export type QueryFlagCounts = {
  likelyAutomatedRows: number
  navigationalOtherRows: number
  flaggedRows: number
}

export function countQueryFlags(
  items: ReadonlyArray<{ queryFlags: readonly QueryFlag[] }>,
): QueryFlagCounts {
  let likelyAutomatedRows = 0
  let navigationalOtherRows = 0
  let flaggedRows = 0
  for (const item of items) {
    if (item.queryFlags.length) flaggedRows++
    if (item.queryFlags.includes('likely-automated')) likelyAutomatedRows++
    if (item.queryFlags.includes('navigational-other')) navigationalOtherRows++
  }
  return { likelyAutomatedRows, navigationalOtherRows, flaggedRows }
}
