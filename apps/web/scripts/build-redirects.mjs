// Writes public/_redirects, the permanent redirects Cloudflare serves from
// the static assets. Old report pages point at the command page that covers
// them now, so links and search results keep working.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  legacyReportAliases,
  reportDestination,
  reportIds,
  reportSlugs,
} from '../src/content/telemetry/report-ids.mjs'

const publicDirectory = resolve(import.meta.dirname, '..', 'public')

/** Pages from the earlier site that now live elsewhere. */
export const pageRedirects = {
  '/blog/seo-agent': '/docs/getting-started',
  '/blog/seo-mcp-servers': '/docs/mcp',
  '/docs/start': '/docs/getting-started',
  '/docs/reports': '/docs',
  '/docs/google': '/docs/getting-started',
  '/docs/agents': '/docs/mcp',
  '/docs/skill': '/docs/cli',
  '/docs/typescript': '/docs/cli',
  '/docs/crawler': '/docs/crawl',
  // The CLI crawler's user agent links here with a trailing slash.
  '/docs/crawler/': '/docs/crawl',
  '/docs/research-providers': '/docs/keys',
  '/docs/dataforseo': '/docs/keys',
  '/docs/semrush': '/docs/keys',
  '/docs/ahrefs': '/docs/keys',
  '/docs/clicky': '/docs/analytics',
  '/trademarks': '/',
  '/security': 'https://github.com/iannuttall/seo/security/policy',
  '/docs/indexnow': '/docs',
  '/docs/html-reports': '/docs',
  '/docs/ai-search': '/features/ai-search',
  '/docs/ai-visibility': '/features/ai-search',
  // Merged into the tools that now cover the same searches.
  '/features/google-updates': '/tools/google-algorithm-update-checker',
  '/tools/seo-report-template': '/tools/monthly-seo-report',
  // The command pages moved up a level after the redesign preview.
  '/docs/commands': '/docs',
  ...Object.fromEntries(
    [
      'report',
      'page',
      'compare',
      'indexing',
      'research',
      'data',
      'crawl',
      'internal-links',
    ].map((command) => [`/docs/commands/${command}`, `/docs/${command}`]),
  ),
}

/**
 * Old report pages whose searches a focused feature or free tool page now
 * answers. The rest go to the command page that covers them. Telemetry
 * keeps the command pages.
 */
export const reportToolPages = {
  'keyword-research': '/features/keyword-research',
  'keyword-metrics': '/features/keyword-report',
  'saved-keywords': '/features/keyword-research',
  'link-evidence': '/tools/backlink-checker',
  'domain-overview': '/features/domain-overview',
  cannibalisation: '/tools/keyword-cannibalization-checker',
  'internal-links': '/tools/internal-linking-tool',
  'server-log-analysis': '/tools/server-log-analyzer',
  'llms-txt-audit': '/tools/llms-txt-validator',
  'generate-llms-txt': '/tools/llms-txt-generator',
  'pseo-audit': '/features/programmatic-seo',
  'pseo-opportunities': '/features/programmatic-seo',
  'pseo-patterns': '/features/programmatic-seo',
  'agent-readiness': '/features/ai-search',
  'ai-readiness': '/features/ai-search',
  'ai-mention-research': '/features/ai-search',
  'ai-prompt-observations': '/features/ai-visibility-checker',
  'ai-search-scorecard': '/features/ai-search',
  'entity-readiness': '/features/ai-search',
  'geo-gaps': '/features/ai-search',
  'seo-to-ai-query': '/features/ai-search',
  'index-coverage': '/features/google-index-checker',
  'index-monitor': '/features/seo-monitoring',
  'index-watch': '/features/seo-monitoring',
  'technical-watch': '/features/seo-monitoring',
  'site-crawl': '/features/seo-crawler',
  'crawl-report': '/features/seo-crawler',
  'crawl-diff': '/features/seo-crawler',
  'compare-crawls': '/features/seo-crawler',
  'crawl-history': '/features/seo-crawler',
  'bing-webmaster-overview': '/docs/bing',
  'measure-change': '/docs/compare',
  'update-correlation': '/tools/google-algorithm-update-checker',
  'search-status-updates': '/tools/google-algorithm-update-checker',
  'competitor-keyword-gap': '/tools/competitor-keyword-research',
  'ranked-keywords': '/tools/competitor-keyword-research',
  'serp-competitors': '/features/seo-competitor-analysis',
  'serp-results': '/tools/serp-checker',
  'rank-tracking': '/tools/serp-checker',
  'monthly-report': '/tools/monthly-seo-report',
  'monthly-action-plan': '/tools/monthly-seo-report',
  'domain-rating': '/tools/domain-rating-checker',
  'redirect-trace': '/tools/redirect-checker',
  'keyword-opportunities': '/features/keyword-opportunities',
  'competitive-opportunities': '/features/keyword-opportunities',
  'quick-wins': '/features/striking-distance-keywords',
  'striking-distance': '/features/striking-distance-keywords',
  'ctr-underperformers': '/features/striking-distance-keywords',
  'decaying-pages': '/features/striking-distance-keywords',
  'ai-referrals': '/features/google-analytics',
}

/** Every old report URL and where it goes now. */
export function reportRedirects() {
  /** @type {Array<[string, string]>} */
  const rules = []
  const destination = (id) => reportToolPages[id] ?? reportDestination(id)
  for (const id of reportIds) {
    rules.push([`/docs/reports/${reportSlugs[id] ?? id}`, destination(id)])
    if (reportSlugs[id]) rules.push([`/docs/reports/${id}`, destination(id)])
  }
  for (const [alias, target] of Object.entries(legacyReportAliases)) {
    const to = reportToolPages[alias] ?? target
    rules.push([
      `/docs/reports/${alias}`,
      to.startsWith('/') ? to : destination(to),
    ])
  }
  return rules
}

export function redirectRules() {
  const rules = [...Object.entries(pageRedirects), ...reportRedirects()]
  const lines = []
  for (const [from, to] of rules) {
    lines.push(`${from} ${to} 301`)
    if (from.endsWith('/')) continue
    // The Markdown twin of each old page goes to the new page's twin, or to
    // the same place when the new home is on another site.
    const twin = to.startsWith('https://')
      ? to
      : `${to === '/' ? '/index' : to}.md`
    lines.push(`${from}.md ${twin} 301`)
  }
  // Anything else under the old report and feature paths.
  lines.push('/docs/reports/* /docs 301')
  lines.push('/docs/commands/* /docs 301')
  return lines
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lines = redirectRules()
  writeFileSync(
    resolve(publicDirectory, '_redirects'),
    `# Generated by scripts/build-redirects.mjs. Do not edit.\n${lines.join('\n')}\n`,
    'utf8',
  )
  console.log(`Wrote ${lines.length} redirects to public/_redirects`)
}
