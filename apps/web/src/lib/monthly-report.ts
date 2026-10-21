// Builds a month-on-month SEO report from a Search Console export, and
// writes it as HTML or Markdown. Pure: the page reads the files and shows
// the result. Totals come from the Dates table, which includes the queries
// Search Console hides for privacy; the query table does not.

import type {
  ExportRow,
  ExportTable,
  ExportTables,
  Metrics,
} from '@/lib/search-console-export'

export type Totals = {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type Mover = {
  label: string
  clicks: number
  previousClicks: number
  change: number
}

export type MonthlyReport = {
  site: string
  current: string
  previous: string
  totals: { current: Totals; previous: Totals }
  daily: { current: number[]; previous: number[] }
  devices: Mover[]
  countries: Mover[]
  pages: { gains: Mover[]; losses: Mover[]; top: Mover[]; compared: boolean }
  queries: { gains: Mover[]; losses: Mover[]; top: Mover[]; compared: boolean }
  notes: string
  limits: string[]
}

export class ReportError extends Error {}

const DAY = 86_400_000

function sum(rows: Metrics[]): Totals {
  let clicks = 0
  let impressions = 0
  let weighted = 0
  let weight = 0
  for (const row of rows) {
    clicks += row.clicks
    impressions += row.impressions
    if (row.position !== null && row.impressions > 0) {
      weighted += row.position * row.impressions
      weight += row.impressions
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: weight > 0 ? weighted / weight : null,
  }
}

const byLabel = (left: { label: string }, right: { label: string }) =>
  left.label < right.label ? -1 : left.label > right.label ? 1 : 0

function movers(table: ExportTable | undefined) {
  if (!table) return { gains: [], losses: [], top: [], compared: false }
  const compared = table.periods.length > 1
  const rows: Mover[] = table.rows.map((row: ExportRow) => ({
    label: row.label,
    clicks: row.current.clicks,
    previousClicks: row.previous?.clicks ?? 0,
    change: row.current.clicks - (row.previous?.clicks ?? 0),
  }))
  const top = [...rows]
    .sort((a, b) => b.clicks - a.clicks || byLabel(a, b))
    .slice(0, 10)
  if (!compared) return { gains: [], losses: [], top, compared }
  return {
    gains: rows
      .filter((row) => row.change > 0)
      .sort((a, b) => b.change - a.change || byLabel(a, b))
      .slice(0, 5),
    losses: rows
      .filter((row) => row.change < 0)
      .sort((a, b) => a.change - b.change || byLabel(a, b))
      .slice(0, 5),
    top,
    compared,
  }
}

function breakdown(table: ExportTable | undefined, limit: number): Mover[] {
  if (!table) return []
  return table.rows
    .map((row) => ({
      label: row.label,
      clicks: row.current.clicks,
      previousClicks: row.previous?.clicks ?? 0,
      change: row.current.clicks - (row.previous?.clicks ?? 0),
    }))
    .sort((a, b) => b.clicks - a.clicks || byLabel(a, b))
    .slice(0, limit)
}

const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
const time = (date: string) => Date.parse(`${date}T00:00:00Z`)

export function formatRange(start: string, end: string): string {
  const format = (date: string, year: boolean) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  return `${format(start, start.slice(0, 4) !== end.slice(0, 4))} to ${format(end, true)}`
}

function monthName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Without a date comparison in the export, the report compares the last two
// complete calendar months in it, else the last 28 days with the 28 before.
function splitDays(table: ExportTable) {
  const days = new Map<string, Metrics>()
  for (const row of table.rows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.label)) days.set(row.label, row.current)
  }
  const dates = [...days.keys()].sort()
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last || dates.length < 56) {
    throw new ReportError(
      'The export needs at least 8 weeks of daily data, or a date comparison. In Search Console, set the date to Compare, Last 28 days against the previous period, then export again.',
    )
  }
  const lastDay = new Date(time(last) + DAY)
  const monthEnd =
    lastDay.getUTCDate() === 1
      ? last
      : iso(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), 0))
  const monthStart = `${monthEnd.slice(0, 8)}01`
  const priorEnd = iso(time(monthStart) - DAY)
  const priorStart = `${priorEnd.slice(0, 8)}01`
  const range = (start: string, end: string) =>
    dates.filter((date) => date >= start && date <= end)
  const full = (start: string, end: string) =>
    range(start, end).length === Math.round((time(end) - time(start)) / DAY) + 1
  if (
    priorStart >= first &&
    full(priorStart, priorEnd) &&
    full(monthStart, monthEnd)
  ) {
    return {
      current: monthName(monthStart),
      previous: monthName(priorStart),
      currentDays: range(monthStart, monthEnd).map(
        (date) => days.get(date) as Metrics,
      ),
      previousDays: range(priorStart, priorEnd).map(
        (date) => days.get(date) as Metrics,
      ),
    }
  }
  const end = last
  const start = iso(time(end) - 27 * DAY)
  const beforeEnd = iso(time(start) - DAY)
  const beforeStart = iso(time(beforeEnd) - 27 * DAY)
  return {
    current: formatRange(start, end),
    previous: formatRange(beforeStart, beforeEnd),
    currentDays: range(start, end).map((date) => days.get(date) as Metrics),
    previousDays: range(beforeStart, beforeEnd).map(
      (date) => days.get(date) as Metrics,
    ),
  }
}

