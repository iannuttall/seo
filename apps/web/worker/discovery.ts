import { readJson } from '@seo/core/hosted'

// Where people find SEO Skill: the daily skills.sh check, npm downloads and
// the sources of hosted sign-ups. The stats endpoint in index.ts reads them.

export type StatsRow = Record<string, unknown>

export type NpmDay = { day: string; downloads: number }

// Where hosted sign-ups came from, all time, as totals. Any value held by
// fewer than SIGNUP_MIN_GROUP sign-ups is counted under "Other", so no row
// stands for one person.
export type Signups = {
  total: number
  since: string | null
  source: Array<{ name: string; count: number; percent: number }>
  entry: Array<{ name: string; count: number; percent: number }>
  client: Array<{ name: string; count: number; percent: number }>
  landing: Array<{ name: string; count: number; percent: number }>
}

export function rowString(row: StatsRow, field: string): string {
  return typeof row[field] === 'string' ? row[field] : ''
}

export function rowCount(row: StatsRow): number {
  const value = row.count
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function percentage(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1_000) / 10
}

const SIGNUP_MIN_GROUP = 3

// Folds rows of [name, count] into a sorted share list, with small groups
// under "Other" (always last).
function shares(
  rows: Array<[string, number]>,
  total: number,
): Signups['source'] {
  const totals = new Map<string, number>()
  for (const [name, count] of rows) {
    totals.set(name, (totals.get(name) ?? 0) + count)
  }
  let other = 0
  const kept: Array<{ name: string; count: number }> = []
  for (const [name, count] of totals) {
    if (count < SIGNUP_MIN_GROUP || name === 'Other') other += count
    else kept.push({ name, count })
  }
  kept.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  if (other > 0) kept.push({ name: 'Other', count: other })
  return kept.map((item) => ({
    ...item,
    percent: percentage(item.count, total) ?? 0,
  }))
}

const SEARCH_ENGINES: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)skills\.sh$/, 'skills.sh'],
  [/(^|\.)npmjs\.com$/, 'npm'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'X'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)ycombinator\.com$/, 'Hacker News'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
]

function siteName(host: string): string {
  const clean = host.toLowerCase().replace(/^www\./, '')
  return SEARCH_ENGINES.find(([pattern]) => pattern.test(clean))?.[1] ?? clean
}

function clientName(row: StatsRow): string {
  const name = (
    rowString(row, 'client_name') || rowString(row, 'client')
  ).toLowerCase()
  if (!name) {
    const entry = rowString(row, 'entry')
    return entry === 'web' ? 'No agent (account page)' : 'Not detected'
  }
  if (name.includes('claude code') || name.includes('claude-code'))
    return 'Claude Code'
  if (name.includes('claude')) return 'Claude'
  if (name.includes('codex')) return 'Codex'
  if (name.includes('cursor')) return 'Cursor'
  if (name.includes('chatgpt') || name.includes('openai')) return 'ChatGPT'
  if (name.includes('antigravity')) return 'Antigravity'
  if (name.includes('gemini')) return 'Gemini'
  if (name.includes('copilot') || name.includes('vscode')) return 'VS Code'
  if (name.includes('windsurf')) return 'Windsurf'
  if (/\bamp\b/.test(name)) return 'Amp'
  return 'Other'
}

const ENTRY_NAMES: Record<string, string> = {
  mcp: 'MCP client sign-in',
  web: 'Account page',
  cli: 'seo login',
}

// Groups the stored sign-up source rows (already counted per distinct
// combination) into the four public share lists.
export function signupSources(rows: StatsRow[]): Signups {
  const total = rows.reduce((sum, row) => sum + rowCount(row), 0)
  const pick = (name: (row: StatsRow) => string) =>
    shares(
      rows.map((row) => [name(row), rowCount(row)]),
      total,
    )
  const firstDay = rows
    .map((row) => rowString(row, 'first_day'))
    .filter(Boolean)
    .sort()[0]
  return {
    total,
    since: firstDay ?? null,
    source: pick((row) => {
      const utm = rowString(row, 'utm_source')
      const host = rowString(row, 'referrer_host')
      if (!rowString(row, 'landing_path')) return 'No site visit recorded'
      if (utm) return siteName(utm)
      if (host) return siteName(host)
      return 'Direct or hidden referrer'
    }),
    entry: pick((row) => ENTRY_NAMES[rowString(row, 'entry')] ?? 'Other'),
    client: pick(clientName),
    landing: pick(
      (row) => rowString(row, 'landing_path') || 'No site visit recorded',
    ),
  }
}

