import { latestFinalGscDate, shiftIsoDate } from '../gsc/dates.js'
import { AUDIT_RULES } from './audit.js'
import type { IssueMeasure, StoredIssue } from './issues.js'
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
  // The latest weekly AI answer check, or null before the first one (or
  // when the check is off on this server).
  ai_answers?: WeekAiAnswers | null
  // Google ranking updates that ran during the week or whose result
  // became ready in it (Monday email only), each with the site's result
  // once final data covers it, else null.
  google_updates?: WeekGoogleUpdate[]
  // Fixed issues whose after-fix days ended in the latest 7 days of final
  // Search Console data, first MAX_MEASURED, oldest fix first, and how many
  // there were in all.
  measured?: {
    total: number
    items: (IssueMeasure & { subject: string })[]
  }
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

// What AI answers said about the site for the same questions each week.
export type WeekAiAnswers = {
  // The latest check, and the one before it, or null.
  checked_at: number | null
  previous_checked_at: number | null
  // Why the check could not run this week, as a sentence, or null.
  blocked: string | null
  // The questions asked every week, fixed at the first check that found
  // any, so one week compares with the next.
  questions: string[]
  // The latest check's answers by result, across every question and
  // engine (the results ai_answers gives).
  counts: Record<
    'cited' | 'mentioned' | 'neither' | 'no_answer' | 'unavailable' | 'pending',
    number
  >
  // Answers whose result changed since the check before, when both
  // results are known, citations first.
  changes: {
    question: string
    engine: string
    from: string
    to: string
    cited_url: string | null
  }[]
  // Other sites the latest answers cite most, by how many answers cite
  // each.
  cited_sites: { host: string; answers: number }[]
}

export type WeekData = {
  // The week, Monday to Sunday in UTC, as YYYY-MM-DD.
  start: string
  end: string
  // The account page, for adding sites.
  account: string
  sites: WeekSite[]
  // An account's first summary, sent once its first results are in, for
  // the 7 days to then. Its crawl findings read as open, not new.
  first?: boolean
}

export const MAX_DROPPED_PAGES = 5
export const MAX_MEASURED = 5

export type WeekGoogleUpdate = {
  name: string
  start: string
  end: string | null
  // Final data covers it, so the result is ready to read.
  ready: boolean
  result: {
    verdict: 'within-normal' | 'outside-normal' | 'not-enough-data'
    clicks: number
    previous: number
    days: number
  } | null
}
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

// "3 Oct".
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

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
function issues(
  site: WeekSite,
  startMs: number,
  endMs: number,
  first = false,
): Issue[] {
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
    found.push({
      rank: 3,
      heading: plural(crawl.new_issues, first ? 'open finding' : 'new issue'),
    })
  }
  return found
}

// One site's week as facts: Google's index, the weekly crawl and search
// clicks, each said even when nothing changed, so a quiet week reads as
// checked rather than missing.
function siteLines(
  site: WeekSite,
  startMs: number,
  endMs: number,
  first = false,
): string[] {
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
        ? `Weekly crawl: ${plural(crawl.pages, 'page')}, ${plural(crawl.new_issues, first ? 'open finding' : 'new issue')}${rule ? `, most of them ${rule.charAt(0).toLowerCase()}${rule.slice(1)}` : ''}.`
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
// One line per Google update: the site's result when it is ready, else
// that the update is still running or final data has not caught up.
function updateLines(site: WeekSite): string[] {
  return (site.google_updates ?? []).map((update) => {
    const when = update.end ? 'ran' : 'has been rolling out'
    const result = update.result
    if (!result && update.ready) {
      return `- Google update: the ${update.name} ran ${update.start.slice(0, 10)} to ${update.end?.slice(0, 10) ?? 'now'}. Ask for the report's google-updates section on this site for what moved.`
    }
    if (!result) {
      return `- Google update: the ${update.name} ${when}${update.end ? ` (${update.start.slice(0, 10)} to ${update.end.slice(0, 10)})` : ` since ${update.start.slice(0, 10)}`}. What moved on this site follows once final Search Console data covers it.`
    }
    const diff = result.clicks - result.previous
    const pct =
      result.previous > 0 ? Math.round((diff / result.previous) * 100) : null
    const moved =
      pct === null
        ? `${count(result.clicks)} clicks from ${count(result.previous)}`
        : pct === 0
          ? `clicks level at ${count(result.clicks)}`
          : `clicks ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% (${count(result.clicks)} from ${count(result.previous)})`
    const verdict = {
      'outside-normal': 'more than this site usually moves',
      'within-normal': 'within this site’s normal movement',
      'not-enough-data': 'too little data to say if that is unusual',
    }[result.verdict]
    return `- Google update: the ${update.name}, ${moved} over the ${result.days} days from its start against the ${result.days} before, ${verdict} (timing only, not cause).`
  })
}

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

const ENGINE_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT search',
  google_ai_mode: 'Google AI Mode',
  google_ai_overview: 'AI Overviews',
}
export const MAX_AI_CHANGES = 10

