import {
  impactLines,
  siteName,
  type UpdateImpact,
  type WeekData,
  weekMarkdown,
  weekTitle,
} from '@seo/core/commands'
import type { BetaFlag } from '../beta.ts'

// Every kind of alert, in one place. A background job queues an alert of a
// type with its data (alerts/deliver.ts); this file says what the type is
// called, who may get it, whether it is on before the person chooses, and
// how its email reads, as Markdown (alerts/email.ts draws every email in
// the same plain layout). The webhook body is the same data as JSON, so a new
// type documents its data in apps/mcp/README.md.

export type Channel = 'email' | 'webhook'

export type AlertType<Data> = {
  title: string
  text: string
  // The beta feature (or none) an account needs to get it.
  flag: BetaFlag
  // On or off before the person changes it.
  defaults: Record<Channel, boolean>
  email(
    data: Data,
    site: string,
  ): { subject: string; preview: string; markdown: string }
}

// index-changes: one roundup a day, once the Search Console day's checks
// are done (audit/index-roundup.ts), of every audited site's pages that
// dropped out of Google's index (a top page's drop is confirmed by a second
// check) or got into it since the last roundup. Only sites with changes.
type IndexPage = {
  url: string
  change: 'dropped' | 'returned'
  at: string
  verdict: string | null
  coverage: string | null
}

export type IndexSiteChanges = {
  property: string
  dropped: number
  returned: number
  // Up to MAX_LISTED pages, drops first; listed < dropped + returned when
  // there were more.
  pages: IndexPage[]
}

export type IndexChanges = { sites: IndexSiteChanges[] }

export const MAX_LISTED = 100

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`

// One site's changes: drops, then newly indexed pages, each grouped by
// what Google says, the biggest group first. Links show the path.
function siteChanges(site: IndexSiteChanges, level: string): string[] {
  const lines: string[] = []
  const sections = [
    [
      'dropped',
      `Dropped out of Google’s index (${site.dropped.toLocaleString('en')})`,
    ],
    ['returned', `Now indexed (${site.returned.toLocaleString('en')})`],
  ] as const
  for (const [change, heading] of sections) {
    const groups = new Map<string, IndexPage[]>()
    for (const page of site.pages.filter((item) => item.change === change)) {
      const reason = page.coverage ?? page.verdict ?? 'No reason given'
      groups.set(reason, [...(groups.get(reason) ?? []), page])
    }
    if (!groups.size) continue
    lines.push('', `${level} ${heading}`)
    const sorted = [...groups].sort(
      ([a, x], [b, y]) => y.length - x.length || a.localeCompare(b),
    )
    for (const [reason, pages] of sorted) {
      lines.push('', `${reason}:`)
      for (const page of pages) {
        let path = page.url
        try {
          const url = new URL(page.url)
          path = `${url.pathname}${url.search}`
        } catch {}
        // A drop gets a one-click site: search, because search results can
        // lag URL Inspection by days.
        const check =
          change === 'dropped'
            ? ` ([check Google](https://www.google.com/search?q=${encodeURIComponent(`site:${page.url}`)}))`
            : ''
        lines.push(`- [${path}](${page.url})${check}`)
      }
    }
  }
  const more = site.dropped + site.returned - site.pages.length
  if (more > 0) {
    lines.push(
      '',
      `${plural(more, 'more page', 'more pages')} not listed here. Ask your agent for seo index on this site to see them all.`,
    )
  }
  return lines
}

// Under every index roundup.
const INDEX_NOTE = [
  'URL Inspection shows Google’s latest indexing decision. Search results can take a few days to catch up, so a dropped page may still show in a site: search for a while (and Google sometimes puts it back). Use check Google to see what search shows now.',
  '',
  'A top page’s drop is reported only after a second check agrees.',
]

