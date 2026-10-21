import { SeoError } from '../errors.js'
import { finalGscDateRange } from '../gsc/dates.js'
import type { InternalLinksReport } from './internal-links-types.js'

const DAY = 86_400_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// The Search Console window: the dates sent, or the last `fallbackDays` days
// of final data.
export function internalLinksReportRange(
  input: { startDate?: string; endDate?: string },
  fallbackDays: number,
  now: Date,
): { startDate: string; endDate: string; days: number } {
  if (!input.startDate && !input.endDate) {
    return { ...finalGscDateRange(fallbackDays, now), days: fallbackDays }
  }
  const { startDate, endDate } = input
  if (
    !startDate ||
    !endDate ||
    !ISO_DAY.test(startDate) ||
    !ISO_DAY.test(endDate) ||
    startDate > endDate
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Send a start date and an end date together, in order, as YYYY-MM-DD.',
    )
  }
  const days =
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        DAY,
    ) + 1
  return { startDate, endDate, days }
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

export function internalLinksVerdict(
  report: Pick<
    InternalLinksReport,
    'mode' | 'dataStatus' | 'crawl' | 'judge' | 'target'
  > & {
    counts: InternalLinksReport['summary']
  },
): string {
  const { counts } = report
  if (report.dataStatus === 'blocked') {
    return 'robots.txt does not allow this crawler to read the site, so nothing was checked.'
  }
  if (report.dataStatus === 'empty') {
    return 'No HTML page could be crawled, so there is nothing to link.'
  }
  if (report.dataStatus === 'target-not-crawled') {
    return 'The target page could not be crawled as its own page (it failed, left the site, or names another page as canonical). Check it with seo page first.'
  }
  if (report.dataStatus === 'target-not-linkable') {
    return `The target is ${report.target?.noindex ? 'noindex' : `a ${report.target?.type?.replaceAll('_', ' ')} page`}, so no links to it are suggested.`
  }
  const judged =
    report.judge.status === 'used' || report.judge.status === 'partial'
      ? `${counts.strong} strong and ${counts.possible} possible link${counts.strong + counts.possible === 1 ? '' : 's'} judged by ${report.judge.model}${counts.heuristic ? `, plus ${plural(counts.heuristic, 'heuristic link')} where a request failed` : ''}`
      : `${plural(counts.heuristic, 'heuristic link')} (no decision model)`
  const scope =
    report.mode === 'url'
      ? `to ${report.target?.url}`
      : `across ${plural(counts.pagesCrawled, 'page')}`
  const capped = report.crawl.capReached
    ? ` The crawl stopped at its limit of ${report.crawl.pageLimit} pages, so pages beyond it were not checked.`
    : ''
  return `${judged} ${scope}${counts.heldBack ? `; ${counts.heldBack} held back by the evidence floors` : ''}.${capped}`
}
