import { latestFinalGscDate, shiftIsoDate } from '@seo/core/hosted'
import { z } from 'zod'
import { inspectUrl, resolveProperty, searchAnalytics } from '../google.ts'
import { pageFacts } from '../pages.ts'
import { rowsText } from './data.ts'
import { table } from './present.ts'
import {
  DateWindow,
  Detail,
  defineTool,
  PAGE_SIZE,
  Site,
  ToolError,
} from './registry.ts'
import {
  dateWindow,
  earlierRange,
  FACTS_ONLY,
  googleUpdates,
  listOfUpdates,
  originOf,
  overviewText,
  reader,
  siteOverview,
} from './reports.ts'

// One page, a before and after comparison, and pages that lost their clicks.
// Each reads Search Console with the caller's token and checks pages live.

type Row = Record<string, unknown>

// Google's index status for one URL from the URL Inspection API.
async function inspection(
  google: string,
  property: string,
  url: string,
): Promise<Row> {
  const result = (await inspectUrl(google, property, url).catch((error) =>
    error instanceof ToolError ? null : Promise.reject(error),
  )) as { indexStatusResult?: Record<string, unknown> } | null
  const status = result?.indexStatusResult ?? {}
  return {
    verdict: status.verdict ?? null,
    coverage: status.coverageState ?? null,
    indexing: status.indexingState ?? null,
    last_crawl: status.lastCrawlTime ?? null,
    google_canonical: status.googleCanonical ?? null,
    user_canonical: status.userCanonical ?? null,
  }
}

