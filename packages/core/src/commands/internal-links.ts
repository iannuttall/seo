import type { InternalLinksReport } from '../analyze/internal-links-types.js'
import type { Detail } from './present.js'
import { table } from './present.js'

// `seo internal-links` as text for the CLI and the local MCP: a summary with
// the strongest links first, then pages of rows, then every field as JSON.

const SUMMARY_ROWS = 10
const PAGE_SIZE = 50

function rows(report: InternalLinksReport, from: number, size: number) {
  return report.items.slice(from, from + size).map((item) => ({
    source: item.source,
    target: item.target,
    tier: item.tier,
    p: item.probability ?? '',
    role: item.role ?? '',
    anchor: item.anchor ?? '',
    sentence: item.sentence ?? 'no sentence: needs new text',
  }))
}

export function internalLinksText(
  report: InternalLinksReport,
  options: {
    detail: Detail
    offset: number
    // The command for another view, such as the next page of rows.
    more: (detail: Detail, offset?: number) => string
  },
): string {
  if (options.detail === 'full') {
    return `${report.summary.verdict}\n\n${JSON.stringify(report)}`
  }
  // The origin the crawl landed on (after a redirect to www, say), so the
  // table shows paths.
  const origin = (() => {
    try {
      return new URL(
        report.items[0]?.source ?? report.target?.url ?? report.crawl.startUrl,
      ).origin
    } catch {
      return null
    }
  })()
  const columns = [
    'source',
    'target',
    'tier',
    'p',
    'role',
    'anchor',
    'sentence',
  ]
  if (options.detail === 'rows') {
    const page = rows(report, options.offset, PAGE_SIZE)
    const end = options.offset + page.length
    return [
      `Internal links · ${report.mode === 'url' ? report.targetUrl : report.site} · ${report.dataStatus}`,
      `Links ${options.offset + 1} to ${end} of ${report.items.length}:`,
      table(page, columns, origin, 120),
      end < report.items.length
        ? `Next page: ${options.more('rows', end)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }
  const s = report.summary
  const judge = report.judge
  const shown = rows(report, 0, SUMMARY_ROWS)
  const held = Object.entries(report.heldBack.reasons)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ')
  return [
    `Internal links · ${report.mode === 'url' ? report.targetUrl : report.site} · ${report.dataStatus}`,
    s.verdict,
    `Crawl: ${s.pagesCrawled} pages (limit ${report.crawl.pageLimit}, ${report.crawl.capReached ? 'reached' : 'not reached'}), ${s.existingContextualLinks} contextual links, ${s.orphanPages} orphan pages, ${s.weaklyLinkedPages} pages with fewer than 3 contextual links in.`,
    `Judge: ${judge.note}`,
    report.target
      ? `Target: ${report.target.type ?? 'type unknown'}, ${report.target.intent ?? 'intent unknown'}, ${report.target.inboundLinks} contextual links in.`
      : '',
    s.heldBack ? `Held back by the evidence floors: ${held}.` : '',
    shown.length
      ? `Links (${shown.length} of ${report.items.length}):\n${table(shown, columns, origin, 90)}`
      : 'No links passed the rules.',
    `Limits:\n${report.caveats
      .filter((line) => line !== judge.note)
      .map((line) => `- ${line}`)
      .join('\n')}`,
    `More: ${shown.length < report.items.length ? `${options.more('rows', shown.length)} for more links, or ` : ''}${options.more('full')} for every field.${report.next ? ` Next: ${report.next}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
