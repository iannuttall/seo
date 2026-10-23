import { AUDIT_RULES } from './audit.js'
import { type CommandDeps, CommandError, type CommandResult } from './types.js'

// The weekly summary of the sites in the weekly site audit beta: one
// verdict, the sites that need a look with one next step each, the quiet
// ones in one line, and a prompt to paste into an agent. The hosted server
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
  line: string
  next: string
  prompt: string
}

// What needs a look on one site, most urgent first.
function issues(site: WeekSite, startMs: number, endMs: number): Issue[] {
  const name = siteName(site.property)
  const found: Issue[] = []
  const index = site.index
  if (index?.dropped) {
    const paths = index.dropped_pages.map((page) => path(page.url))
    const more = index.dropped - paths.length
    const shown =
      more > 0 ? `${paths.join(', ')} and ${plural(more, 'more')}` : list(paths)
    const reasons = new Set(index.dropped_pages.map((page) => page.coverage))
    const reason = reasons.size === 1 ? [...reasons][0] : null
    found.push({
      rank: 0,
      heading: `${plural(index.dropped, 'page')} dropped`,
      line: `${shown} dropped out of Google’s index.${reason ? ` Google says: ${reason}.` : ''}`,
      next: `check ${index.dropped === 1 ? 'it' : 'they'} still return${index.dropped === 1 ? 's' : ''} 200 and ${index.dropped === 1 ? 'is' : 'are'} not noindexed.`,
      prompt: `Why did ${paths[0] ?? 'a page'} on ${name} drop out of Google’s index this week, and how do I fix it?`,
    })
  }
  const crawl = site.crawl
  const crawled =
    crawl !== null && crawl.finished_at >= startMs && crawl.finished_at < endMs
  if (crawled && crawl.status === 'failed') {
    found.push({
      rank: 1,
      heading: 'crawl stopped early',
      line: `The weekly crawl stopped after ${plural(crawl.pages, 'page')}${crawl.error ? `: ${crawl.error}` : '.'}`,
      next: 'check the site is up. The next weekly crawl tries again.',
      prompt: `Why did the weekly crawl of ${name} stop early, and what should I check?`,
    })
  } else if (!crawled && site.added_at < startMs) {
    found.push({
      rank: 1,
      heading: 'no crawl this week',
      line: `No weekly crawl finished this week${site.start_error ? `: ${site.start_error}` : '.'}`,
      next: 'check the site is up. The crawl tries again each hour.',
      prompt: `Why has the weekly crawl of ${name} not finished, and what should I check?`,
    })
  }
  if (clicksChange(site) === 'fell') {
    const clicks = site.clicks as NonNullable<WeekSite['clicks']>
    found.push({
      rank: 2,
      heading: `clicks down ${percent(site)}%`,
      line: `Search clicks fell ${percent(site)}%, from ${count(clicks.previous)} to ${count(clicks.clicks)} (${weekLabel(clicks.start, clicks.end)}, against the 7 days before).`,
      next: 'ask your agent which pages and queries lost them.',
      prompt: `Which pages and queries lost search clicks on ${name} in the last week, and why?`,
    })
  }
  if (crawled && crawl.new_issues > 0) {
    const rule = crawl.top_rule ? AUDIT_RULES[crawl.top_rule] : undefined
    found.push({
      rank: 3,
      heading: plural(crawl.new_issues, 'new issue'),
      line: `The weekly crawl found ${plural(crawl.new_issues, 'new issue')}${rule ? `, most of them ${rule.charAt(0).toLowerCase()}${rule.slice(1)}` : ''}.`,
      next: 'ask your agent for the weekly audit of this site.',
      prompt: `What did the weekly crawl of ${name} find this week, and what should I fix first?`,
    })
  }
  return found
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
  const sites = [...data.sites].sort(byName)
  const attention: { site: WeekSite; found: Issue[] }[] = []
  const quiet: WeekSite[] = []
  const waiting: WeekSite[] = []
  for (const site of sites) {
    const found = issues(site, startMs, endMs)
    if (found.length) attention.push({ site, found })
    else if (!site.crawl || !site.index) waiting.push(site)
    else quiet.push(site)
  }
  // The most urgent first; equal ones by name.
  attention.sort(
    (a, b) =>
      (a.found[0] as Issue).rank - (b.found[0] as Issue).rank ||
      byName(a.site, b.site),
  )
  const total = sites.length
  const verdict = attention.length
    ? total === 1
      ? 'Your site needs a look this week.'
      : `${attention.length} of your ${total} sites ${attention.length === 1 ? 'needs' : 'need'} a look this week.`
    : quiet.length
      ? total === 1
        ? 'Your site had a quiet week.'
        : quiet.length === total
          ? `All ${total} of your sites had a quiet week.`
          : `${quiet.length} of your ${total} sites had a quiet week.`
      : 'Your sites are still on their first checks.'
  const out = [title, '', verdict]
  if (attention.length) {
    out.push('', '## Needs attention')
    for (const { site, found } of attention) {
      const [first, ...rest] = found as [Issue, ...Issue[]]
      const also = rest.length
        ? ` Also: ${list(rest.map((item) => item.heading))}.`
        : ''
      const rose =
        clicksChange(site) === 'rose'
          ? ` Search clicks rose ${percent(site)}%.`
          : ''
      out.push(
        '',
        `### ${siteName(site.property)}: ${first.heading}`,
        '',
        `- ${first.line}${also}${rose}`,
        `- Next step: ${first.next}`,
        ...(site.link ? [`- [View site](${site.link})`] : []),
      )
    }
  }
  if (quiet.length) {
    const risen = quiet.filter((site) => clicksChange(site) === 'rose')
    out.push(
      '',
      '## All quiet',
      '',
      `${list(quiet.map((site) => siteName(site.property)))}: no drops, no new issues.${risen
        .map(
          (site) =>
            ` Search clicks rose ${percent(site)}% on ${siteName(site.property)}.`,
        )
        .join('')}`,
    )
  }
  if (waiting.length) {
    out.push(
      '',
      '## Not checked yet',
      '',
      `${list(waiting.map((site) => siteName(site.property)))}: the first crawl or Google checks are still running.`,
    )
  }
  const first = attention[0]
  const prompt = first
    ? (first.found[0] as Issue).prompt
    : `What are the best quick wins on ${siteName((quiet[0] ?? (sites[0] as WeekSite)).property)} this month?`
  out.push(
    '',
    '## Ask your agent',
    '',
    'Paste this into your agent:',
    '',
    '```',
    prompt,
    '```',
  )
  return out.join('\n')
}

// seo week: the summary of the last full week.
export async function runWeek(deps: CommandDeps): Promise<CommandResult> {
  if (!deps.week) {
    throw new CommandError(
      'NOT_CONNECTED',
      'The weekly summary covers the sites in the weekly site audit beta on a seoskill.dev account. On this machine, run `seo login` first.',
    )
  }
  const data = await deps.week()
  return { text: weekMarkdown(data), data }
}
