export type HumanReportCommand = {
  command: string
  note: string
}

// The report registry is the stable automation contract. These commands are
// the shortest equivalent path for someone working directly in a terminal.
export const humanReportCommands: Partial<Record<string, HumanReportCommand>> =
  {
    'agent-readiness': {
      command: 'seo agent-readiness https://example.com --max-pages 100 --json',
      note: 'Check the public content-site contract with a fresh bounded crawl.',
    },
    'ai-readiness': {
      command: 'seo ai-readiness --project example',
      note: 'Review AI search access and page signals from the latest crawl.',
    },
    'ai-referrals': {
      command: 'seo ai-referrals --project example',
      note: 'Find GA4 sessions referred by known AI products.',
    },
    'audit-page': {
      command: 'seo audit-page --url https://example.com/page',
      note: 'Inspect one live page before changing it.',
    },
    'audit-urls': {
      command:
        'seo crawl --mode list --urls https://example.com/a,https://example.com/b',
      note: 'Audit an explicit URL list without crawling the rest of the site.',
    },
    cannibalisation: {
      command: 'seo cannibal --project example',
      note: 'Review queries associated with more than one URL.',
    },
    'community-intent': {
      command: 'seo community-intent --project example',
      note: 'Find returned queries with review, forum, or comparison wording.',
    },
    'compare-crawls': {
      command: 'seo crawl-reports --compare latest --against previous',
      note: 'Compare two saved crawl snapshots.',
    },
    'content-optimization': {
      command:
        'seo content optimize --url https://example.com/page --project example',
      note: 'Build a brief from one page and its Search Console queries.',
    },
    'crawl-diff': {
      command: 'seo crawl-diff --url https://example.com',
      note: 'Repeat a limited crawl and compare it with the previous run.',
    },
    'crawl-history': {
      command: 'seo crawl-reports --project example',
      note: 'List the local crawl snapshots saved for a project.',
    },
    'crawl-report': {
      command: 'seo crawl-reports --id <report-id> --json',
      note: 'Open one saved crawl snapshot by id.',
    },
    'crawler-rules': {
      command: 'seo rules',
      note: 'Browse the technical checks built into the crawler.',
    },
    'ctr-underperformers': {
      command: 'seo ctr-underperformers --project example',
      note: 'Find high-impression queries with weaker CTR evidence.',
    },
    'decaying-pages': {
      command: 'seo decaying --project example',
      note: 'Compare matched windows for returned click declines.',
    },
    'entity-readiness': {
      command: 'seo entity-readiness --project example',
      note: 'Review naming, authorship, schema, and sameAs evidence.',
    },
    'explain-crawl-issue': {
      command: 'seo explain --rule missing_title',
      note: 'Understand one crawler rule and how to verify the fix.',
    },
    'generate-llms-txt': {
      command: 'seo llms generate --project example',
      note: 'Create an optional llms.txt draft from a saved crawl.',
    },
    'index-coverage': {
      command: 'seo index-coverage --project example',
      note: 'Choose representative pages for URL Inspection from crawl, sitemap, and Search Console evidence.',
    },
    'index-monitor': {
      command:
        'seo index-watch --site sc-domain:example.com --sitemaps https://example.com/sitemap.xml',
      note: 'Collect a limited set of URL Inspection snapshots.',
    },
    'index-coverage-plan': {
      command:
        'seo index-watch --site sc-domain:example.com --sitemaps https://example.com/sitemap.xml --plan',
      note: 'Plan an inspection cycle without spending URL Inspection quota.',
    },
    'index-watch': {
      command:
        'seo index-watch --site sc-domain:example.com --urls https://example.com/page',
      note: 'Check selected URLs against earlier Google index snapshots.',
    },
    'internal-links': {
      command:
        'seo internal-links --project example --url https://example.com/page',
      note: 'Find fetched pages that may deserve a link to the target.',
    },
    'link-recovery': {
      command: 'seo link-recover --project example',
      note: 'Find broken or poorly redirected URLs with returned search value.',
    },
    'llms-txt-audit': {
      command: 'seo llms audit --project example',
      note: 'Check an optional llms.txt file and its linked pages.',
    },
    'measure-change': {
      command: 'seo change-log measure --id <change-id>',
      note: 'Compare matched Search Console windows around a saved change.',
    },
    'monthly-report': {
      command: 'seo monthly-report --project example',
      note: 'Create a report for the latest complete calendar month.',
    },
    'narrative-report': {
      command: 'seo report-narrative --project example',
      note: 'Turn structured evidence into a client-ready narrative.',
    },
    'okf-build': {
      command: 'seo okf export --project example',
      note: 'Build a limited site knowledge pack from a saved crawl.',
    },
    'okf-validate': {
      command: 'seo okf validate ./okf',
      note: 'Check an OKF knowledge pack before an agent uses it.',
    },
    'page-opportunities': {
      command:
        'seo page-opportunities --project example --url https://example.com/page',
      note: 'Review the returned queries associated with one page.',
    },
    'performance-audit': {
      command: 'seo perf audit --url https://example.com/page',
      note: 'Run a local Lighthouse test and add available CrUX evidence.',
    },
    'search-performance-overview': {
      command: 'seo report --project example',
      note: 'Find where search performance changed and what to inspect next.',
    },
    'pseo-audit': {
      command: 'seo pseo audit --project example',
      note: 'Review repeated page templates with crawl and search evidence.',
    },
    'query-clusters': {
      command: 'seo query-cluster --project example',
      note: 'Group returned Search Console queries into repeatable themes.',
    },
    'quick-wins': {
      command: 'seo quick-wins --project example',
      note: 'Find visible queries and pages that deserve a closer CTR review.',
    },
    'redirect-trace': {
      command: 'seo redirect-trace --url https://example.com/old-page',
      note: 'Follow every redirect hop to the final page.',
    },
    'refresh-priorities': {
      command: 'seo refresh-priorities --project example',
      note: 'Build a limited review queue from supported search signals.',
    },
    'second-page': {
      command: 'seo second-page --project example',
      note: 'Find visible pages averaging positions above 10 through 20.',
    },
    'segment-impact': {
      command: 'seo segment-impact --project example',
      note: 'Compare matched periods by page, query, country, or device.',
    },
    'seo-to-ai-query': {
      command: 'seo seo-to-ai-query --project example',
      note: 'Turn returned searches into repeatable AI monitoring prompts.',
    },
    'setup-check': {
      command: 'seo doctor',
      note: 'Check local sign-in, scopes, configuration, and defaults.',
    },
    'site-crawl': {
      command: 'seo crawl https://example.com --save',
      note: 'Create and save a reusable technical SEO baseline.',
    },
    'striking-distance': {
      command: 'seo striking-distance --project example',
      note: 'Find returned query and page combinations near page one.',
    },
    'technical-watch': {
      command: 'seo technical-watch --project example',
      note: 'Run crawl and Google index monitoring together.',
    },
    'top-fixes': {
      command: 'seo crawl-queue https://example.com',
      note: 'Turn a crawl into a short technical implementation queue.',
    },
    'traffic-anomaly': {
      command: 'seo traffic-anomaly --project example',
      note: 'Find unusual recent Search Console movement.',
    },
    'update-correlation': {
      command: 'seo update-correlate --project example',
      note: 'Compare traffic movement with confirmed Google update windows.',
    },
    'update-postmortem': {
      command: 'seo update-postmortem --project example',
      note: 'Review winners and losers around a confirmed Google update.',
    },
  }

export function humanReportCommand(id: string): HumanReportCommand | undefined {
  return humanReportCommands[id]
}
