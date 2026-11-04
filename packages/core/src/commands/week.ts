import { AUDIT_RULES } from './audit.js'
import { type CommandDeps, CommandError, type CommandResult } from './types.js'

// The weekly summary of the sites in the weekly site audit beta: one
// verdict, then each site's week as facts (Google's index, the weekly crawl
// and search clicks), sites with changes first. The hosted server
// gathers the week (WeekData); this writes the one Markdown that the CLI,
// both MCP servers and the Monday email all show.

export type WeekSite = {
  property: string
  // The site's page on the account, or null.
  link: string | null
  added_at: number
  // The last finished weekly crawl, or null before the first one.
  crawl: {
    finished_at: number
    status: 'done' | 'failed'
    error: string | null
    pages: number
    // Findings first seen, or back, during the week, and the rule with
    // the most of them.
    new_issues: number
    top_rule: string | null
  } | null
  // Why the last weekly crawl could not start, if it could not.
  start_error: string | null
  // Google's index during the week, or null when no check ran in it. A
  // page that dropped and came back in the same week counts as returned.
  index: {
    checked: number
    dropped: number
    returned: number
    // Up to MAX_DROPPED_PAGES drops, top pages first.
    dropped_pages: { url: string; coverage: string | null }[]
  } | null
  // Search clicks in the latest 7 days of final Search Console data and
  // the 7 days before, or null when they could not be read.
  clicks: {
    start: string
    end: string
    clicks: number
    previous: number
  } | null
  // Competitor keywords first named this week that passed every gate, or
  // null before the first check (or when the check is off on this server).
  opportunities?: WeekOpportunities | null
}

export type WeekOpportunities = {
  // The latest competitor check, and the competitors whose keywords count
  // (fetched in the last 90 days), by name.
  checked_at: number | null
  competitors: string[]
  // Why nothing could be judged this week, said as a sentence, or null.
  blocked: string | null
  // True when the check stopped (data budget, or the week's limit on
  // keywords named) before every candidate was judged, so an empty list is
  // not an all-clear.
  partial: boolean
  items: WeekOpportunity[]
}

export type WeekOpportunity = {
  keyword: string
  // 'tool' when the keyword or the competitor pages look like a free tool
  // (a heuristic from the words), else 'page'.
  kind: 'page' | 'tool'
  // DataForSEO estimates.
  search_volume: number
  cpc: number
  intent: string
  // Tracked competitors in the top 10, best position first.
  competitors: { domain: string; position: number; url: string }[]
  // Ahrefs Domain Rating of the site, and of the live top 10 domains that
  // sit at or below it plus 10.
  site_dr: number
  low_dr: number
  top: number
  // For a tool: the paying keywords the best competitor tool page ranks for.
  cluster: number
  // A decision model's yes probability that the keyword fits what the site
  // does (a classification, not a fact).
  relevance: number
}

export type WeekData = {
  // The week, Monday to Sunday in UTC, as YYYY-MM-DD.
  start: string
  end: string
  // The account page, for adding sites.
  account: string
  sites: WeekSite[]
}

export const MAX_DROPPED_PAGES = 5
const DAY_MS = 86_400_000

// The Monday to Sunday (UTC) before the week that holds now.
export function previousWeek(now = Date.now()): {
  start: string
  end: string
  startMs: number
  endMs: number
} {
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  )
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS
  const startMs = monday - 7 * DAY_MS
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return {
    start: iso(startMs),
    end: iso(monday - DAY_MS),
    startMs,
    endMs: monday,
  }
}