export function buildMonthlyReport(
  tables: ExportTables,
  options: { site: string; notes: string },
): MonthlyReport {
  const dates = tables.dates
  if (!dates) {
    throw new ReportError(
      'The export has no Dates table, so there are no totals to report. Use the whole zip from Export, Download CSV.',
    )
  }
  const limits: string[] = [
    'Totals include searches Search Console keeps private. The query table does not, so its rows add up to less than the totals.',
  ]
  let current: string
  let previous: string
  let currentDays: Metrics[]
  let previousDays: Metrics[]
  if (dates.periods.length > 1) {
    const ordered = [...dates.rows]
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.label))
      .sort(byLabel)
    const labels = ordered.map((row) => row.label)
    current = dates.periods[0] ?? 'This period'
    previous = dates.periods[1] ?? 'Previous period'
    if (labels[0] && labels.at(-1)) {
      current = `${current} (${formatRange(labels[0], labels.at(-1) ?? labels[0])})`
    }
    currentDays = ordered.map((row) => row.current)
    previousDays = ordered.flatMap((row) =>
      row.previous ? [row.previous] : [],
    )
  } else {
    const split = splitDays(dates)
    current = split.current
    previous = split.previous
    currentDays = split.currentDays
    previousDays = split.previousDays
    limits.push(
      'The export has no date comparison, so the page and query tables cover the whole export, not one month. Export with Compare to see which pages and queries moved.',
    )
  }
  const pages = movers(tables.pages)
  const queries = movers(tables.queries)
  for (const table of [tables.pages, tables.queries]) {
    if (table && table.rows.length >= 1000) {
      limits.push(
        `Search Console exports up to 1,000 ${table.kind}, so smaller ones are missing from the ${table.kind} tables.`,
      )
    }
  }
  return {
    site: options.site.trim() || 'Your site',
    current,
    previous,
    totals: { current: sum(currentDays), previous: sum(previousDays) },
    daily: {
      current: currentDays.map((day) => day.clicks),
      previous: previousDays.map((day) => day.clicks),
    },
    devices: breakdown(tables.devices, 3),
    countries: breakdown(tables.countries, 5),
    pages,
    queries,
    notes: options.notes.trim(),
    limits,
  }
}

// Words and numbers shared by both formats.

const whole = (value: number) => Math.round(value).toLocaleString('en-GB')