const indexChanges: AlertType<IndexChanges> = {
  title: 'Google index changes',
  text: 'Once a day, the pages that dropped out of Google’s index or got into it.',
  flag: 'weekly-audit',
  defaults: { email: true, webhook: true },
  email(saved, site) {
    // Alerts queued before the daily roundup held one site's changes.
    const data =
      'sites' in saved
        ? saved
        : {
            sites: [
              {
                ...(saved as Omit<IndexSiteChanges, 'property'>),
                property: site,
              },
            ],
          }
    const dropped = data.sites.reduce((sum, site) => sum + site.dropped, 0)
    const returned = data.sites.reduce((sum, site) => sum + site.returned, 0)
    const summary = [
      dropped
        ? `${plural(dropped, 'page', 'pages')} dropped out of Google`
        : '',
      returned ? `${plural(returned, 'page', 'pages')} now indexed` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const names = data.sites.map((site) => siteName(site.property))
    return {
      subject:
        names.length === 1
          ? `${names[0]}: ${summary}`
          : `${summary} on ${names.length} sites`,
      preview: `The daily Google index roundup for ${names.join(', ')}.`,
      markdown: [
        `Google’s URL Inspection checks since the last roundup found these changes on ${names.length === 1 ? names[0] : 'your sites'}.`,
        ...data.sites.flatMap((site) => [
          '',
          `## ${siteName(site.property)}`,
          ...siteChanges(site, '###'),
        ]),
        '',
        ...INDEX_NOTE,
      ].join('\n'),
    }
  },
}

// How to hand the week to an agent instead of reading it, at the end of
// the summary email only. Tools already run inside an agent.
const autopilot = (account: string) =>
  [
    '',
    '',
    '## Put it on autopilot',
    '',
    `- This summary also goes out as signed JSON to a webhook every Monday, with the same data as this email. Save a URL under Alerts: ${account}#alerts`,
    '- Point the webhook at a weekly agent run, such as a Claude Code or Codex job, n8n or a GitHub Action, so an agent looks into each change as it lands.',
    '- Index changes also go to the webhook in a daily roundup the other six days.',
    '- Any agent connected to SEO Skill can read this week with seo_report and no site.',
  ].join('\n')

// weekly-summary: every audited site's last full week, Monday to Sunday,
// sent on Monday morning (audit/week.ts). The same Markdown as seo report
// with no site, then Monday's index roundup (pages that dropped out of or
// got into Google's index since Sunday's), then how to automate it.
export type WeeklySummary = WeekData & { index_changes?: IndexSiteChanges[] }

const weeklySummary: AlertType<WeeklySummary> = {
  title: 'Weekly summary',
  text: 'Every Monday, what happened on each of your sites last week.',
  flag: 'weekly-audit',
  defaults: { email: true, webhook: true },
  email(data) {
    const roundup = (data.index_changes ?? []).flatMap((site) => [
      '',
      `### ${siteName(site.property)}`,
      ...siteChanges(site, '####'),
    ])
    const index = roundup.length
      ? [
          '',
          '',
          '## Google index changes since the last daily roundup',
          ...roundup,
          '',
          ...INDEX_NOTE,
        ].join('\n')
      : ''
    const markdown = `${weekMarkdown(data)}${index}${data.sites.length ? autopilot(data.account) : ''}`
    // The verdict line, for the inbox preview.
    const verdict = markdown.split('\n')[2] ?? ''
    return { subject: weekTitle(data), preview: verdict, markdown }
  },
}

// google-update: Google posted that a ranking update started rolling out,
// or that it finished (audit/google-updates.ts), within the hour, once per
// phase and account, covering every audited site.
export type GoogleUpdate = {
  id: string
  // Google's own name for it, such as "November 2026 core update".
  name: string
  // impact: what moved on each site, once final data covers the update.
  phase: 'started' | 'finished' | 'impact'
  // ISO times from Google's feed; end is null while it rolls out.
  start: string
  end: string | null
  // The notice on Google's Search Status Dashboard.
  url: string
}

export type GoogleUpdateAlert = {
  update: GoogleUpdate
  sites: string[]
  // impact only: each site's result, and the sites Search Console could
  // not be read for.
  impacts?: UpdateImpact[]
  unread?: string[]
}

const VERDICT_ORDER = {
  'outside-normal': 0,
  'within-normal': 1,
  'not-enough-data': 2,
} as const

// "4 Nov 2026" in UTC.
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

const googleUpdate: AlertType<GoogleUpdateAlert> = {
  title: 'Google updates',
  text: 'When Google starts or finishes a ranking update, such as a core or spam update, then what moved on your sites.',
  flag: 'weekly-audit',
  defaults: { email: true, webhook: true },
  email({ update, sites, impacts, unread }) {
    const names = sites.map(siteName)
    if (update.phase === 'impact') {
      const sorted = [...(impacts ?? [])].sort(
        (a, b) =>
          VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
          siteName(a.site).localeCompare(siteName(b.site)),
      )
      const outside = sorted.filter((i) => i.verdict === 'outside-normal')
      const summary = outside.length
        ? `${outside.length} of ${sorted.length} ${sorted.length === 1 ? 'site' : 'sites'} moved more than usual`
        : `No site moved more than usual`
      return {
        subject: `What moved during the ${update.name}`,
        preview: `${summary}.`,
        markdown: [
          `Search Console’s final data now covers the ${update.name}. ${summary}, judged against each site’s own movement in the weeks before (a heuristic).`,
          ...sorted.flatMap((impact) => [
            '',
            `## ${siteName(impact.site)}`,
            '',
            ...impactLines(impact).map((line) => `- ${line}`),
          ]),
          ...(unread?.length
            ? [
                '',
                `Search Console could not be read for ${unread.map(siteName).join(', ')}. Ask your agent for seo_report with section google-updates on ${unread.length === 1 ? 'it' : 'them'}.`,
              ]
            : []),
        ].join('\n'),
      }
    }
    const yours = names.length
      ? `Your audited ${names.length === 1 ? 'site' : 'sites'}: ${names.join(', ')}.`
      : ''
    const notice = `[Google’s notice](${update.url})`
    if (update.phase === 'started' || !update.end) {
      return {
        subject: `Google started the ${update.name}`,
        preview: `It began rolling out on ${dayOf(update.start)}.`,
        markdown: [
          `Google’s Search Status Dashboard says the ${update.name} began rolling out on ${dayOf(update.start)} (UTC). ${notice}`,
          '',
          `Rankings can move while an update rolls out, so a change in your Search Console clicks in these days may line up with it. Lining up is timing only: it does not show the update caused the change. ${yours}`,
          '',
          'You get one more email when Google says it has finished.',
        ].join('\n'),
      }
    }
    const days = Math.round(
      (Date.parse(update.end) - Date.parse(update.start)) / 86_400_000,
    )
    return {
      subject: `Google finished the ${update.name}`,
      preview: `It ran from ${dayOf(update.start)} to ${dayOf(update.end)}.`,
      markdown: [
        `Google’s Search Status Dashboard says the ${update.name} finished rolling out on ${dayOf(update.end)}, ${days} ${days === 1 ? 'day' : 'days'} after it began on ${dayOf(update.start)} (UTC). ${notice}`,
        '',
        `Search Console’s final data runs a few days behind. Once it covers the update, you get one more email with what moved on each audited site. Your agent can ask sooner with seo_report and section google-updates. A change that lines up with the update is timing only, not proof it caused it. ${yours}`,
      ].join('\n'),
    }
  },
}

export const ALERTS = {
  'google-update': googleUpdate,
  'index-changes': indexChanges,
  'weekly-summary': weeklySummary,
} as const

export type AlertTypeId = keyof typeof ALERTS
export type AlertData = {
  'google-update': GoogleUpdateAlert
  'index-changes': IndexChanges
  'weekly-summary': WeeklySummary
}

export const isAlertType = (value: string): value is AlertTypeId =>
  Object.hasOwn(ALERTS, value)