// What people and agents type into `npx skills find`. The daily check
// records where iannuttall/seo shows for each.
export const SKILL_QUERIES = [
  'seo',
  'seo audit',
  'seo mcp',
  'search console',
  'google search console',
  'search console mcp',
  'gsc',
  'traffic drop',
  'keyword research',
  'google analytics',
  'content decay',
  'cannibalization',
  'indexing',
  'dataforseo',
  'ahrefs',
  'seo skill',
  'technical seo',
  'site audit',
  'crawl',
  'backlinks',
  'rank tracking',
  'ai search',
  'llms.txt',
  'programmatic seo',
  'sitemap',
  'core web vitals',
  'bing webmaster',
] as const

const SKILL_SOURCE = 'iannuttall/seo'

type SkillHit = { source?: unknown; installs?: unknown }

async function searchSkills(
  query: string,
  owner?: string,
): Promise<SkillHit[]> {
  const params = new URLSearchParams({ q: query, limit: '50' })
  if (owner) params.set('owner', owner)
  const response = await fetch(`https://skills.sh/api/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`skills.sh answered ${response.status}`)
  const json = await readJson<{ skills?: SkillHit[] }>(response, 'skills.sh', {
    maxBytes: 1_000_000,
  })
  return Array.isArray(json.skills) ? json.skills : []
}

// The skills.sh leaderboards list 200 skills a page. All time is sorted by
// installs, so the scan stops once a page ends below the skill's count.
const BOARD_PAGES = { 'all-time': 10, trending: 5 } as const
const BOARD_PAGE_SIZE = 200

async function boardRank(
  board: keyof typeof BOARD_PAGES,
  ownInstalls: number | null,
): Promise<{ rank: number | null; checked: number; total: number | null }> {
  let checked = 0
  let total: number | null = null
  for (let page = 0; page < BOARD_PAGES[board]; page += 1) {
    const response = await fetch(
      `https://skills.sh/api/skills/${board}/${page}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!response.ok) throw new Error(`skills.sh answered ${response.status}`)
    const json = await readJson<{
      skills?: SkillHit[]
      total?: unknown
      hasMore?: unknown
    }>(response, 'skills.sh', { maxBytes: 2_000_000 })
    const hits = Array.isArray(json.skills) ? json.skills : []
    if (typeof json.total === 'number') total = json.total
    const index = hits.findIndex((hit) => hit.source === SKILL_SOURCE)
    if (index >= 0) return { rank: checked + index + 1, checked, total }
    checked += hits.length
    const last = Number(hits.at(-1)?.installs ?? 0)
    if (hits.length < BOARD_PAGE_SIZE || json.hasMore === false) break
    if (board === 'all-time' && ownInstalls !== null && last < ownInstalls)
      break
  }
  return { rank: null, checked, total }
}

