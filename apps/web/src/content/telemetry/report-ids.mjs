// Every report id an `seo` client can send in an anonymous usage event.
//
// Older CLI versions and the hosted MCP still send these ids, so the
// telemetry accept-list keeps all of them even though the site no longer has
// a page per report. Never remove an id here: a removed id makes the Worker
// reject events from clients that are still installed.
//
// Each id also names the docs page it now lives on. The redirect builder
// sends the old /docs/reports/<id> URL there with a 301.

/** @typedef {'report' | 'page' | 'compare' | 'index' | 'research' | 'crawl' | 'internal-links' | 'setup' | 'removed'} ReportCommand */

/** @type {Record<string, ReportCommand>} */
export const reportCommands = {
  'affected-urls': 'removed',
  'agent-readiness': 'removed',
  'ai-readiness': 'removed',
  'ai-referrals': 'report',
  'ai-mention-research': 'removed',
  'ai-prompt-observations': 'removed',
  'ai-search-scorecard': 'removed',
  'audit-page': 'page',
  'audit-urls': 'page',
  'bing-webmaster-overview': 'removed',
  cannibalisation: 'report',
  'community-intent': 'report',
  'compare-crawls': 'removed',
  'competitive-opportunities': 'research',
  'competitor-keyword-gap': 'research',
  'content-optimization': 'page',
  'crawl-diff': 'removed',
  'site-crawl': 'crawl',
  'ctr-underperformers': 'report',
  'decaying-pages': 'report',
  'domain-rating': 'research',
  'domain-overview': 'research',
  'setup-check': 'setup',
  'entity-readiness': 'removed',
  'explain-crawl-issue': 'crawl',
  'geo-gaps': 'removed',
  'crawl-report': 'removed',
  'index-coverage': 'index',
  'index-coverage-plan': 'removed',
  'index-monitor': 'removed',
  'index-watch': 'removed',
  'internal-links': 'internal-links',
  'keyword-metrics': 'research',
  'keyword-opportunities': 'report',
  'keyword-research': 'research',
  'saved-keywords': 'research',
  'link-evidence': 'research',
  'server-log-analysis': 'removed',
  'link-recovery': 'index',
  'local-search-demand': 'removed',
  'crawl-history': 'removed',
  'crawler-rules': 'crawl',
  'llms-txt-audit': 'removed',
  'generate-llms-txt': 'removed',
  'measure-change': 'removed',
  'monthly-report': 'report',
  'okf-build': 'removed',
  'okf-validate': 'removed',
  'page-opportunities': 'page',
  'performance-audit': 'page',
  'pseo-audit': 'removed',
  'pseo-opportunities': 'removed',
  'pseo-patterns': 'removed',
  'query-clusters': 'report',
  'quick-wins': 'report',
  'rank-tracking': 'research',
  'ranked-keywords': 'research',
  'ranking-pages': 'research',
  'redirect-trace': 'page',
  'narrative-report': 'report',
  'second-page': 'report',
  'segment-impact': 'compare',
  'serp-results': 'research',
  'serp-competitors': 'research',
  'striking-distance': 'report',
  'seo-to-ai-query': 'removed',
  'top-fixes': 'crawl',
  'traffic-anomaly': 'report',
  'update-correlation': 'compare',
  'search-performance-overview': 'report',
  'monthly-action-plan': 'report',
  'refresh-priorities': 'report',
  'technical-watch': 'removed',
  'update-postmortem': 'compare',
}

export const reportIds = Object.keys(reportCommands)

/** The docs page that now covers each command group. */
export const commandPaths = {
  report: '/docs/report',
  page: '/docs/page',
  compare: '/docs/compare',
  index: '/docs/indexing',
  research: '/docs/research',
  crawl: '/docs/crawl',
  'internal-links': '/docs/internal-links',
  setup: '/docs/getting-started',
  removed: '/docs',
}

/** The page an old report id now redirects to. */
export function reportDestination(id) {
  const command = reportCommands[id]
  return command ? commandPaths[command] : '/docs'
}

// Old report URLs that used a different slug from the report id.
export const reportSlugs = {
  'index-coverage-plan': 'index-plan',
}

// Report URLs from earlier releases that already pointed at another page.
export const legacyReportAliases = {
  'broad-seo-report': 'search-performance-overview',
  'change-log': 'measure-change',
  'content-groups': '/docs/cli',
  'knowledge-export': 'okf-build',
  'okf-export': 'okf-build',
  'search-console-actions': 'refresh-priorities',
  'search-console-query': '/docs/data',
  'search-status-updates': '/docs/compare',
  'seo-tests': 'measure-change',
  'url-inspection': '/docs/page',
}
