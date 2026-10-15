import type { CommandId } from './types.js'

// The report id a command run counts as in the anonymous usage stats. These
// are the ids the stats server already accepts, so counts stay comparable
// across versions. Listing, raw-row, crawl and setup runs return null here;
// their surfaces count them their own way.

const SECTION_REPORTS: Record<string, string> = {
  overview: 'search-performance-overview',
  'quick-wins': 'quick-wins',
  'low-ctr': 'ctr-underperformers',
  'striking-distance': 'striking-distance',
  'second-page': 'second-page',
  'content-decay': 'decaying-pages',
  cannibalization: 'cannibalisation',
  'traffic-drop': 'traffic-anomaly',
}

const RESEARCH_REPORTS: Record<string, string> = {
  keyword_metrics: 'keyword-metrics',
  ranked_keywords: 'ranked-keywords',
  serp: 'serp-results',
  competitors: 'serp-competitors',
  backlinks: 'link-evidence',
}

export function telemetryReportFor(
  command: CommandId,
  args: { section?: string; action?: string } = {},
): string | null {
  if (command === 'report') {
    return SECTION_REPORTS[args.section || 'overview'] ?? null
  }
  if (command === 'research') return RESEARCH_REPORTS[args.action ?? ''] ?? null
  return (
    (
      {
        page: 'page-opportunities',
        compare: 'measure-change',
        index: 'link-recovery',
        crawl: 'site-crawl',
        'internal-links': 'internal-links',
      } as Partial<Record<CommandId, string>>
    )[command] ?? null
  )
}