export function change(
  current: number | null,
  previous: number | null,
  kind: 'count' | 'ctr' | 'position',
): string {
  if (current === null || previous === null) return 'no comparison'
  if (kind === 'position') {
    const delta = current - previous
    if (Math.abs(delta) < 0.05) return 'no change'
    return `${delta < 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} places`
  }
  if (kind === 'ctr') {
    const delta = (current - previous) * 100
    if (Math.abs(delta) < 0.005) return 'no change'
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} points`
  }
  if (previous === 0) return current === 0 ? 'no change' : 'new'
  const percent = ((current - previous) / previous) * 100
  if (Math.abs(percent) < 0.5) return 'no change'
  return `${percent > 0 ? '+' : '−'}${Math.abs(Math.round(percent))}%`
}

export function totalsRows(report: MonthlyReport) {
  const { current, previous } = report.totals
  return [
    {
      name: 'Clicks',
      value: whole(current.clicks),
      before: whole(previous.clicks),
      change: change(current.clicks, previous.clicks, 'count'),
    },
    {
      name: 'Impressions',
      value: whole(current.impressions),
      before: whole(previous.impressions),
      change: change(current.impressions, previous.impressions, 'count'),
    },
    {
      name: 'Click-through rate',
      value:
        current.ctr === null ? 'n/a' : `${(current.ctr * 100).toFixed(2)}%`,
      before:
        previous.ctr === null ? 'n/a' : `${(previous.ctr * 100).toFixed(2)}%`,
      change: change(current.ctr, previous.ctr, 'ctr'),
    },
    {
      name: 'Average position',
      value: current.position === null ? 'n/a' : current.position.toFixed(1),
      before: previous.position === null ? 'n/a' : previous.position.toFixed(1),
      change: change(current.position, previous.position, 'position'),
    },
  ]
}

function sentence(report: MonthlyReport): string {
  const { current, previous } = report.totals
  const clicks = change(current.clicks, previous.clicks, 'count')
  const impressions = change(current.impressions, previous.impressions, 'count')
  const describe = (value: string) =>
    value === 'no change'
      ? 'held steady'
      : value === 'new'
        ? 'started from zero'
        : value.startsWith('+')
          ? `rose ${value.slice(1)}`
          : `fell ${value.slice(1)}`
  return `Clicks from Google search ${describe(clicks)} to ${whole(current.clicks)} and impressions ${describe(impressions)} to ${whole(current.impressions)}, against ${inSentence(report.previous)}.`
}

// "Previous 28 days" reads as "the previous 28 days" inside a sentence.
export function inSentence(label: string): string {
  return /^(Last|Previous|Current|This)\b/.test(label)
    ? `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`
    : label
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) =>
    character === '&'
      ? '&amp;'
      : character === '<'
        ? '&lt;'
        : character === '>'
          ? '&gt;'
          : '&quot;',
  )

function sparkline(report: MonthlyReport, width = 640, height = 120): string {
  const all = [...report.daily.current, ...report.daily.previous]
  if (report.daily.current.length < 2) return ''
  const max = Math.max(1, ...all) * 1.1
  const length = Math.max(
    report.daily.current.length,
    report.daily.previous.length,
  )
  const x = (index: number) =>
    4 + (index / Math.max(1, length - 1)) * (width - 8)
  const y = (value: number) => height - 6 - (value / max) * (height - 12)
  const path = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`,
      )
      .join('')
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="Daily clicks, this period against the previous period"><path d="${path(report.daily.previous)}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/><path d="${path(report.daily.current)}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`
}

function moverTable(
  title: string,
  rows: Mover[],
  compared: boolean,
  link: boolean,
): string {
  if (!rows.length) return ''
  const body = rows
    .map((row) => {
      const name =
        link && /^https?:\/\//.test(row.label)
          ? `<a href="${escapeHtml(row.label)}">${escapeHtml(row.label.replace(/^https?:\/\/[^/]+/, '') || '/')}</a>`
          : escapeHtml(row.label)
      return `<tr><td>${name}</td><td>${whole(row.clicks)}</td>${compared ? `<td>${whole(row.previousClicks)}</td><td>${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${whole(Math.abs(row.change))}</td>` : ''}</tr>`
    })
    .join('')
  return `<h3>${escapeHtml(title)}</h3><table><thead><tr><th></th><th>Clicks</th>${compared ? '<th>Before</th><th>Change</th>' : ''}</tr></thead><tbody>${body}</tbody></table>`
}

/** The report body as HTML, for the page preview and the download. */
export function reportHtml(report: MonthlyReport): string {
  const totals = totalsRows(report)
    .map(
      (row) =>
        `<div class="stat"><p class="name">${row.name}</p><p class="value">${row.value}</p><p class="change">${row.change} <span>(was ${row.before})</span></p></div>`,
    )
    .join('')
  const pageSection = report.pages.compared
    ? moverTable(
        'Pages that gained the most clicks',
        report.pages.gains,
        true,
        true,
      ) +
      moverTable(
        'Pages that lost the most clicks',
        report.pages.losses,
        true,
        true,
      )
    : moverTable('Top pages by clicks', report.pages.top, false, true)
  const querySection = report.queries.compared
    ? moverTable(
        'Queries that gained the most clicks',
        report.queries.gains,
        true,
        false,
      ) +
      moverTable(
        'Queries that lost the most clicks',
        report.queries.losses,
        true,
        false,
      )
    : moverTable('Top queries by clicks', report.queries.top, false, false)
  return [
    `<h2>SEO report for ${escapeHtml(report.site)}</h2>`,
    `<p class="period">${escapeHtml(report.current)}, against ${escapeHtml(inSentence(report.previous))}. Google search, from Search Console.</p>`,
    `<p>${escapeHtml(sentence(report))}</p>`,
    `<div class="stats">${totals}</div>`,
    sparkline(report)
      ? `<figure>${sparkline(report)}<figcaption>Daily clicks. Solid: ${escapeHtml(report.current)}. Dashed: ${escapeHtml(report.previous)}.</figcaption></figure>`
      : '',
    report.devices.length
      ? moverTable(
          'Clicks by device',
          report.devices,
          report.pages.compared || report.queries.compared,
          false,
        )
      : '',
    pageSection,
    querySection,
    report.countries.length
      ? moverTable(
          'Top countries',
          report.countries,
          report.pages.compared || report.queries.compared,
          false,
        )
      : '',
    report.notes
      ? `<h3>Notes</h3>${report.notes
          .split(/\n{2,}/)
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join('')}`
      : '',
    `<h3>About this data</h3><ul>${report.limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul>`,
  ].join('')
}

/** The report as Markdown. */
export function reportMarkdown(report: MonthlyReport): string {
  const table = (title: string, rows: Mover[], compared: boolean) =>
    rows.length
      ? `${[
          `### ${title}`,
          '',
          compared ? '| | Clicks | Before | Change |' : '| | Clicks |',
          compared ? '| --- | ---: | ---: | ---: |' : '| --- | ---: |',
          ...rows.map((row) =>
            compared
              ? `| ${row.label.replace(/\|/g, '\\|')} | ${whole(row.clicks)} | ${whole(row.previousClicks)} | ${row.change > 0 ? '+' : row.change < 0 ? '−' : ''}${whole(Math.abs(row.change))} |`
              : `| ${row.label.replace(/\|/g, '\\|')} | ${whole(row.clicks)} |`,
          ),
        ].join('\n')}\n\n`
      : ''
  const compared = report.pages.compared || report.queries.compared
  return [
    `# SEO report for ${report.site}`,
    '',
    `${report.current}, against ${inSentence(report.previous)}. Google search, from Search Console.`,
    '',
    sentence(report),
    '',
    '| | This period | Before | Change |',
    '| --- | ---: | ---: | --- |',
    ...totalsRows(report).map(
      (row) => `| ${row.name} | ${row.value} | ${row.before} | ${row.change} |`,
    ),
    '',
    table('Clicks by device', report.devices, compared),
    report.pages.compared
      ? table('Pages that gained the most clicks', report.pages.gains, true) +
        table('Pages that lost the most clicks', report.pages.losses, true)
      : table('Top pages by clicks', report.pages.top, false),
    report.queries.compared
      ? table(
          'Queries that gained the most clicks',
          report.queries.gains,
          true,
        ) +
        table('Queries that lost the most clicks', report.queries.losses, true)
      : table('Top queries by clicks', report.queries.top, false),
    table('Top countries', report.countries, compared),
    report.notes ? `## Notes\n\n${report.notes}\n` : '',
    '## About this data',
    '',
    ...report.limits.map((limit) => `- ${limit}`),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

export const REPORT_STYLES = `
.monthly-report{font:15px/1.6 system-ui,sans-serif;color:inherit}
.monthly-report h2{font-size:1.4rem;font-weight:500;margin:0}
.monthly-report h3{font-size:1rem;font-weight:500;margin:1.75rem 0 .5rem}
.monthly-report p{margin:.5rem 0}
.monthly-report .period{opacity:.7;font-size:.9rem}
.monthly-report .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:1rem 0}
.monthly-report .stat{border-radius:.5rem;padding:.75rem 1rem;background:rgba(127,127,127,.08)}
.monthly-report .stat .name{font-size:.8rem;opacity:.7;margin:0}
.monthly-report .stat .value{font-size:1.5rem;font-weight:500;margin:.1rem 0}
.monthly-report .stat .change{font-size:.85rem;margin:0}
.monthly-report .stat .change span{opacity:.6}
.monthly-report figure{margin:1rem 0}
.monthly-report figcaption{font-size:.8rem;opacity:.7}
.monthly-report table{width:100%;border-collapse:collapse;font-size:.9rem}
.monthly-report th{font-weight:400;font-size:.8rem;opacity:.7;text-align:right;padding:.35rem .5rem}
.monthly-report th:first-child,.monthly-report td:first-child{text-align:left;padding-left:0;word-break:break-all}
.monthly-report td{border-top:1px solid rgba(127,127,127,.2);padding:.4rem .5rem;text-align:right;white-space:nowrap}
.monthly-report td:first-child{white-space:normal}
.monthly-report a{color:inherit}
.monthly-report ul{padding-left:1.25rem;font-size:.85rem;opacity:.8}
`
