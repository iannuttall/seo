import {
  isBrandQuery,
  normalizeBrandText,
  registrableDomain,
} from '../brand.js'
import { brandTermsFromQueryRows } from '../brand-evidence.js'
import {
  landingPage,
  type OrganicPages,
  organicPages,
} from './analytics-site.js'
import {
  brandNames,
  type ConversionPath,
  conversionPaths,
  onConversionPage,
} from './context.js'
import { bareDomain } from './domain-rating.js'
import { table } from './present.js'
import {
  type DateInput,
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  originOf,
  pct,
  sharedReader,
} from './shared.js'
import type {
  Caller,
  CommandDeps,
  CommandResult,
  DateRange,
  PageFacts,
} from './types.js'

// The teardown section of the report: a brief for the person's agent to
// write a teardown of a site in the shape of the How I'd grow posts on
// seoskill.dev, the research calls to make in order, and the Search Console
// and Google Analytics data SEO Skill already has for it. The agent does the
// research and the writing; nothing here spends provider credit. Any domain
// works: without a Search Console property it returns the brief alone.

export const TEARDOWN_SECTION = 'teardown'

export const TEARDOWN_SECTION_TEXT =
  'Only when the person asks for a teardown or a full written review of a site. The brief for writing one (what the site could win in Google and AI answers, where its search traffic lands today, and the changes in order of the growth they bring, each backed by numbers), the research calls to make in order, and the data SEO Skill has for it: clicks and impressions against the previous period, brand and non-brand clicks, clicks by folder and by page with Google Analytics key events, the conversion pages in the business context, and page-two searches with each page’s live title and main heading. Works for any domain: without a Search Console property it returns the brief and the research calls only. It spends no provider credit.'

const DAYS = 28
// Rows read per list, set before any call.
const ROWS = 5_000
const PAGES_SHOWN = 15
const FOLDERS_SHOWN = 10
const QUERIES_SHOWN = 10
const PAGE_TWO_SHOWN = 10

// The striking-distance section, as the report builds it.
export type StrikingBuild = (
  range: DateRange,
) => Promise<Record<string, unknown>>

type Row = {
  keys: string[]
  clicks: number
  impressions: number
  position: number
}

// The brief alone, for a domain that is not a Search Console property the
// person can read, such as a prospect or a competitor.
export function teardownBrief(
  site: string,
  reason: string,
  call: Caller,
): CommandResult {
  const domain = bareDomain(site)
  return {
    text: [
      `Teardown of ${domain}, with the brief alone. ${reason} So every number comes from the research calls below, and those are provider estimates, so say so wherever you use one. When the site is the person's own, connect its Search Console property and ask again for its clicks, pages and page-two searches.`,
      brief({ domain, call, data: false, context: false }),
    ].join('\n\n'),
    data: { site: domain, searchConsole: null, reason },
  }
}