// Once a day: the install count, and the place `npx skills find` shows the
// skill for each query (the CLI sorts matches by installs).
export async function recordSkills(env: Env, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10)
  const installs = (hits: SkillHit[]) => {
    const value = hits.find((hit) => hit.source === SKILL_SOURCE)?.installs
    return typeof value === 'number' ? value : null
  }
  const own = await searchSkills('seo', 'iannuttall').catch(() => [])
  const rows: {
    query: string
    position: number | null
    installs: number | null
  }[] = [{ query: '', position: null, installs: installs(own) }]
  for (const query of SKILL_QUERIES) {
    const hits = await searchSkills(query).catch(() => null)
    if (!hits) continue
    const sorted = [...hits].sort(
      (a, b) => Number(b.installs ?? 0) - Number(a.installs ?? 0),
    )
    const index = sorted.findIndex((hit) => hit.source === SKILL_SOURCE)
    rows.push({
      query,
      position: index >= 0 ? index + 1 : null,
      installs: installs(hits),
    })
  }
  const boards = []
  for (const board of ['all-time', 'trending'] as const) {
    const result = await boardRank(board, rows[0]?.installs ?? null).catch(
      () => null,
    )
    if (result) boards.push({ board, ...result })
  }
  await env.TELEMETRY_DB.batch([
    ...rows.map((row) =>
      env.TELEMETRY_DB.prepare(
        `INSERT OR REPLACE INTO skills_daily (day, query, position, installs)
         VALUES (?1, ?2, ?3, ?4)`,
      ).bind(day, row.query, row.position, row.installs),
    ),
    ...boards.map((row) =>
      env.TELEMETRY_DB.prepare(
        `INSERT OR REPLACE INTO skills_ranks (day, board, rank, checked, total)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(day, row.board, row.rank, row.checked, row.total),
    ),
  ])
}

// npm's public download counts for the package, one row per day. Null when
// npm does not answer, so a failed call never reads as zero downloads.
export async function npmDownloads(sinceDay: string): Promise<NpmDay[] | null> {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const response = await fetch(
      `https://api.npmjs.org/downloads/range/${sinceDay}:${today}/seo`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!response.ok) return null
    const json = await readJson<{ downloads?: unknown }>(response, 'npm', {
      maxBytes: 200_000,
    })
    if (!Array.isArray(json.downloads)) return null
    return json.downloads
      .flatMap((row: { day?: unknown; downloads?: unknown }) =>
        typeof row.day === 'string' && typeof row.downloads === 'number'
          ? [{ day: row.day, downloads: row.downloads }]
          : [],
      )
      .sort((a, b) => a.day.localeCompare(b.day))
  } catch {
    return null
  }
}

// Visits to seoskill.dev as Clicky counts them, in the Clicky site's time
// zone: one row per day for 90 days, and the last 30 days by traffic source,
// referring site, search engine and landing page. Values held by fewer than
// three visits count as Other. Null without a sitekey or when Clicky fails,
// so a failed call never reads as zero visits.
export type Traffic = {
  days: Array<{ day: string; visits: number }>
  total: number
  sources: Signups['source']
  referrers: Signups['source']
  engines: Signups['source']
  landing: Signups['source']
  // Clicky returned its row limit for a list, so rows past it are missing.
  capped: boolean
}

type ClickyGroup = {
  type?: string
  error?: string
  dates?: Array<{ date?: string; items?: Array<Record<string, unknown>> }>
}

const CLICKY_LIMIT = 1000

async function clicky(
  siteId: string,
  sitekey: string,
  params: Record<string, string>,
): Promise<ClickyGroup[]> {
  const url = new URL('https://api.clicky.com/api/stats/4')
  url.search = new URLSearchParams({
    site_id: siteId,
    sitekey,
    output: 'json',
    app: 'seo',
    limit: String(CLICKY_LIMIT),
    ...params,
  }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`Clicky answered ${response.status}`)
  const groups = await readJson<ClickyGroup[]>(response, 'Clicky', {
    maxBytes: 2_000_000,
  })
  if (!Array.isArray(groups) || groups.some((group) => group?.error)) {
    throw new Error('Clicky returned an error')
  }
  return groups
}

const visits = (item: Record<string, unknown>) => {
  const value = Number(item.value)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export async function clickyTraffic(
  siteId: string,
  sitekey: string | undefined,
): Promise<Traffic | null> {
  if (!sitekey) return null
  try {
    const [daily, lists] = await Promise.all([
      clicky(siteId, sitekey, {
        type: 'visitors',
        daily: '1',
        date: 'last-90-days',
      }),
      clicky(siteId, sitekey, {
        type: 'traffic-sources,links-domains,searches-engines,pages-entrance',
        date: 'last-30-days',
      }),
    ])
    const items = (type: string) =>
      lists.find((group) => group.type === type)?.dates?.[0]?.items ?? []
    let capped = false
    const list = (
      type: string,
      name: (item: Record<string, unknown>) => string,
    ) => {
      const rows = items(type)
      if (rows.length >= CLICKY_LIMIT) capped = true
      const pairs = rows.map(
        (item) => [name(item) || 'Unknown', visits(item)] as [string, number],
      )
      return shares(
        pairs,
        pairs.reduce((sum, [, count]) => sum + count, 0),
      )
    }
    const title = (item: Record<string, unknown>) =>
      typeof item.title === 'string' ? item.title.replace(/^www\./, '') : ''
    const days = (daily[0]?.dates ?? [])
      .flatMap((date) =>
        typeof date.date === 'string'
          ? [{ day: date.date, visits: visits(date.items?.[0] ?? {}) }]
          : [],
      )
      .sort((a, b) => a.day.localeCompare(b.day))
    const sources = list('traffic-sources', title)
    return {
      days,
      total: sources.reduce((sum, item) => sum + item.count, 0),
      sources,
      referrers: list('links-domains', title),
      engines: list('searches-engines', (item) =>
        siteName(typeof item.title === 'string' ? item.title : ''),
      ),
      landing: list('pages-entrance', (item) => {
        try {
          return new URL(String(item.url)).pathname
        } catch {
          return ''
        }
      }),
      capped,
    }
  } catch {
    return null
  }
}
