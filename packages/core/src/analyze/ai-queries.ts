import { isBrandQuery } from '../brand.js'
import { editsWithin, resolveReportBrandTerms } from '../brand-evidence.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { shiftIsoDate } from '../gsc/dates.js'
import type { GscRow } from '../types.js'

// Search Console queries with the shape of AI conversations and agent
// searches: replies such as "yes go on", follow-ups, agent prompts, search
// operators, chat phrasing and very long questions. Search Console does not
// mark AI Mode or AI Overviews, and its API has no Generative AI data, so
// this is a pattern match on the query text and a heuristic.

export type AiQueryKind =
  | 'agent_prompt'
  | 'tracker'
  | 'reply'
  | 'follow_up'
  | 'operator'
  | 'pronoun'
  | 'chat'
  | 'long'

// In order: the first kind that matches wins. Each pattern is valid in both
// JavaScript and RE2, so the same text filters rows at Google.
const RULES: [AiQueryKind, string][] = [
  [
    'agent_prompt',
    '^(search the web for|browse the web|find sources)|do not invent|return the [0-9]+ most relevant|include source urls|context: location|do not include location|question: |reply only with|the model you are using',
  ],
  ['tracker', '\\. ?my location is |\\?\\. ?my( |$)|^evaluate the .+ on '],
  [
    'reply',
    '^(yes|yeah|yep|ok|okay|sure|yes please|go on|continue|keep going|tell me more|why not|how so|really|exactly|show me|and then|thanks|thank you|got it|what else|anything else)[?!.,]*$',
  ],
  [
    'follow_up',
    '^(what|how) about .{1,40}$|^(and|so|ok so|okay so|but) (what|which|how|why) ',
  ],
  [
    'operator',
    '(^|\\s)-?(site|before|after|intitle|inurl|intext|filetype):|"[^"]*" or "',
  ],
  ['pronoun', '\\b(it|its|they|them|their|this|these|those)\\b'],
  [
    'chat',
    '\\b(please|can you|could you|give me|show me|tell me|i want|i need|i have|i am|should i|do i need|is it worth|help me|walk me through)\\b|^(what|how|why|is|does|can|will|would) (it|that|this|they)\\b',
  ],
  ['long', '^(\\S+\\s+){9,}\\S+$'],
]

export const AI_QUERY_KINDS: Record<AiQueryKind, string> = {
  agent_prompt: 'text from an agent prompt, such as "search the web for"',
  tracker: 'a visibility-tool probe, such as "my location is"',
  reply: 'a bare reply, such as "yes" or "tell me more"',
  follow_up: 'a follow-up, such as "what about …"',
  operator: 'search operators, such as site:, before: or "a" or "b"',
  pronoun:
    'a pronoun with nothing named, such as "how much is it" or "do they ship to canada", so likely a follow-up in a conversation',
  chat: 'chat phrasing, such as "can you" or "should i"',
  long: 'ten or more words with no other sign',
}

const MATCHERS = RULES.map(
  ([kind, pattern]) => [kind, new RegExp(pattern)] as const,
)

export const AI_QUERY_PATTERN = RULES.map(
  ([, pattern]) => `(?:${pattern})`,
).join('|')

// Rows that match a pattern but are not anything a person or an agent
// asked: letters split by spaces, text broken by a wrong encoding, and text
// pasted from a tool or an agent's own output. They are left out and
// counted.
export type AiQueryNoise = 'spaced_letters' | 'broken_encoding' | 'pasted_text'

