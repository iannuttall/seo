import type { BetaFlag } from '../beta.ts'

// Every kind of alert, in one place. A background job queues an alert of a
// type with its data (alerts/deliver.ts); this file says what the type is
// called, who may get it, whether it is on before the person chooses, and
// how its email reads. The webhook body is the same data as JSON, so a new
// type documents its data in apps/mcp/README.md.

export type Channel = 'email' | 'webhook'

export type AlertType<Data> = {
  title: string
  text: string
  // The beta feature (or none) an account needs to get it.
  flag: BetaFlag
  // On or off before the person changes it.
  defaults: Record<Channel, boolean>
  email(data: Data, site: string): { subject: string; text: string }
}

// index-changes: pages that dropped out of Google's index (a top page's
// drop is confirmed by a second check) or came back, from one checks wake
// of one site.
export type IndexChanges = {
  dropped: number
  returned: number
  // Up to MAX_LISTED pages, drops first; listed < dropped + returned when
  // there were more.
  pages: {
    url: string
    change: 'dropped' | 'returned'
    at: string
    verdict: string | null
    coverage: string | null
  }[]
}

export const MAX_LISTED = 100

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`

const indexChanges: AlertType<IndexChanges> = {
  title: 'Google index changes',
  text: 'A page drops out of Google’s index, or comes back.',
  flag: 'weekly-audit',
  defaults: { email: true, webhook: true },
  email(data, site) {
    const parts = [
      data.dropped
        ? `${plural(data.dropped, 'page', 'pages')} dropped out`
        : '',
      data.returned
        ? `${plural(data.returned, 'page', 'pages')} came back`
        : '',
    ].filter(Boolean)
    const lines = data.pages.map(
      (page) =>
        `${page.change === 'dropped' ? 'Dropped out' : 'Back in'}: ${page.url}\n  Google says: ${page.coverage ?? page.verdict ?? 'no reason given'}`,
    )
    const more = data.dropped + data.returned - data.pages.length
    return {
      subject: `${site}: ${parts.join(', ')} of Google’s index`,
      text: [
        `Google URL Inspection found these changes on ${site}.`,
        '',
        ...lines,
        ...(more > 0
          ? [
              '',
              `${plural(more, 'more page', 'more pages')} not listed here. Ask your agent for seo index on this site to see them all.`,
            ]
          : []),
        '',
        'A top page’s drop is reported only after a second check agrees.',
      ].join('\n'),
    }
  },
}

export const ALERTS = {
  'index-changes': indexChanges,
} as const

export type AlertTypeId = keyof typeof ALERTS
export type AlertData = { 'index-changes': IndexChanges }

export const isAlertType = (value: string): value is AlertTypeId =>
  Object.hasOwn(ALERTS, value)