export async function runTeardown(
  input: DateInput & { site: string },
  deps: CommandDeps,
  striking: StrikingBuild,
): Promise<CommandResult> {
  const domain = bareDomain(input.site)
  const call = deps.call
  const site = input.site
  const range = dateWindow(input, DAYS)
  const before = earlierRange(range)
  const read = sharedReader(deps.searchAnalytics)
  const get = (dimensions: string[], window: DateRange, maxRows = ROWS) =>
    read(site, {
      ...window,
      dimensions,
      type: 'web',
      dataState: 'final',
      maxRows,
    })
  const [total, totalBefore, pageRows, queryRows, ga, context, pageTwo] =
    await Promise.all([
      get([], range),
      get([], before),
      get(['page'], range),
      get(['query'], range),
      organicPages(deps.analytics, site, range),
      deps.context ? deps.context.read(site) : Promise.resolve(null),
      striking(range).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      ),
    ])
  const pages = byClicks(pageRows.rows as Row[])
  const queries = byClicks(queryRows.rows as Row[])
  const now = (total.rows[0] as Row | undefined) ?? zero
  const then = (totalBefore.rows[0] as Row | undefined) ?? zero
  const analytics = ga && typeof ga !== 'string' ? ga : null
  const paths = context ? conversionPaths(context.text) : []
  const host = pages[0] ? new URL(pages[0].keys[0] ?? '').hostname : null
  const origin = host ? `https://${host}` : originOf(site)
  const days = `${range.startDate} to ${range.endDate}`

  // Brand and non-brand clicks among the queries Search Console lists. The
  // brand names the person confirmed in the business context decide, as in
  // every report section. Without them, the report's guess from the domain
  // counts, and a domain name that is one word, such as example in
  // example.com, is brand wherever it is a word of its own in the search,
  // even when the site is not the top answer for it. It is never split:
  // "exam ple" is not brand for example.com.
  const confirmed = context ? brandNames(context.text) : []
  const guess = confirmed.length
    ? null
    : brandTermsFromQueryRows({ siteUrl: site, rows: queryRows.rows })
  const stem = registrableDomain(site)?.stem
  const word = guess && stem && /^[\p{L}\p{N}]+$/u.test(stem) ? stem : null
  const isBrand = (query: string) =>
    isBrandQuery(query, guess ? guess.terms : confirmed) ||
    (word !== null && normalizeBrandText(query).split(' ').includes(word))
  const terms = guess
    ? [...new Set([...guess.terms, ...(word ? [word] : [])])]
    : confirmed
  const listed = sum(queries, 'clicks')
  const brandClicks = sum(
    queries.filter((row) => isBrand(row.keys[0] ?? '')),
    'clicks',
  )
  const nonBrand = queries.filter((row) => !isBrand(row.keys[0] ?? ''))
  const topNonBrand = nonBrand.slice(0, QUERIES_SHOWN).map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    position: round(row.position),
  }))
  const queriesCapped = queries.length >= ROWS
  const pagesCapped = pages.length >= ROWS

  const folders = byFolder(pages, host, analytics)
  const topPages = pages.slice(0, PAGES_SHOWN).map((row) => {
    const url = row.keys[0] ?? ''
    return {
      page: url,
      clicks: row.clicks,
      impressions: row.impressions,
      position: round(row.position),
      key_events: analytics
        ? (landingPage(analytics, url)?.keyEvents ?? null)
        : null,
      conversion_page: onConversionPage(url, paths) ? 'yes' : '',
    }
  })
  const conversions = paths.map((path) =>
    conversionRow(path, pages, analytics, pagesCapped),
  )

  let pageTwoRows: Record<string, unknown>[] = []
  let pageTwoNote: string
  if (pageTwo instanceof Error) {
    pageTwoNote = `Not available: ${pageTwo.message}`
  } else {
    const items = (
      (pageTwo.items as Record<string, unknown>[] | undefined) ?? []
    )
      .filter((item) => !isBrand(String(item.query ?? '')))
      .slice(0, PAGE_TWO_SHOWN)
    const urls = [...new Set(items.map((item) => String(item.url)))]
    const live = new Map<string, PageFacts>(
      (urls.length ? await deps.checkPages(urls) : []).map((page) => [
        page.url,
        page,
      ]),
    )
    pageTwoRows = items.map((item) => ({
      query: item.query,
      page: item.url,
      impressions: item.impressions,
      position: round(Number(item.position)),
      title: live.get(String(item.url))?.title ?? '',
      h1: live.get(String(item.url))?.h1 ?? '',
    }))
    pageTwoNote = pageTwoRows.length
      ? `Searches where a page has an average position past 10 and up to 20, brand searches left out, in the striking-distance section's order, with each page's title and main heading fetched now. The full list: ${call('report', { site, section: 'striking-distance' })}.`
      : 'No page has searches at positions 11 to 20 with enough impressions in these dates.'
  }

  const gaLine = !ga
    ? 'Google Analytics is not available here, so the key events columns are blank.'
    : typeof ga === 'string'
      ? `${ga} The key events columns are blank.`
      : `Key events are Google Analytics key events from Organic Search by landing page, property ${ga.propertyName} (${ga.property}), for the same dates. They count the whole landing page, and sessions are not Search Console clicks.${ga.capped ? ' Google Analytics did not list every landing page, so a blank cell is unknown and a folder total is a floor.' : ''}`

  const data = [
    `## Search Console and Google Analytics data, ${days}`,
    `Totals: clicks ${now.clicks} (previous period ${then.clicks}, ${change(pct(now.clicks, then.clicks))}), impressions ${now.impressions} (was ${then.impressions}, ${change(pct(now.impressions, then.impressions))}), average position ${round(now.position)}.`,
    `Search Console lists queries for ${listed} of the ${now.clicks} clicks. ${brandClicks} come from searches that contain a brand term and ${listed - brandClicks} from non-brand searches. The other ${Math.max(0, now.clicks - listed)} come from queries Search Console hides for privacy${queriesCapped ? ` or that fall outside the ${ROWS.toLocaleString('en-US')} queries listed` : ''}, so neither share is complete. ${confirmed.length ? `Brand names from the business context: ${terms.join(', ')}.` : `The business context names no brand names, so these brand terms are guessed from the domain: ${terms.join(', ') || 'none found'}.${word ? ` A search is brand when it has "${word}" as a word of its own, so a search that splits the name into words is not.` : ''}`}`,
    topNonBrand.length
      ? `Top non-brand searches by clicks:\n${table(
          topNonBrand,
          ['query', 'clicks', 'impressions', 'position'],
          origin,
        )}`
      : 'Search Console lists no non-brand searches with clicks in these dates.',
    folders.length
      ? `Where the clicks land, by folder (the first folder of each address, / for the home page and top-level pages, from the ${pages.length.toLocaleString('en-US')} pages listed${pagesCapped ? ', capped' : ''}):\n${table(
          folders.slice(0, FOLDERS_SHOWN),
          ['folder', 'pages', 'clicks', 'impressions', 'key_events'],
          origin,
        )}`
      : 'Search Console lists no pages with impressions in these dates.',
    topPages.length
      ? `Top pages by clicks:\n${table(
          topPages,
          [
            'page',
            'clicks',
            'impressions',
            'position',
            'key_events',
            'conversion_page',
          ],
          origin,
        )}`
      : null,
    gaLine,
    conversions.length
      ? `Conversion pages from the business context:\n${table(
          conversions,
          [
            'conversion_page',
            'pages',
            'clicks',
            'impressions',
            'position',
            'key_events',
            'note',
          ],
          origin,
        )}`
      : context
        ? 'The business context lists no conversion pages. Add them under "## Conversion pages" so the teardown can say how much search traffic reaches them.'
        : null,
    `Page-two searches: ${pageTwoNote}${
      pageTwoRows.length
        ? `\n${table(pageTwoRows, ['query', 'page', 'impressions', 'position', 'title', 'h1'], origin, 120)}`
        : ''
    }`,
    `More rows: ${call('report', { site, section: '<section>' })}, such as quick-wins, low-ctr, content-decay and ai-queries.`,
  ]

  return {
    text: [
      `Teardown of ${domain}. Below are the brief and the research calls to make, then the data SEO Skill has for it. You do the research and the writing.`,
      brief({ domain, call, data: true, context: Boolean(context), origin }),
      context
        ? `## Business context (saved ${context.updated_at.slice(0, 10)})\n${context.text}`
        : null,
      data.filter(Boolean).join('\n\n'),
      FACTS_ONLY,
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      site,
      range,
      comparisonRange: before,
      totals: {
        clicks: now.clicks,
        previousClicks: then.clicks,
        impressions: now.impressions,
        previousImpressions: then.impressions,
        position: round(now.position),
      },
      brand: {
        terms,
        listedClicks: listed,
        brandClicks,
        nonBrandClicks: listed - brandClicks,
        hiddenClicks: Math.max(0, now.clicks - listed),
        capped: queriesCapped,
      },
      nonBrandQueries: topNonBrand,
      folders: folders.slice(0, FOLDERS_SHOWN),
      pages: topPages,
      pagesCapped,
      analytics: analytics
        ? {
            property: analytics.property,
            propertyName: analytics.propertyName,
            capped: analytics.capped,
          }
        : ga
          ? { error: ga }
          : null,
      conversionPages: conversions,
      pageTwo:
        pageTwo instanceof Error ? { error: pageTwo.message } : pageTwoRows,
      context: context ? { updated_at: context.updated_at } : null,
    },
  }
}