const NOISE: [AiQueryNoise, RegExp][] = [
  ['spaced_letters', /(^|\s)(\S\s){3,}\S(\s|$)/u],
  [
    'broken_encoding',
    /^(яю|ÿþ|þÿ)|&#[0-9]+;?|&[a-z]+;|[âÃÂ][\u0080-\u00bf€™œ“”]|\ufffd/u,
  ],
  [
    'pasted_text',
    // A leftover "p" from a <p> tag, an agent's own reply, a tool's status.
    /^(p [a-z]{3,} |here (are|is) (all )?the |here's the |done[,.!]? (you|here) |current state: )/u,
  ],
]

export function aiQueryNoise(query: string): AiQueryNoise | null {
  const text = query.trim().toLowerCase()
  return NOISE.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

// A question that stands on its own, so an AI engine can be asked it
// as it is: chat or long, and it opens with a question word or a request
// such as "i need", or ends with a question mark. Statements, pasted lists
// and tool text are not.
export const QUESTION =
  /^(how|what|what's|whats|which|why|when|where|who|is|are|can|could|does|do|should|would|will|i need|i want|i have|i'm looking|we need|we want)\b|\?$/u
const ASKABLE_KINDS = new Set<AiQueryKind>(['chat', 'long'])
const PROMPT_CHARACTERS = 500

export function askable(query: string, kind: AiQueryKind | undefined) {
  const text = query
    .trim()
    .toLowerCase()
    .replace(/^["'“]+/u, '')
  return (
    Boolean(kind && ASKABLE_KINDS.has(kind)) &&
    text.length <= PROMPT_CHARACTERS &&
    QUESTION.test(text)
  )
}

// A pronoun that points back at something said earlier, in a query under
// ten words. Pronouns before a time word ("this week") and the "it" of
// time, weather, distance and "is it safe to" are not references.
const PRONOUNS = /\b(it|its|they|them|their|this|these|those)\b/gu
const TIME_WORD =
  /\b(this|these|those) (morning|evening|afternoon|night|day|date|week|weekend|month|year|time)\b/gu
const DUMMY_IT =
  /\b(now|rn|atm|tn|tdy|tmr|tmrw|tonite|yday|currently|to ?n?ight|to day|lastn\S*|(last|past|next|this) \S+|(mon|tues|wednes|thurs|fri|satur|sun)day|outside|dark|sunny|raining|snowing|o'?clock)\b|\bit (take|takes|took)\b.*\b(to|for)\b|\b(far|miles|km) (is|was) it (to|from|around|between)\b|\bis it (\S+ )?(safe|legal|illegal|possible|ok|okay|bad|good|better|best|hard|easy|normal|necessary|true|cheaper|rude|wise) (to|for|if)\b/u
// "it" that a person types with nothing said before: naming the thing and
// asking which one it is ("what moon is it", "what day is it"), or whether
// it is a named thing ("was it a full moon", "is it a bank holiday"). A
// class word such as name or brand is still a follow-up ("is it a common
// name"): the thing itself is not named.
const IDENTIFY_IT =
  /^(what|which)( (kind|type|sort) of)?( \S+){1,2} (is|was) it\b|^(is|was) it (a|an|the) /u
const CLASS_WORD =
  /\b(name|surname|names|word|thing|one|company|brand|product|place|site|website|app|scam|service)\b/u
const PRONOUN_WORDS = 10
// Time words, also with a typing slip ("tofay", "tommorow").
const DAYS = ['today', 'tonight', 'tomorrow', 'yesterday']

function pointsBack(text: string): boolean {
  const tokens = text.split(/\s+/u)
  if (tokens.length >= PRONOUN_WORDS) return false
  // "its" after a word belongs to a noun in the same query ("get its name").
  const found =
    text
      .replace(TIME_WORD, ' ')
      .replace(/(?<!^)\bits\b/gu, ' ')
      .match(PRONOUNS) ?? []
  if (!found.length) return false
  if (!found.every((word) => word === 'it' || word === 'its')) return true
  return !(
    DUMMY_IT.test(text) ||
    (IDENTIFY_IT.test(text) && !CLASS_WORD.test(text)) ||
    tokens.some(
      (token) =>
        token.length >= 4 &&
        DAYS.some((day) => editsWithin(token, day, day.length >= 8 ? 2 : 1)),
    )
  )
}

// With the site's brand terms, a pronoun query that names the brand is not
// a follow-up: the person said who they meant.
export function aiQueryKind(
  query: string,
  brandTerms: string[] = [],
): AiQueryKind | null {
  const text = query.trim().toLowerCase()
  return (
    MATCHERS.find(
      ([kind, pattern]) =>
        pattern.test(text) &&
        (kind !== 'pronoun' ||
          (pointsBack(text) && !isBrandQuery(text, brandTerms))),
    )?.[0] ?? null
  )
}

const STOP = new Set(
  'the and for with that this what which who how why when where are is was can does do did you your our from about into than then them they their there have has had will would should could not but its it’s me my i am of to in on at by or an as be if so'.split(
    ' ',
  ),
)

// The words that carry a query's meaning, so rewordings of one question
// share them.
function words(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP.has(word))
      .map((word) =>
        word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word,
      ),
  )
}

const SAME_QUESTION = 0.6
const BRAND_ROWS = 5_000
// Follow-up trails use the last 28 days of the range, by date, query and
// page, so the rows stay under the cap on a busy site.
const TRAIL_DAYS = 28
const TRAILS_KEPT = 50
const TURNS = new Set<AiQueryKind>(['reply', 'follow_up', 'pronoun'])
const TURN_PATTERN = RULES.filter(([kind]) => TURNS.has(kind))
  .map(([, pattern]) => `(?:${pattern})`)
  .join('|')
const MAX_ROWS = 25_000
const EXAMPLES = 3

type Group = {
  words: Set<string>
  queries: Map<string, number>
  pages: Map<string, number>
  kinds: Map<AiQueryKind, number>
  clicks: number
  impressions: number
  positionWeight: number
}

// Groups checked for each query before it starts a group of its own.
const CANDIDATES = 200

// Shared words over all words, each weighted by how rare it is among these
// queries, so the name in "people named james" counts for more than
// "people" and "named".
const overlap = (
  a: Set<string>,
  b: Set<string>,
  weight: (word: string) => number,
) => {
  let shared = 0
  let union = 0
  for (const word of a) {
    union += weight(word)
    if (b.has(word)) shared += weight(word)
  }
  for (const word of b) if (!a.has(word)) union += weight(word)
  return union ? shared / union : 0
}

type TrailDay = {
  date: string
  page: string
  impressions: number
  // One wording per question, with its impressions.
  questions: Map<unknown, { query: string; impressions: number }>
}

// Follow-up turns (a pronoun with nothing named, a bare reply, "what
// about …") joined by page and day: two or more different questions on one
// page on one day make a trail. Search Console has no sessions, so this is
// a heuristic and may join different people.
function trailsOf(
  rows: GscRow[],
  brandTerms: string[],
  questionOf: (text: string) => unknown,
) {
  const days = new Map<string, TrailDay>()
  for (const row of rows) {
    const [date = '', query = '', page = ''] = row.keys.map(String)
    const text = query.trim().toLowerCase()
    const kind = aiQueryKind(text, brandTerms)
    if (!kind || !TURNS.has(kind) || aiQueryNoise(text)) continue
    const key = `${date} ${page}`
    const day = days.get(key) ?? {
      date,
      page,
      impressions: 0,
      questions: new Map(),
    }
    days.set(key, day)
    const question = questionOf(text) ?? text
    const seen = day.questions.get(question)
    if (!seen || row.impressions > seen.impressions) {
      day.questions.set(question, {
        query: text,
        impressions: row.impressions + (seen?.impressions ?? 0),
      })
    } else seen.impressions += row.impressions
    day.impressions += row.impressions
  }
  const trails = [...days.values()]
    .filter((day) => day.questions.size >= 2)
    .map((day) => ({
      date: day.date,
      page: day.page,
      turns: day.questions.size,
      impressions: day.impressions,
      queries: [...day.questions.values()]
        .sort(
          (a, b) =>
            b.impressions - a.impressions || a.query.localeCompare(b.query),
        )
        .map((turn) => turn.query),
    }))
    .sort(
      (a, b) =>
        b.turns - a.turns ||
        b.impressions - a.impressions ||
        b.date.localeCompare(a.date) ||
        a.page.localeCompare(b.page),
    )
  const pages = new Map<
    string,
    { trails: number; days: Set<string>; asked: Map<string, number> }
  >()
  for (const trail of trails) {
    const entry = pages.get(trail.page) ?? {
      trails: 0,
      days: new Set(),
      asked: new Map(),
    }
    pages.set(trail.page, entry)
    entry.trails += 1
    entry.days.add(trail.date)
    for (const query of trail.queries) {
      entry.asked.set(query, (entry.asked.get(query) ?? 0) + 1)
    }
  }
  const byPage = [...pages]
    .map(([page, entry]) => ({
      page,
      trails: entry.trails,
      days: entry.days.size,
      followUps: [...entry.asked]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, EXAMPLES)
        .map(([query]) => query),
    }))
    .sort((a, b) => b.trails - a.trails || a.page.localeCompare(b.page))
  return {
    trailCount: trails.length,
    pageCount: byPage.length,
    byPage: byPage.slice(0, 10),
    trails: trails.slice(0, TRAILS_KEPT),
  }
}

const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places

export async function aiQueriesReport(
  input: { site: string; startDate: string; endDate: string },
  searchAnalytics: SearchAnalyticsQuery,
): Promise<Record<string, unknown>> {
  const range = { startDate: input.startDate, endDate: input.endDate }
  const trailRange = {
    startDate: [input.startDate, shiftIsoDate(input.endDate, 1 - TRAIL_DAYS)]
      .sort()
      .at(-1) as string,
    endDate: input.endDate,
  }
  const [matched, site, named, daily] = await Promise.all([
    searchAnalytics(input.site, {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: MAX_ROWS,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'query',
              operator: 'includingRegex',
              expression: AI_QUERY_PATTERN,
            },
          ],
        },
      ],
    }),
    searchAnalytics(input.site, {
      ...range,
      dimensions: [],
      type: 'web',
      dataState: 'final',
    }),
    // The top queries by clicks, where the site's own name and its
    // spellings are, for the brand terms.
    searchAnalytics(input.site, {
      ...range,
      dimensions: ['query'],
      type: 'web',
      dataState: 'final',
      maxRows: BRAND_ROWS,
    }),
    searchAnalytics(input.site, {
      ...trailRange,
      dimensions: ['date', 'query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: MAX_ROWS,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'query',
              operator: 'includingRegex',
              expression: TURN_PATTERN,
            },
          ],
        },
      ],
    }),
  ])
  const brand = resolveReportBrandTerms({
    siteUrl: input.site,
    rows: named.rows,
  })

  // Biggest first, so each group is named after its most seen wording.
  const rows = [...matched.rows].sort(
    (a, b) =>
      b.impressions - a.impressions ||
      String(a.keys[0]).localeCompare(String(b.keys[0])) ||
      String(a.keys[1]).localeCompare(String(b.keys[1])),
  )
  // How many different queries use each word.
  const usage = new Map<string, number>()
  const unique = new Set(rows.map((row) => String(row.keys[0] ?? '')))
  for (const query of unique) {
    for (const word of words(query)) usage.set(word, (usage.get(word) ?? 0) + 1)
  }
  const weight = (word: string) =>
    Math.log((unique.size + 1) / (usage.get(word) ?? 1))
  const groups: Group[] = []
  const byWord = new Map<string, Group[]>()
  const byText = new Map<string, Group>()
  const kindOf = new Map<string, AiQueryKind>()
  const noise = new Map<AiQueryNoise, Set<string>>()
  const namesBrand = new Set<string>()
  for (const row of rows) {
    const query = String(row.keys[0] ?? '')
    const page = String(row.keys[1] ?? '')
    const kind = aiQueryKind(query, brand.terms)
    if (kind !== 'pronoun' && aiQueryKind(query) === 'pronoun') {
      namesBrand.add(query.trim().toLowerCase())
    }
    if (!kind) continue
    const junk = aiQueryNoise(query)
    if (junk) {
      const seen = noise.get(junk) ?? new Set()
      seen.add(query.trim().toLowerCase())
      noise.set(junk, seen)
      continue
    }
    const text = query.trim().toLowerCase()
    const own = words(query)
    let group = byText.get(text)
    if (!group) {
      let checked = 0
      for (const word of own) {
        for (const candidate of byWord.get(word) ?? []) {
          if (++checked > CANDIDATES) break
          if (overlap(own, candidate.words, weight) >= SAME_QUESTION) {
            group = candidate
            break
          }
        }
        if (group || checked > CANDIDATES) break
      }
    }
    if (!group) {
      group = {
        words: own,
        queries: new Map(),
        pages: new Map(),
        kinds: new Map(),
        clicks: 0,
        impressions: 0,
        positionWeight: 0,
      }
      groups.push(group)
      for (const word of own) {
        const list = byWord.get(word) ?? []
        list.push(group)
        byWord.set(word, list)
      }
    }
    byText.set(text, group)
    if (!kindOf.has(text)) {
      kindOf.set(text, kind)
      group.kinds.set(kind, (group.kinds.get(kind) ?? 0) + 1)
    }
    group.queries.set(query, (group.queries.get(query) ?? 0) + row.impressions)
    group.pages.set(page, (group.pages.get(page) ?? 0) + row.impressions)
    group.clicks += row.clicks
    group.impressions += row.impressions
    group.positionWeight += row.position * row.impressions
  }

  const byKind = new Map<
    AiQueryKind,
    { queries: number; impressions: number }
  >()
  for (const kind of kindOf.values()) {
    const entry = byKind.get(kind) ?? { queries: 0, impressions: 0 }
    entry.queries += 1
    byKind.set(kind, entry)
  }
  for (const row of rows) {
    const kind = kindOf.get(
      String(row.keys[0] ?? '')
        .trim()
        .toLowerCase(),
    )
    const entry = kind && byKind.get(kind)
    if (entry) entry.impressions += row.impressions
  }
  const queries = kindOf.size
  const impressions = groups.reduce((sum, g) => sum + g.impressions, 0)
  const clicks = groups.reduce((sum, g) => sum + g.clicks, 0)
  const total = site.rows[0] ?? { clicks: 0, impressions: 0 }
  const items = groups
    .map((group) => {
      const most = (map: Map<string, number>) =>
        [...map]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([name]) => name)
      const [first, ...rest] = most(group.queries)
      const kind = [...group.kinds].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0]
      return {
        query: first ?? '',
        page: most(group.pages)[0] ?? '',
        askable: askable(first ?? '', kind),
        pages: group.pages.size,
        kind,
        wordings: group.queries.size,
        impressions: group.impressions,
        clicks: group.clicks,
        ctr: group.impressions ? round(group.clicks / group.impressions, 4) : 0,
        position: group.impressions
          ? round(group.positionWeight / group.impressions, 1)
          : 0,
        otherWordings: rest.slice(0, EXAMPLES),
      }
    })
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.wordings - a.wordings ||
        a.query.localeCompare(b.query) ||
        a.page.localeCompare(b.page),
    )
  const pct = (part: number, whole: number) =>
    whole ? round((part / whole) * 100, 1) : null
  const kinds = [...byKind]
    .sort(
      (a, b) => b[1].impressions - a[1].impressions || a[0].localeCompare(b[0]),
    )
    .map(([kind, entry]) => `${kind} ${entry.queries}`)
    .join(', ')
  const leftOut = [...noise]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([reason, seen]) => `${reason.replace('_', ' ')} ${seen.size}`)
    .join(', ')
  const followUps = trailsOf(daily.rows, brand.terms, (text) =>
    byText.get(text),
  )
  const path = (page: string) => page.replace(/^https?:\/\/[^/]+/u, '') || '/'
  const finding = followUps.trailCount
    ? `Follow-up trails, a heuristic, ${trailRange.startDate} to ${trailRange.endDate}: ${followUps.trailCount} on ${followUps.pageCount} ${followUps.pageCount === 1 ? 'page' : 'pages'}, where two or more follow-ups (a pronoun with nothing named, a bare reply, "what about …") reached one page on one day. ${followUps.byPage
        .slice(0, 3)
        .map(
          (entry) =>
            `${path(entry.page)}: ${entry.trails}, such as ${entry.followUps.map((query) => `"${query}"`).join(', ')}`,
        )
        .join(
          '; ',
        )}. Search Console has no sessions, so a trail may join different people; it hides rare queries, so these counts are floors.`
    : `No follow-up trails from ${trailRange.startDate} to ${trailRange.endDate}: no page got two or more follow-ups on one day.`
  const asked = items.filter((item) => item.askable).length
  const capped = matched.rowsFetched >= MAX_ROWS
  return {
    range,
    verdict: queries
      ? `${queries} queries in ${groups.length} questions have the shape of AI conversations or agent searches.`
      : 'No queries with the shape of AI conversations or agent searches.',
    summary: {
      queries,
      questions: groups.length,
      askable: asked,
      leftOut: leftOut || 'none',
      impressions,
      clicks,
      shareOfImpressionsPct: pct(impressions, total.impressions),
      byKind: kinds || 'none',
      ctr: impressions ? round(clicks / impressions, 4) : 0,
      siteCtr: total.impressions
        ? round(total.clicks / total.impressions, 4)
        : 0,
    },
    finding,
    kinds: AI_QUERY_KINDS,
    items,
    followUps: {
      range: trailRange,
      ...followUps,
      namesBrand: namesBrand.size,
      brandTerms: brand.terms,
      capped: daily.rowsFetched >= MAX_ROWS,
    },
    caveats: [
      'A heuristic: these queries match the patterns of AI conversations and agent searches. Search Console does not mark AI Mode or AI Overviews, and people type some of these too.',
      'A minimum: Search Console leaves out rare queries, and these are rare by nature.',
      'pronoun: it, they, this and the like with nothing named, under ten words. Queries that name the site (its brand terms, from its own top queries) and the "it" of time, weather and distance are not counted.',
      'Rewordings of one question are grouped by their shared words; page is the page with the most impressions for it.',
      'Left out and counted, not shown: letters split by spaces, text broken by a wrong encoding, and text pasted from a tool or an agent’s output.',
      'askable: a chat or long question that opens with a question word or a request such as "i need", or ends with a question mark, so an AI engine can be asked it as it is. ai_answers checks the top askable questions only.',
      'Search Console’s Generative AI report is not in its API, so it is not here.',
      ...(capped
        ? [`Capped at the first ${MAX_ROWS} matching query and page rows.`]
        : []),
    ],
  }
}