// "13 to 19 Oct", or "29 Sep to 5 Oct" across a month.
export function weekLabel(start: string, end: string): string {
  const parts = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`)
    return {
      day: value.getUTCDate(),
      month: value.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
    }
  }
  const from = parts(start)
  const to = parts(end)
  return from.month === to.month
    ? `${from.day} to ${to.day} ${to.month}`
    : `${from.day} ${from.month} to ${to.day} ${to.month}`
}

export const weekTitle = (data: Pick<WeekData, 'start' | 'end'>) =>
  `Your SEO Skill week, ${weekLabel(data.start, data.end)}`

// A property as people say it: example.com, or shop.example.org/blog.
export const siteName = (property: string) =>
  property.replace(/^sc-domain:|^https?:\/\//, '').replace(/\/$/, '')

const count = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) =>
  `${count(n)} ${n === 1 ? one : many}`
const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

// An error message that ends as a sentence.
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

function path(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

// A large change in search clicks, by a fixed rule (heuristic): at least
// 50 clicks and 30% either way, from a week with at least 100 (a fall) or
// 50 (a rise).
function clicksChange(site: WeekSite): 'fell' | 'rose' | null {
  const clicks = site.clicks
  if (!clicks) return null
  const change = clicks.clicks - clicks.previous
  if (Math.abs(change) < 50) return null
  if (change < 0 && clicks.previous >= 100 && -change >= 0.3 * clicks.previous)
    return 'fell'
  if (change > 0 && clicks.previous >= 50 && change >= 0.3 * clicks.previous)
    return 'rose'
  return null
}

const percent = (site: WeekSite) => {
  const clicks = site.clicks as NonNullable<WeekSite['clicks']>
  return Math.round(
    (Math.abs(clicks.clicks - clicks.previous) / clicks.previous) * 100,
  )
}

type Issue = {
  // Lower is more urgent: drops, then crawl trouble, clicks, new issues.
  rank: number
  heading: string
}

// What changed on one site that is worth a look, most urgent first. Only
// facts: what to do about them is for the person or their agent.
function issues(site: WeekSite, startMs: number, endMs: number): Issue[] {
  const found: Issue[] = []
  if (site.index?.dropped) {
    found.push({
      rank: 0,
      heading: `${plural(site.index.dropped, 'page')} dropped`,
    })
  }
  const crawl = site.crawl
  const crawled =
    crawl !== null && crawl.finished_at >= startMs && crawl.finished_at < endMs
  if (crawled && crawl.status === 'failed') {
    found.push({ rank: 1, heading: 'crawl stopped early' })
  } else if (!crawled && site.added_at < startMs) {
    found.push({ rank: 1, heading: 'no crawl this week' })
  }
  if (clicksChange(site) === 'fell') {
    found.push({ rank: 2, heading: `clicks down ${percent(site)}%` })
  }
  if (crawled && crawl.new_issues > 0) {
    found.push({ rank: 3, heading: plural(crawl.new_issues, 'new issue') })
  }
  return found
}

// One site's week as facts: Google's index, the weekly crawl and search
// clicks, each said even when nothing changed, so a quiet week reads as
// checked rather than missing.
function siteLines(site: WeekSite, startMs: number, endMs: number): string[] {
  const lines: string[] = []
  const index = site.index
  if (!index) {
    lines.push('Google index: no checks ran this week yet.')
  } else if (index.dropped) {
    const paths = index.dropped_pages.map((page) => path(page.url))
    const more = index.dropped - paths.length
    const shown =
      more > 0 ? `${paths.join(', ')} and ${plural(more, 'more')}` : list(paths)
    const reasons = new Set(index.dropped_pages.map((page) => page.coverage))
    const reason = reasons.size === 1 ? [...reasons][0] : null
    lines.push(
      `Google index: ${plural(index.dropped, 'page')} dropped out (${shown}${reason ? `: ${reason}` : ''}).${index.returned ? ` ${plural(index.returned, 'page')} now indexed.` : ''} ${plural(index.checked, 'page')} checked.`,
    )
  } else {
    lines.push(
      `Google index: ${plural(index.checked, 'page')} checked, none dropped${index.returned ? `, ${plural(index.returned, 'page')} now indexed` : ''}.`,
    )
  }
  const crawl = site.crawl
  const crawled =
    crawl !== null && crawl.finished_at >= startMs && crawl.finished_at < endMs
  if (crawled && crawl.status === 'failed') {
    lines.push(
      `Weekly crawl: stopped after ${plural(crawl.pages, 'page')}${crawl.error ? `: ${sentence(crawl.error)}` : '.'} It tries again next week.`,
    )
  } else if (crawled) {
    const rule = crawl.top_rule ? AUDIT_RULES[crawl.top_rule] : undefined
    lines.push(
      crawl.new_issues
        ? `Weekly crawl: ${plural(crawl.pages, 'page')}, ${plural(crawl.new_issues, 'new issue')}${rule ? `, most of them ${rule.charAt(0).toLowerCase()}${rule.slice(1)}` : ''}.`
        : `Weekly crawl: ${plural(crawl.pages, 'page')}, no new issues.`,
    )
  } else if (site.added_at < startMs) {
    lines.push(
      `Weekly crawl: none finished this week${site.start_error ? `: ${sentence(site.start_error)}` : '.'} It tries again each hour.`,
    )
  } else {
    lines.push('Weekly crawl: the first crawl is still running.')
  }
  const clicks = site.clicks
  if (clicks) {
    const change =
      clicks.previous > 0
        ? Math.round(
            ((clicks.clicks - clicks.previous) / clicks.previous) * 100,
          )
        : null
    const trend =
      change === null
        ? `from ${count(clicks.previous)}`
        : change === 0
          ? 'level with'
          : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on`
    lines.push(
      `Search clicks: ${count(clicks.clicks)} (${weekLabel(clicks.start, clicks.end)}), ${trend}${change === null ? '' : ` ${count(clicks.previous)}`} the 7 days before.`,
    )
  } else {
    lines.push('Search clicks: not available this week.')
  }
  return lines
}