const zero: Row = { keys: [], clicks: 0, impressions: 0, position: 0 }

const sum = (rows: Row[], key: 'clicks' | 'impressions') =>
  rows.reduce((total, row) => total + row[key], 0)

// Most clicks first, then impressions, then the key, so the order never
// depends on the order Search Console sent.
const byClicks = (rows: Row[]) =>
  [...rows].sort(
    (a, b) =>
      b.clicks - a.clicks ||
      b.impressions - a.impressions ||
      (a.keys[0] ?? '').localeCompare(b.keys[0] ?? ''),
  )

const round = (value: number) => Math.round(value * 10) / 10

const change = (value: number | null) =>
  value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`

// The first folder of a URL, with the host in front when it is not the main
// host. A top-level page joins the folder of the same name when other pages
// sit under it (/docs with /docs/cli); the rest are /.
function folderOf(url: string, host: string | null, folders: Set<string>) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const first = parsed.pathname.split('/').filter(Boolean)[0]
  const prefix = parsed.hostname === host ? '' : parsed.hostname
  const folder = first ? `/${first}/` : '/'
  return `${prefix}${folders.has(`${prefix}${folder}`) ? folder : '/'}`
}

// Folders with a page under them, such as /docs/ for /docs/cli.
function foldersOf(urls: string[], host: string | null): Set<string> {
  const found = new Set<string>()
  for (const url of urls) {
    try {
      const parsed = new URL(url)
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length > 1 || (parts.length && parsed.pathname.endsWith('/'))) {
        found.add(
          `${parsed.hostname === host ? '' : parsed.hostname}/${parts[0]}/`,
        )
      }
    } catch {}
  }
  return found
}

// Clicks and impressions by folder, most clicks first, with the Google
// Analytics key events of the landing pages in each folder on the main host.
function byFolder(
  pages: Row[],
  host: string | null,
  ga: OrganicPages | null,
): Record<string, string | number | null>[] {
  const groups = new Map<
    string,
    { pages: number; clicks: number; impressions: number }
  >()
  const folders = foldersOf(
    pages.map((row) => row.keys[0] ?? ''),
    host,
  )
  for (const row of pages) {
    const key = folderOf(row.keys[0] ?? '', host, folders)
    const group = groups.get(key) ?? { pages: 0, clicks: 0, impressions: 0 }
    group.pages += 1
    group.clicks += row.clicks
    group.impressions += row.impressions
    groups.set(key, group)
  }
  const events = new Map<string, number>()
  if (ga && host && host.replace(/^www\./, '') === ga.host) {
    for (const [path, page] of ga.pages) {
      const key = folderOf(`https://${host}${path}`, host, folders)
      events.set(key, (events.get(key) ?? 0) + page.keyEvents)
    }
  }
  return [...groups]
    .map(([folder, group]) => ({
      folder,
      ...group,
      key_events: ga
        ? folder.startsWith('/')
          ? (events.get(folder) ?? (ga.capped ? null : 0))
          : null
        : null,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        a.folder.localeCompare(b.folder),
    )
}

// One conversion page or folder from the business context with its Search
// Console totals and key events. A page missing from the listed rows has no
// impressions in these dates only when the list was not capped.
function conversionRow(
  path: ConversionPath,
  pages: Row[],
  ga: OrganicPages | null,
  capped: boolean,
): Record<string, string | number | null> {
  const matches = pages.filter((row) =>
    onConversionPage(row.keys[0] ?? '', [path]),
  )
  const shown = path.prefix ? `${path.path}/ (every page)` : path.path
  if (!matches.length) {
    return {
      conversion_page: shown,
      pages: 0,
      clicks: null,
      impressions: null,
      position: null,
      key_events: null,
      note: capped
        ? `not in the ${ROWS.toLocaleString('en-US')} pages listed, so unknown`
        : 'no impressions in these dates',
    }
  }
  const impressions = sum(matches, 'impressions')
  let keyEvents: number | null = null
  if (ga) {
    keyEvents = 0
    for (const row of matches) {
      const found = landingPage(ga, row.keys[0])
      if (!found) {
        keyEvents = null
        break
      }
      keyEvents += found.keyEvents
    }
  }
  return {
    conversion_page: shown,
    pages: matches.length,
    clicks: sum(matches, 'clicks'),
    impressions,
    position: impressions
      ? round(
          matches.reduce(
            (total, row) => total + row.position * row.impressions,
            0,
          ) / impressions,
        )
      : null,
    key_events: keyEvents,
    note: '',
  }
}

// What the agent follows to research and write the teardown. With data,
// the first steps point at the rows below; without, at provider calls.
function brief(input: {
  domain: string
  call: Caller
  data: boolean
  context: boolean
  // The home page address Search Console shows, such as https://www.example.com.
  origin?: string
}): string {
  const { domain, call, data } = input
  const home = input.origin ? `${input.origin}/` : `https://${domain}/`
  const research = (action: string, args: Record<string, string> = {}) =>
    call('research', { action, ...args })
  const steps = [
    input.context
      ? '1. The business. Read the business context below: what it sells, who buys it, its conversion pages and its competitors. List every site the company runs, such as a parent company, sister products, subdomains and old domains.'
      : `1. The business. Read the home page, the pricing page and the main product pages (${call('page', { url: '<url>' })} reads one live) and note what it sells, who buys it, which pages turn a visit into a customer, and who it competes with. List every site the company runs, such as a parent company, sister products, subdomains and old domains.`,
    data
      ? '2. Where the search traffic lands. Use the folders and pages below. Sort the pages into those that sell something, those people reach by searching the brand, guides and posts, and pages off the topic.'
      : `2. Where the search traffic lands. Run ${research('top_pages', { target: domain })} and sort the pages into those that sell something, those people reach by searching the brand, guides and posts, and pages off the topic.`,
    data
      ? `3. Page-two searches. For each search below, read the page with ${call('page', { url: '<url>' })} and note where a reader would want a section, a heading or the word they used, and the page never gives it. Leave out searches that don't fit, such as dictionary lookups.`
      : `3. Page-two searches. Run ${research('ranked_keywords', { target: `${domain}/<section>/` })} for the main sections, keep the searches at positions 11 to 20, and check whether the page names each one in its title or text. Leave out searches that don't fit, such as dictionary lookups.`,
    `4. Each thing it sells. Find the searches its buyers make with ${research('keyword_metrics', { keywords: '<keyword>' })} and ${research('keyword_ideas', { keywords: '<seed>' })}, then who ranks with ${research('serp', { keywords: '<keyword>' })}. A keyword table always shows volume and who ranks.`,
    `5. Competitors and new pages. Find 3 to 5 competitors with ${research('competitors', { target: domain })}, the companies its own comparison pages name and the names buyers compare it with. The competitors call matches shared searches, so drop sites that only share a word with the name. Compare ${domain}'s estimated search traffic with each one's (the traffic total ${research('ranked_keywords', { target: '<competitor>' })} returns), including smaller rivals that get more with less. Run ${research('top_pages', { target: '<competitor>' })} for each to see which kinds of page win them non-brand search, and use the ranked_keywords rows and list the searches, with volume, where a competitor ranks and ${domain} has no page. Read the ranking pages for the biggest gaps and say how ${domain} could do better with what only it has, such as its own data or a free tool. Group the gaps by topic, and give each group a proposed page with its title, its address and the searches each section answers. Also look for searches with tool intent (checker, generator, calculator, test, template) and for repeatable pages, such as one page per app, integration or use case, that ${domain} could build from what it already has.`,
    `6. Technical checks. Crawl the site on the person's machine with \`npx -y seo crawl --url ${home} --max-pages 600\`, which also reads the robots.txt rules for AI crawlers and llms.txt. When the crawl stops at one page, the address redirects, so crawl the address it lands on. Confirm each issue on a live page before you write about it. Also check by hand the sitemap against the navigation, a made-up address (it should return a 404, not a 200 or a sign-in page), and the canonical tag on each conversion page.${data ? ` Run ${call('index', { site: domain })} for Google's own reading of each page, and lead with any conversion page Google has not indexed.` : ''}`,
    `7. AI answers. Write 10 questions before you run anything and keep them. Mix product questions (its price, a feature, setup), category questions (what something is, how to do it) and choice questions ("best", "vs", "alternatives"). Ask them with ${research('ai_answers', { target: domain, keywords: '<q1>,<q2>' })}, then once more with the top competitor as the target (about $0.07 each). A finding is an answer that cites a third party, or the wrong page, where a page of ${domain} should answer, or a choice question where a competitor's own page is cited. The lists and videos cited for choice questions are the outreach targets.`,
    `8. Links. Start with the company's own sites from step 1. Crawl each one with \`npx -y seo crawl --url <its home page> --max-pages 600\`, pull every link to ${domain} out of the crawl, and count them by the page they point at. Note any that point at a dead, parked or misspelled address. A backlink total cannot show this, so crawl even when the backlink data names the site. When they all go to the home page, pointing them at the conversion pages is the cheapest change in the teardown. Then run ${research('link_gap', { target: domain, competitors: '<a>,<b>,<c>' })} and group the sites by why they link to the competitors, such as a tool, a data report, a comparison or a quote in a news story. List the data only this company has and a report each could become, with a dated headline a journalist could quote.`,
  ]
  const sections = [
    '1. What the company does and how it makes money.',
    `2. Where its search traffic lands, and how much of it reaches the conversion pages.`,
    '3. The page-two searches, and what each page should add for its reader.',
    '4. One section for each thing it sells, with the demand, who ranks and the page it needs.',
    '5. New pages: the topic groups, free tools and repeatable pages, each with its target search and volume, a title and its sections.',
    '6. AI search: what AI crawlers get, and the answer findings by engine and by kind of question.',
    '7. Links, with the link gap and the reports its own data could become. Leave this out when the link research finds nothing to act on.',
    '8. Technical fixes, closest to revenue first. Say what each one is in plain words, then give the evidence, the fix and how to confirm it worked.',
    '9. Every change as a numbered list in order of the growth each brings, under a heading that says what the changes get the company, then how to check the results after 28 days with the same Search Console data and the same 10 questions.',
    '10. How it was made, in a few lines, with the data sources and their dates.',
  ]
  const rules = [
    'Lead with the upside, meaning the searches it could win, the data it already owns and what already works. Order the fixes by the growth they bring, and put cleanup such as spam last, in a short section.',
    'Brand searches are a strength, because they show people know the company. Leave them out of keyword gap tables and say so, and frame the gap as non-brand searches, from people who need the product and do not know the brand yet.',
    'Only findings go in. When a step finds nothing to act on, leave it out.',
    'Open on the upside in plain sentences. Leave out a key findings box, a method section at the top and a closing lesson, and give the plan no dates or timeline, such as "this week" or "within a quarter".',
    'Open each section with what is true. How you found it goes in a short clause or a table caption.',
    'Give each number its source and month. Call provider numbers estimates. A small estimate is a floor, since providers miss long-tail searches, and a provider count of pages or links is a minimum. Use one provider per table and name it.',
    'Say that a page is indexed, what a crawler gets or why a number changed only when a live check showed it. A traffic change that lines up with a date is timing, not cause.',
    'Report AI answers from one dated run, by engine and by kind of question, never added together, and say in one sentence that answers change from run to run.',
    'Recommend pages made for the reader who lands on them, never a stock "What is X?" opening or a block of questions added to rank. llms.txt, Markdown copies and schema help agents read the site; they are not a way to get cited.',
    'Recommend one domain over subdomains and side sites, with a 301 from every old address, unless the evidence says otherwise.',
    'Name each change so the company can act on it, with an example from its own site, such as the exact title a page has now and the one you propose.',
    'Name pages in prose ("the pricing page"), not by bare path. Use tables for parallel facts, never columns lined up in a code block.',
    'Each heading says what its section is about, never "The plan" or "Overview". Leave out judgment words such as "impressive" or "strong" and state the fact.',
    'Say "conversion pages". Never promise rankings, traffic or citations.',
  ]
  return [
    '## What the teardown is',
    `A teardown says what ${domain} could win from Google and AI answers, and the changes that would win it, in order of the growth each brings. Each finding names the page, search or address it is about, carries the number that backs it with its source and dates, and ends in a change the company can make. Write it the way you'd explain it to someone you respect, with an opinion, not as a report.`,
    `Before you start, ask the person who it is for (their own team, a client or a prospect). The research calls below spend their DataForSEO or Ahrefs credit, so tell them which calls you plan to make and wait for their yes.`,
    `## Research, in this order\n${steps.join('\n')}`,
    `## Write it in this order\n${sections.join('\n')}`,
    `## Rules\n${rules.map((rule) => `- ${rule}`).join('\n')}`,
    `Before you send it, check the draft with ${call('lint', {})} and fix every error and warning. When the person wants a short version to share, use "How I'd grow <company> with SEO", one line with the biggest upside and its number, "What I found:" with four or five bullets that each carry a number from the teardown, then the link to the full version.`,
  ].join('\n\n')
}
