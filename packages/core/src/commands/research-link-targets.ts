import { z } from 'zod'
import type { Detail } from './present.js'
import {
  dataForSeoKeys,
  dataForSeoMarket,
  dataForSeoTask,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

// Link and listicle targets: the pages that link to competitors, with the
// words around each link, and the pages AI answers cite beside them. Each
// page gets a context class guessed from its URL and title, so an agent can
// read the right ones first. DataForSEO only. Worker-safe.

// How to turn these pages into outreach, the method in the
// seoskill.dev post on agent link outreach. Shown with both results and in
// seo next's earn-links step.
export const OUTREACH_GUIDE =
  "To turn these into outreach: read each page first. Count how often it names the site and each competitor, check whether it already links to the site, and note its author, when it was last updated and how to reach them (an email address, a contact or submit page, an X handle). For a GitHub awesome list, read its raw README for the names. Quote the exact paragraph where the site's link would fit, and skip the page when no paragraph is better with it. Skip sites that sell links or sponsored posts. Put pages AI answers cite first, then pages that link two or more competitors, then the most recently updated. Give each an angle from the gap on that page and what the business context says the product does best: a page that names the site without a link gets a plain request for the link, and a competitor's own list a request to correct facts. Show the person at most 10, each with the page, the paragraph and the angle. Draft one short email for each one they approve that names the page and paragraph and says what its readers get, with no guest post, link swap or anchor text request. Send nothing until the person has read and approved each email, and send from their own account."

const PAGES = 1000

// full returns every row; summary and rows go a page at a time.
const pageSize = (detail: Detail | undefined, total: number) =>
  detail === 'full' ? Math.max(total, 1) : PAGE_SIZE

export const PAGES_HELP =
  'backlinks and link_gap: linking pages with the words around each link, instead of domains.'

// seo_research's inputs for competitors and linking pages.
export const LINK_INPUTS = {
  competitors: z
    .array(z.string().min(1))
    .max(5)
    .default([])
    .describe('link_gap: 2 to 5 competitor domains. ai_answers: up to 3.'),
  pages: z.boolean().default(false).describe(PAGES_HELP),
}
const ANSWERS = 100
const CONTEXT = 160
export const LINK_TARGET_RIVALS = 3
const PLATFORMS = [
  ['chat_gpt', 'ChatGPT'],
  ['google', 'AI Overviews'],
] as const

const bare = (host: string) =>
  host
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    ?.trim() ?? ''

const within = (host: string, site: string) =>
  host === site || host.endsWith(`.${site}`)

const text = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim()
    : ''

const clip = (value: string, end: 'start' | 'end') =>
  value.length <= CONTEXT
    ? value
    : end === 'start'
      ? `…${value.slice(-CONTEXT)}`
      : `${value.slice(0, CONTEXT)}…`

// What kind of page a link sits on, from its URL and title alone. A guess,
// checked in order, so a casino page that calls itself a review is spam.
export type LinkContext =
  | 'spam'
  | 'app_store'
  | 'github_list'
  | 'github'
  | 'forum'
  | 'podcast'
  | 'listicle'
  | 'directory'
  | 'review'
  | 'article'

const CLASSES: [Exclude<LinkContext, 'article'>, RegExp][] = [
  [
    'spam',
    /\b(casino|slots?|betting|poker|porn|xxx|escort|payday|viagra|cbd|pbn|backlinks? for sale|buy backlinks?|guest ?post(ing)? (service|sites))\b|(^|\.)(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|shorturl\.at)\//,
  ],
  [
    'app_store',
    /(apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoft\.com\/[a-z-]+\/store|apps\.microsoft\.com|npmjs\.com|pypi\.org|formulae\.brew\.sh|setapp\.com\/apps)/,
  ],
  ['github_list', /github\.com\/[^/]+\/[^/]*awesome|awesome[- ]/],
  ['github', /(^|\/\/)(www\.)?(github\.com|gitlab\.com)\//],
  [
    'forum',
    /(reddit\.com|news\.ycombinator\.com|quora\.com|stackexchange\.com|stackoverflow\.com|discourse\.|community\.|forum|\/t\/|\/threads?\/)/,
  ],
  ['podcast', /(podcast|episode|spotify\.com\/episode|podcasts\.apple\.com)/],
  [
    'listicle',
    /\b(best|top \d+|\d+ best|alternatives?|vs\.?|versus|compared?|comparison|roundup)\b/,
  ],
  [
    'directory',
    /(producthunt\.com|alternativeto\.net|saashub\.com|g2\.com|capterra\.|futurepedia|theresanaiforthat|toolify|\bdirector(y|ies)\b|\/tools?\/|\/apps?\/|\/products?\/)/,
  ],
  ['review', /\breviews?\b|hands[- ]on/],
]

export function linkContext(url: string, title: string): LinkContext {
  const haystack = `${url.toLowerCase()} ${title.toLowerCase()}`
  return CLASSES.find(([, test]) => test.test(haystack))?.[0] ?? 'article'
}

const RANK_ORDER: LinkContext[] = [
  'listicle',
  'review',
  'article',
  'github_list',
  'directory',
  'podcast',
  'forum',
  'github',
  'app_store',
]

type PageRow = {
  url: string
  site: string
  title: string
  context: LinkContext
  rivals_linked: number
  links_to: string
  link_text: string
  dofollow: boolean
  domain_rank: number | null
  // Pages on this site in the result; one row stands for them all.
  pages: number
  language: string
}

type Backlink = Record<string, unknown>

function pageRow(links: { rival: string; link: Backlink }[]): PageRow | null {
  const first = links[0]?.link
  if (!first) return null
  const url = text(first.url_from)
  const site = bare(text(first.domain_from) || url)
  if (!url || !site) return null
  const title = text(first.page_from_title)
  const context = linkContext(url, title)
  const shown = links.find(({ link }) => text(link.anchor)) ?? { link: first }
  const pre = text(shown.link.text_pre)
  const post = text(shown.link.text_post)
  const anchor = text(shown.link.anchor) || text(shown.link.url_to)
  const rank = Number(first.domain_from_rank)
  return {
    url,
    site,
    title,
    context,
    rivals_linked: new Set(links.map(({ rival }) => rival)).size,
    links_to: [...new Set(links.map(({ rival }) => rival))].join(' '),
    link_text: [
      pre && clip(pre, 'start'),
      `[${anchor}]`,
      post && clip(post, 'end'),
    ]
      .filter(Boolean)
      .join(' '),
    dofollow: links.some(({ link }) => link.dofollow === true),
    domain_rank: Number.isFinite(rank) ? rank : null,
    pages: 1,
    language: text(first.page_from_language),
  }
}

// A site with this many linking pages in one result publishes them in
// bulk, such as a rival app's alternatives pages or a directory.
export const BULK_PAGES = 5

// Most rivals first, then one-off pages before bulk sites, the kind of
// page, authority, and URL so ties stay put.
const byTarget = (a: PageRow, b: PageRow) =>
  b.rivals_linked - a.rivals_linked ||
  Number(a.pages >= BULK_PAGES) - Number(b.pages >= BULK_PAGES) ||
  RANK_ORDER.indexOf(a.context) - RANK_ORDER.indexOf(b.context) ||
  (b.domain_rank ?? -1) - (a.domain_rank ?? -1) ||
  a.url.localeCompare(b.url)

// One row per site: its best page, English first, with the count of its
// pages, since an outreach email goes to a site, not a page.
export function bySite(rows: PageRow[]): PageRow[] {
  const sites = new Map<string, PageRow[]>()
  for (const row of rows)
    sites.set(row.site, [...(sites.get(row.site) ?? []), row])
  return [...sites.values()]
    .map((pages) => {
      const best = [...pages].sort(
        (a, b) =>
          b.rivals_linked - a.rivals_linked ||
          Number(b.language === 'en') - Number(a.language === 'en') ||
          byTarget(a, b),
      )[0] as PageRow
      return { ...best, pages: pages.length }
    })
    .sort(byTarget)
}

// DataForSEO page_intersection items: one per referring page, each a map
// from target number to the links on that page.
export function intersectionRows(
  items: Record<string, unknown>[],
  rivals: string[],
): PageRow[] {
  return items.flatMap((item) => {
    const byTarget = (item.page_intersection ?? {}) as Record<
      string,
      Backlink[] | null
    >
    const links = Object.entries(byTarget).flatMap(([index, list]) =>
      (list ?? []).map((link) => ({
        rival: rivals[Number(index) - 1] ?? bare(text(link.domain_to)),
        link,
      })),
    )
    const row = pageRow(links)
    return row ? [row] : []
  })
}

// DataForSEO backlinks items for one site, one link per referring page.
export function backlinkRows(items: Backlink[], rival: string): PageRow[] {
  return items.flatMap((link) => {
    const row = pageRow([{ rival, link }])
    return row ? [row] : []
  })
}

function domainList(values: string[]): string[] {
  return [...new Set(values.map(bare).filter((v) => v.includes('.')))]
}

// backlinks or link_gap with pages: the referring pages with the words
// around each link.
export async function runLinkPages(
  input: {
    action: 'backlinks' | 'link_gap'
    target: string
    competitors?: string[]
    offset?: number
    detail?: Detail
  },
  headers: Headers,
  call: (offset: number) => string,
): Promise<CommandResult> {
  const target = bare(input.target)
  if (!target.includes('.')) {
    throw new CommandError(
      'INVALID_INPUT',
      'pages needs a domain as target, such as example.com.',
    )
  }
  const keys = dataForSeoKeys(headers)
  const gap = input.action === 'link_gap'
  const rivals = gap
    ? domainList(input.competitors ?? []).filter((d) => d !== target)
    : [target]
  if (gap && (rivals.length < 2 || rivals.length > 5)) {
    throw new CommandError(
      'INVALID_INPUT',
      'link_gap with pages needs 2 to 5 competitors besides the target.',
    )
  }
  const done = gap
    ? await dataForSeoTask(keys, 'v3/backlinks/page_intersection/live', {
        targets: Object.fromEntries(rivals.map((d, i) => [String(i + 1), d])),
        exclude_targets: [target],
        intersection_mode: 'partial',
        rank_scale: 'one_hundred',
        order_by: ['1.rank,desc'],
        limit: PAGES,
      })
    : await dataForSeoTask(keys, 'v3/backlinks/backlinks/live', {
        target,
        mode: 'one_per_domain',
        rank_scale: 'one_hundred',
        order_by: ['rank,desc'],
        limit: PAGES,
      })
  const items = (done.result?.items as Record<string, unknown>[] | null) ?? []
  const available = Number(done.result?.total_count ?? items.length)
  const all = gap
    ? intersectionRows(items, rivals)
    : backlinkRows(items, target)
  // A page on the target or a rival is the rivals' own site, not a target.
  const own = [target, ...rivals]
  const offSite = all.filter((row) => !own.some((d) => within(row.site, d)))
  const spam = offSite.filter((row) => row.context === 'spam')
  const kept = offSite
    .filter((row) => row.context !== 'spam')
    .filter((row) => !gap || row.rivals_linked >= 2)
  const rows = bySite(kept).map(({ language: _language, ...row }) => row)
  const counts = new Map<string, number>()
  for (const row of rows)
    counts.set(row.context, (counts.get(row.context) ?? 0) + 1)
  const cost = Math.round(done.cost * 10_000) / 10_000
  const offset = input.offset ?? 0
  const notes = [
    gap
      ? `Pages that link to two or more of ${rivals.join(', ')} and not to ${target}, from DataForSEO's backlink index (page_intersection). DataForSEO cost: $${cost}.`
      : `Pages that link to ${target}, one per site, from DataForSEO's backlink index. DataForSEO cost: $${cost}.`,
    ...(available > items.length
      ? [
          `Capped: DataForSEO has ${available.toLocaleString('en-US')} pages; this read the first ${items.length.toLocaleString('en-US')} by rank, so smaller pages can be missing.`,
        ]
      : []),
    `${rows.length} sites from ${kept.length} pages, one row per site with its best page (English first) and pages, the count of its pages here. Sites with ${BULK_PAGES} or more come after one-off pages: they publish lists in bulk, most often a rival app's alternatives pages or a directory. By context: ${[...counts.entries()].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Left out ${spam.length} spam pages and ${all.length - offSite.length} pages on the sites themselves.`,
    'context is a guess from the URL and title: listicle (best, top, alternatives, vs), review, article, github_list (awesome lists), directory, podcast, forum, github or app_store. Many lists are on a competing app’s own site; only reading the page tells them apart.',
    'link_text is the words around one link on the page, with the anchor in [brackets]. Read the page before you pitch: the index can be weeks old.',
    "domain_rank is DataForSEO's own authority score, 0 to 100, not Ahrefs' Domain Rating.",
    OUTREACH_GUIDE,
  ]
  return {
    text: rowsText({
      title: gap
        ? `Link gap pages for ${target}, all countries.`
        : `Linking pages for ${target}, all countries.`,
      rows,
      offset,
      limit: pageSize(input.detail, rows.length),
      detail: input.detail ?? 'summary',
      notes,
      more: call,
    }),
    data: {
      provider: 'dataforseo',
      action: input.action,
      pages: true,
      target,
      competitors: gap ? rivals : [],
      costUsd: cost,
      available,
      read: items.length,
      partial: done.partial || available > items.length,
      spam: spam.length,
      total: rows.length,
      offset,
      rows: rows.slice(offset, offset + pageSize(input.detail, rows.length)),
    },
  }
}

// Questions a buyer asks: which product to pick. How-to and price
// questions name products too, but a list page is no answer to them.
const BUYER =
  /\b(best|top|alternatives?|vs\.?|versus|compare|which|recommend|app|apps|software|tools?|programs?)\b/i
const NOT_BUYER =
  /^(how (do|to|can|does)|why)\b|\b(cost|price|pricing|refund|cancel|login|sign in|download)\b/i
export const isBuyerQuestion = (question: string) =>
  BUYER.test(question) && !NOT_BUYER.test(question)

// Sites cited by almost every answer, which no outreach reaches.
const NOT_TARGETS = [
  'youtube.com',
  'reddit.com',
  'wikipedia.org',
  'quora.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'amazon.com',
]
const HELP_HOST = /^(support|help|docs|developer|developers|kb)\./

type Answer = {
  platform: string
  question: string
  volume: number
  sources: { url: string; site: string; title: string }[]
}

const cleanUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_')) parsed.searchParams.delete(key)
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

export function answersFrom(
  items: Record<string, unknown>[],
  platform: string,
): Answer[] {
  return items.map((item) => ({
    platform,
    question: text(item.question),
    volume: Number(item.ai_search_volume) || 0,
    sources: ((item.sources as Record<string, unknown>[] | null) ?? []).flatMap(
      (source) => {
        const url = cleanUrl(text(source.url))
        const site = bare(text(source.domain) || url)
        return url && site ? [{ url, site, title: text(source.title) }] : []
      },
    ),
  }))
}

type CitedRow = {
  url: string
  site: string
  title: string
  context: LinkContext
  answers: number
  ai_search_volume: number
  rivals: string
  engines: string
  cited_with_target: boolean
  top_question: string
}

// Third-party pages that buyer answers about the rivals cite, most answers
// first. cited_with_target: the same page is also cited in an answer that
// names the target, so it may already include it.
export function citedRows(
  byRival: { rival: string; answers: Answer[] }[],
  target: string,
  targetAnswers: Answer[],
): { rows: CitedRow[]; asked: number; buyer: number } {
  const own = [target, ...byRival.map(({ rival }) => rival)]
  const withTarget = new Set(
    targetAnswers.flatMap((answer) => answer.sources.map((s) => s.url)),
  )
  const found = new Map<
    string,
    CitedRow & { seen: Set<string>; best: number }
  >()
  let asked = 0
  let buyer = 0
  for (const { rival, answers } of byRival) {
    for (const answer of answers) {
      asked += 1
      if (!isBuyerQuestion(answer.question)) continue
      buyer += 1
      for (const source of answer.sources) {
        if (own.some((d) => within(source.site, d))) continue
        if (NOT_TARGETS.some((d) => within(source.site, d))) continue
        if (HELP_HOST.test(source.site)) continue
        const key = `${answer.platform}\n${answer.question}`
        const row = found.get(source.url) ?? {
          url: source.url,
          site: source.site,
          title: source.title,
          context: linkContext(source.url, source.title),
          answers: 0,
          ai_search_volume: 0,
          rivals: '',
          engines: '',
          cited_with_target: withTarget.has(source.url),
          top_question: '',
          seen: new Set<string>(),
          best: -1,
        }
        if (!row.rivals.split(' ').includes(rival)) {
          row.rivals = [row.rivals, rival].filter(Boolean).join(' ')
        }
        const engine =
          PLATFORMS.find(([id]) => id === answer.platform)?.[1] ??
          answer.platform
        if (!row.engines.split(', ').includes(engine)) {
          row.engines = [row.engines, engine].filter(Boolean).join(', ')
        }
        if (!row.seen.has(key)) {
          row.seen.add(key)
          row.answers += 1
          row.ai_search_volume += answer.volume
          if (
            answer.volume > row.best ||
            (answer.volume === row.best && answer.question < row.top_question)
          ) {
            row.best = answer.volume
            row.top_question = answer.question
          }
        }
        found.set(source.url, row)
      }
    }
  }
  const rows = [...found.values()]
    .map(({ seen: _seen, best: _best, ...row }) => row)
    .sort(
      (a, b) =>
        b.answers - a.answers ||
        b.ai_search_volume - a.ai_search_volume ||
        a.url.localeCompare(b.url),
    )
  return { rows, asked, buyer }
}

async function mentionsFor(
  keys: string[],
  domain: string,
  country: string,
): Promise<{
  answers: Answer[]
  cost: number
  capped: string[]
  failed: string[]
}> {
  const market = dataForSeoMarket(country, null)
  const answers: Answer[] = []
  const capped: string[] = []
  const failed: string[] = []
  let cost = 0
  for (const [platform, engine] of PLATFORMS) {
    try {
      const done = await dataForSeoTask(
        keys,
        'v3/ai_optimization/llm_mentions/search_mentions/live',
        {
          target: [{ domain, include_subdomains: true }],
          platform,
          location_name: market.location_name,
          language_code: market.language_code,
          order_by: ['ai_search_volume,desc'],
          limit: ANSWERS,
        },
      )
      cost += done.cost
      const items =
        (done.result?.items as Record<string, unknown>[] | null) ?? []
      if (Number(done.result?.total_count ?? 0) > items.length) {
        capped.push(
          `${domain} ${engine} (${items.length} of ${done.result?.total_count})`,
        )
      }
      answers.push(...answersFrom(items, platform))
    } catch (error) {
      cost += (error as { cost?: number }).cost ?? 0
      failed.push(`${domain} ${engine}`)
    }
  }
  return { answers, cost, capped, failed }
}

// ai_answers with competitors: the pages AI answers cite for buyer
// questions that name a rival, from DataForSEO's LLM mentions database.
export async function runCitedPages(
  input: {
    target: string
    competitors: string[]
    country: string
    offset?: number
    detail?: Detail
  },
  headers: Headers,
  call: (offset: number) => string,
): Promise<CommandResult> {
  const target = bare(input.target)
  const rivals = domainList(input.competitors).filter((d) => d !== target)
  if (!target.includes('.') || !rivals.length) {
    throw new CommandError(
      'INVALID_INPUT',
      'ai_answers with competitors needs the site as target and 1 to 3 competitor domains.',
    )
  }
  if (rivals.length > LINK_TARGET_RIVALS) {
    throw new CommandError(
      'INVALID_INPUT',
      `ai_answers with competitors reads up to ${LINK_TARGET_RIVALS} competitors at a time, about $0.35 each.`,
    )
  }
  const keys = dataForSeoKeys(headers)
  const own = await mentionsFor(keys, target, input.country)
  const byRival = []
  let cost = own.cost
  const capped = [...own.capped]
  const failed = [...own.failed]
  const answered: string[] = []
  for (const rival of rivals) {
    const got = await mentionsFor(keys, rival, input.country)
    cost += got.cost
    capped.push(...got.capped)
    failed.push(...got.failed)
    byRival.push({ rival, answers: got.answers })
    answered.push(`${rival} ${got.answers.length}`)
  }
  if (failed.length === (rivals.length + 1) * PLATFORMS.length) {
    throw new CommandError(
      'PROVIDER_ERROR',
      'DataForSEO LLM mentions failed for every site and engine.',
    )
  }
  const { rows, asked, buyer } = citedRows(byRival, target, own.answers)
  const spent = Math.round(cost * 10_000) / 10_000
  const offset = input.offset ?? 0
  const notes = [
    `AI answers that cite or name each site, from DataForSEO's LLM mentions database (ChatGPT and Google AI Overviews, ${input.country}), up to ${ANSWERS} per site and engine by AI search volume: ${target} ${own.answers.length}, ${answered.join(', ')}. DataForSEO cost: $${spent}.`,
    `${buyer} of the competitors' ${asked} answers are buyer questions (best, top, alternatives, vs, app, software); how-to and price questions are left out. Rows are the other pages those answers cite, leaving out the sites themselves, ${NOT_TARGETS.slice(0, 3).join(', ')} and other platforms, and help or docs subdomains.`,
    'answers: buyer answers that cite the page. ai_search_volume: the sum of those questions’ AI search volume, DataForSEO’s estimate. cited_with_target: the page is also cited in an answer that names the target, so it may already include it; read it to see.',
    'These pages already shape AI answers. A mention on one can get the site named in those answers. context is a guess from the URL and title, as with link_gap pages.',
    ...(capped.length
      ? [
          `Capped: ${capped.join(', ')} answers read, the ones with the most AI search volume.`,
        ]
      : []),
    ...(failed.length
      ? [
          `Partial: DataForSEO failed for ${failed.join(', ')}, so those answers are missing. Ask again.`,
        ]
      : []),
    'The database holds answers DataForSEO collected, not every answer; a page missing here may still be cited.',
    OUTREACH_GUIDE,
  ]
  return {
    text: rowsText({
      title: `Pages AI answers cite for ${rivals.join(', ')} (target ${target}).`,
      rows,
      offset,
      limit: pageSize(input.detail, rows.length),
      detail: input.detail ?? 'summary',
      notes,
      more: call,
    }),
    data: {
      provider: 'dataforseo',
      action: 'ai_answers',
      target,
      competitors: rivals,
      country: input.country,
      costUsd: spent,
      targetAnswers: own.answers.length,
      answers: Object.fromEntries(
        byRival.map(({ rival, answers }) => [rival, answers.length]),
      ),
      buyerAnswers: buyer,
      partial: capped.length > 0 || failed.length > 0,
      total: rows.length,
      offset,
      rows: rows.slice(offset, offset + pageSize(input.detail, rows.length)),
    },
  }
}