export const seoPage = defineTool({
  name: 'seo_page',
  title: 'One page',
  description:
    'Everything for one URL: live page facts (status, redirect, title, description, H1, canonical, robots), Google’s index status from URL Inspection, and the page’s Search Console queries against the previous period.',
  input: z.object({
    url: z.url(),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.url)
    const range = dateWindow(input, 28)
    const before = earlierRange(range, 'previous-period')
    const query = (window: typeof range) =>
      searchAnalytics(
        context.google,
        property,
        {
          ...window,
          dimensions: ['query'],
          type: 'web',
          dimensionFilterGroups: [
            {
              groupType: 'and',
              filters: [
                {
                  dimension: 'page',
                  operator: 'equals',
                  expression: input.url,
                },
              ],
            },
          ],
        },
        5000,
      )
    const [[facts], indexed, now, then] = await Promise.all([
      pageFacts([input.url]),
      inspection(context.google, property, input.url),
      query(range),
      query(before),
    ])
    const old = new Map(then.rows.map((row) => [row.keys[0], row]))
    const seen = new Set<string>()
    const rows: Row[] = now.rows.map((row) => {
      seen.add(row.keys[0] ?? '')
      const earlier = old.get(row.keys[0])
      return {
        query: row.keys[0],
        clicks: row.clicks,
        previous_clicks: earlier?.clicks ?? 0,
        clicks_change: row.clicks - (earlier?.clicks ?? 0),
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        previous_position: earlier?.position ?? null,
      }
    })
    for (const row of then.rows) {
      if (seen.has(row.keys[0] ?? '')) continue
      rows.push({
        query: row.keys[0],
        clicks: 0,
        previous_clicks: row.clicks,
        clicks_change: -row.clicks,
        impressions: 0,
        ctr: 0,
        position: null,
        previous_position: row.position,
      })
    }
    rows.sort(
      (a, b) =>
        Number(b.clicks) - Number(a.clicks) ||
        Number(b.impressions) - Number(a.impressions),
    )
    const sum = (list: typeof now.rows, key: 'clicks' | 'impressions') =>
      list.reduce((total, row) => total + row[key], 0)
    const live = facts as unknown as Row
    return `${rowsText({
      title: `${input.url} in ${property}, ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
      notes: [
        `Live page (fetched now, no redirects followed):\n${table([live], ['status', 'redirects_to', 'title', 'description', 'h1', 'canonical', 'robots', ...(live.error ? ['error'] : [])], null, 320)}`,
        `Google index status:\n${table([indexed], Object.keys(indexed), null)}`,
        `Query totals: clicks ${sum(now.rows, 'clicks')} (was ${sum(then.rows, 'clicks')}), impressions ${sum(now.rows, 'impressions')} (was ${sum(then.rows, 'impressions')}). Search Console hides rare queries, so these can be lower than the page total.`,
      ],
      rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
    })}\n\nNext: seo_research serp with the top query to see who else ranks.\n\n${FACTS_ONLY}`
  },
})

export const seoCompare = defineTool({
  name: 'seo_compare',
  title: 'Before and after a date',
  description:
    'Compares equal periods before and after a date, such as a site change or a Google update: totals, devices, and the pages and queries that moved, with Google updates in the window. Optional pages narrows it to URLs that contain that text, such as /blog/.',
  input: z.object({
    site: Site,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('YYYY-MM-DD: the first day after the change.'),
    pages: z
      .string()
      .min(1)
      .optional()
      .describe('Optional URL text, such as /blog/.'),
  }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.site)
    const last = latestFinalGscDate()
    const daysAfter =
      Math.round((Date.parse(last) - Date.parse(input.date)) / 86_400_000) + 1
    if (daysAfter < 3) {
      throw new ToolError(
        'INVALID_INPUT',
        `Search Console has final data to ${last}. Use a date at least 3 days before that.`,
      )
    }
    const days = Math.min(28, daysAfter)
    const after = {
      startDate: input.date,
      endDate: shiftIsoDate(input.date, days - 1),
    }
    const before = {
      startDate: shiftIsoDate(input.date, -days),
      endDate: shiftIsoDate(input.date, -1),
    }
    const [report, updates] = await Promise.all([
      siteOverview(
        reader(context.google),
        property,
        after,
        before,
        input.pages,
      ),
      googleUpdates({ start: before.startDate, end: after.endDate }),
    ])
    return [
      overviewText(
        report,
        `Compare on ${property}: ${days} days after ${input.date}`,
        originOf(property),
        10,
      ),
      listOfUpdates(updates),
      'Next: seo_page for a page that moved.',
      FACTS_ONLY,
    ]
      .filter(Boolean)
      .join('\n\n')
  },
})

const LOST_SHARE = 0.2
const MIN_LOST = 3
const CHECKED = 20
const INSPECTED = 10

export const seoIndex = defineTool({
  name: 'seo_index',
  title: 'Pages that lost their clicks',
  description: `Pages that had at least ${MIN_LOST} clicks in the previous 28 days and kept ${LOST_SHARE * 100}% or less of them in the last 28 days, with a live check of the top ${CHECKED} and Google’s index status for the top ${INSPECTED}. It shows pages that broke, redirect, block indexing or dropped out of Google.`,
  input: z.object({ site: Site, ...DateWindow }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.site)
    const range = dateWindow(input, 28)
    const before = earlierRange(range, 'previous-period')
    const read = (window: typeof range) =>
      searchAnalytics(
        context.google,
        property,
        { ...window, dimensions: ['page'], type: 'web' },
        25_000,
      )
    const [now, then] = await Promise.all([read(range), read(before)])
    const current = new Map(now.rows.map((row) => [row.keys[0], row.clicks]))
    const lost = then.rows
      .filter((row) => row.clicks >= MIN_LOST && !row.keys[0]?.includes('#'))
      .map((row) => ({
        url: row.keys[0] ?? '',
        previous_clicks: row.clicks,
        clicks: current.get(row.keys[0]) ?? 0,
      }))
      .filter((row) => row.clicks <= row.previous_clicks * LOST_SHARE)
      .sort(
        (a, b) =>
          b.previous_clicks - b.clicks - (a.previous_clicks - a.clicks) ||
          a.url.localeCompare(b.url),
      )
    const top = lost.slice(0, CHECKED)
    const [facts, indexed] = await Promise.all([
      pageFacts(top.map((row) => row.url)),
      Promise.all(
        top
          .slice(0, INSPECTED)
          .map((row) => inspection(context.google, property, row.url)),
      ),
    ])
    const rows = top.map((row, index) => ({
      ...row,
      status: facts[index]?.status ?? null,
      redirects_to: facts[index]?.redirects_to ?? null,
      robots: facts[index]?.robots ?? null,
      canonical: facts[index]?.canonical ?? null,
      verdict: indexed[index]?.verdict ?? null,
      coverage: indexed[index]?.coverage ?? null,
      google_canonical: indexed[index]?.google_canonical ?? null,
    }))
    return [
      `Pages that lost their clicks on ${property}: ${range.startDate} to ${range.endDate} against ${before.startDate} to ${before.endDate}.`,
      `${lost.length} pages kept ${LOST_SHARE * 100}% or less of at least ${MIN_LOST} clicks${lost.length > CHECKED ? `; the top ${CHECKED} by clicks lost are shown` : ''}.`,
      rows.length
        ? table(rows, Object.keys(rows[0] ?? {}), originOf(property))
        : 'No pages lost their clicks.',
      'Live checks are fetched now with no redirects followed. Index status is from URL Inspection; Google allows about 2,000 inspections a day per property.',
      'Next: seo_page for one URL; seo_report section "content-decay" for pages that lost part of their clicks.',
      FACTS_ONLY,
    ].join('\n\n')
  },
})