// The competitor opportunities line, and one line per keyword under it.
// Only keywords that passed every gate are named, so a week with none says
// so, and a week the budget cut short says more may follow.
function opportunityLines(site: WeekSite): string[] {
  const found = site.opportunities
  if (!found) return []
  const from = found.competitors.length
    ? ` (${plural(found.competitors.length, 'competitor')} checked)`
    : ''
  if (found.blocked && !found.items.length) {
    return [`- Competitor opportunities: ${sentence(found.blocked)}`]
  }
  const more = found.partial
    ? ' Not every candidate keyword was judged yet, so more may follow next week.'
    : ''
  if (!found.items.length) {
    return [
      `- Competitor opportunities: none cleared every check this week${from}.${more}`,
    ]
  }
  const money = (n: number) => `$${n.toFixed(2)}`
  return [
    `- Competitor opportunities: ${plural(found.items.length, 'keyword')} cleared every check${from}.${more}`,
    ...found.items.map((item) => {
      const ranked = list(
        item.competitors.map((c) => `${c.domain} (#${c.position})`),
      )
      const tool = item.kind === 'tool'
      return `  - "${item.keyword}"${tool ? ', a free tool' : ''}: ${count(item.search_volume)} searches a month, ${money(item.cpc)} CPC, ${item.intent} intent. Top 10 for ${ranked}.${tool ? ` The best tool page ranks for ${plural(item.cluster, 'paying keyword')}.` : ''} ${item.low_dr} of the top ${item.top} have Domain Rating at or below ${item.site_dr + 10} (yours is ${item.site_dr}).`
    }),
    '  - Searches, CPC and intent are DataForSEO estimates, Domain Rating is by Ahrefs, fit with the site is a model classification and "free tool" is a guess from the words.',
  ]
}

// The week as Markdown.
export function weekMarkdown(data: WeekData): string {
  const startMs = Date.parse(`${data.start}T00:00:00Z`)
  const endMs = Date.parse(`${data.end}T00:00:00Z`) + DAY_MS
  const title = `# ${weekTitle(data)}`
  if (!data.sites.length) {
    return `${title}\n\nNo site is in your weekly audit yet. Add one on the Sites tab: ${data.account}#sites`
  }
  const byName = (a: WeekSite, b: WeekSite) =>
    siteName(a.property).localeCompare(siteName(b.property)) ||
    a.property.localeCompare(b.property)
  const rows = data.sites.map((site) => ({
    site,
    found: issues(site, startMs, endMs),
    waiting: !site.crawl || !site.index,
  }))
  const attention = rows.filter((row) => row.found.length)
  const quiet = rows.filter((row) => !row.found.length && !row.waiting)
  // Sites with changes first, the most urgent first; the rest by name.
  rows.sort(
    (a, b) =>
      (a.found[0]?.rank ?? Number.POSITIVE_INFINITY) -
        (b.found[0]?.rank ?? Number.POSITIVE_INFINITY) ||
      byName(a.site, b.site),
  )
  const total = rows.length
  const verdict = attention.length
    ? total === 1
      ? 'Your site had changes worth a look this week.'
      : `${attention.length} of your ${total} sites had changes worth a look this week.`
    : quiet.length
      ? total === 1
        ? 'Your site had a quiet week.'
        : quiet.length === total
          ? `All ${total} of your sites had a quiet week.`
          : `${quiet.length} of your ${total} sites had a quiet week.`
      : 'Your sites are still on their first checks.'
  const out = [title, '', verdict]
  for (const { site, found } of rows) {
    out.push(
      '',
      `## ${siteName(site.property)}${found.length ? `: ${list(found.map((item) => item.heading))}` : ''}`,
      '',
      ...siteLines(site, startMs, endMs).map((line) => `- ${line}`),
      ...opportunityLines(site),
      ...(site.link ? [`- [View site](${site.link})`] : []),
    )
  }
  return out.join('\n')
}

// seo report with no site: the all-sites summary, the same Markdown as the
// Monday email, then one line naming the parameter for one site's report.
// Only an account in the weekly site audit beta has it. Any other caller
// gets its site list from sites, when given, to pick one from; else the
// "name a site" error.
export async function runAllSites(
  deps: CommandDeps,
  sites?: () => Promise<CommandResult>,
): Promise<CommandResult> {
  const data = deps.week ? await deps.week() : null
  if (!data && sites) {
    const list = await sites()
    return {
      text: `No site given. Pick one below and send it: ${deps.call('report', { site: '<site>' })}. The summary of every site is for accounts in the weekly site audit beta.\n\n${list.text}`,
      data: list.data,
    }
  }
  if (!data) {
    throw new CommandError(
      'INVALID_INPUT',
      `No site given. Name one: ${deps.call('report', { site: '<site>' })}. The summary of every site is for accounts in the weekly site audit beta.`,
    )
  }
  // The site to name next: the most urgent one, else the first by name.
  const startMs = Date.parse(`${data.start}T00:00:00Z`)
  const endMs = Date.parse(`${data.end}T00:00:00Z`) + DAY_MS
  const urgency = (site: WeekSite) =>
    issues(site, startMs, endMs)[0]?.rank ?? Number.POSITIVE_INFINITY
  const first = [...data.sites].sort(
    (a, b) =>
      urgency(a) - urgency(b) ||
      siteName(a.property).localeCompare(siteName(b.property)),
  )[0]
  const example = first ? siteName(first.property) : '<site>'
  return {
    text: `${weekMarkdown(data)}\n\nFull report on one site: ${deps.call('report', { site: example })}`,
    data,
  }
}