// The AI answer line, the answers that changed since the check before and
// the sites cited instead. Each answer is one sample, so a change is
// reported as what the answer said, never as a trend.
function aiAnswerLines(site: WeekSite): string[] {
  const found = site.ai_answers
  if (!found) return []
  if (found.blocked) return [`- AI answers: ${sentence(found.blocked)}`]
  if (!found.checked_at) return []
  const day = (ms: number) => dayLabel(new Date(ms).toISOString().slice(0, 10))
  const { counts } = found
  const answers = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const unknown = [
    counts.unavailable ? `${count(counts.unavailable)} unavailable` : '',
    counts.pending ? `${count(counts.pending)} not ready yet` : '',
  ].filter(Boolean)
  const engines = list(Object.values(ENGINE_NAMES))
  const lines = [
    `- AI answers, checked ${day(found.checked_at)}: ${plural(found.questions.length, 'question')} from Search Console asked in ${engines}. Cited in ${count(counts.cited)} of ${plural(answers, 'answer')}, mentioned by name in ${count(counts.mentioned)}, neither in ${count(counts.neither)}, no AI answer shown in ${count(counts.no_answer)}${unknown.length ? `, ${list(unknown)}` : ''}.`,
  ]
  if (found.previous_checked_at) {
    const shown = found.changes.slice(0, MAX_AI_CHANGES)
    const label = (result: string) => result.replace('_', ' ')
    lines.push(
      shown.length
        ? `  - Changed since ${day(found.previous_checked_at)}:`
        : `  - No answer changed since ${day(found.previous_checked_at)}${counts.unavailable || counts.pending ? ' among the ones known both weeks' : ''}.`,
      ...shown.map(
        (change) =>
          `    - "${change.question}" in ${ENGINE_NAMES[change.engine] ?? change.engine}: ${label(change.from)}, now ${label(change.to)}${change.cited_url ? ` (${change.cited_url})` : ''}.`,
      ),
      ...(found.changes.length > shown.length
        ? [`    - And ${plural(found.changes.length - shown.length, 'more')}.`]
        : []),
    )
  }
  if (found.cited_sites.length) {
    lines.push(
      `  - Sites cited instead: ${found.cited_sites
        .slice(0, 5)
        .map((item) => `${item.host} (${item.answers})`)
        .join(', ')}.`,
    )
  }
  lines.push(
    '  - Each answer is one sample that can change from run to run, so one week’s change is not a trend.',
  )
  return lines
}

// A site's measures whose days after the fix ended in the latest 7 days
// of final Search Console data, so each one is in exactly one weekly
// summary.
export function weekMeasured(
  issues: StoredIssue[],
  now = Date.now(),
): NonNullable<WeekSite['measured']> {
  const latest = latestFinalGscDate(new Date(now))
  const from = shiftIsoDate(latest, -6)
  const all = issues
    .filter((issue) => issue.mark === 'fixed')
    .flatMap((issue) =>
      (issue.measures ?? [])
        .filter((m) => m.after.end >= from && m.after.end <= latest)
        .map((m) => ({ ...m, subject: issue.subject })),
    )
    .sort(
      (a, b) =>
        a.fixed_on.localeCompare(b.fixed_on) ||
        a.subject.localeCompare(b.subject) ||
        a.days - b.days,
    )
  return { total: all.length, items: all.slice(0, MAX_MEASURED) }
}

// The fixes whose 28 or 56 days after ended this week, as facts.
function measuredLines(site: WeekSite): string[] {
  const found = site.measured
  if (!found?.total) return []
  const more = found.total - found.items.length
  return [
    `- After fixes: ${plural(found.total, 'result')} from Search Console, the days from the day an issue was marked fixed against the same days before (timing, not proof the fix caused it).`,
    ...found.items.map((item) => {
      const subject = item.subject.replace(/https?:\/\/[^\s/]+/g, '') || '/'
      const change = item.after.clicks - item.before.clicks
      return `  - ${subject}, ${item.days} days from ${dayLabel(item.fixed_on)}: ${plural(item.after.clicks, 'click')} (${change > 0 ? 'up' : change < 0 ? 'down' : 'level'}${change ? ` ${count(Math.abs(change))}` : ''} on ${count(item.before.clicks)}), ${plural(item.after.impressions, 'impression')} (from ${count(item.before.impressions)}).${item.updates?.length ? ` Google updates in these dates: ${list(item.updates)}.` : ''}`
    }),
    ...(more > 0
      ? [`  - And ${plural(more, 'more')} in the issues list.`]
      : []),
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
    found: issues(site, startMs, endMs, data.first),
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
      ...siteLines(site, startMs, endMs, data.first).map((line) => `- ${line}`),
      ...opportunityLines(site),
      ...aiAnswerLines(site),
      ...measuredLines(site),
      ...updateLines(site),
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
      text: `No site given. Pick one below and send it: ${deps.call('report', { site: '<site>' })}. The summary of every site is for accounts with the weekly site audit.\n\n${list.text}`,
      data: list.data,
    }
  }
  if (!data) {
    throw new CommandError(
      'INVALID_INPUT',
      `No site given. Name one: ${deps.call('report', { site: '<site>' })}. The summary of every site is for accounts with the weekly site audit.`,
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
