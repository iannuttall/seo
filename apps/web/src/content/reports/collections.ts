export type ReportCollection = {
  title: string
  introduction: string
  reports: readonly (readonly [id: string, label: string])[]
}

export const reportCollections = [
  {
    title: 'Crawl & page checks',
    introduction:
      'Crawl a whole site or inspect selected pages for technical problems your agent can fix.',
    reports: [
      ['site-crawl', 'Site crawl'],
      ['audit-page', 'Audit page'],
      ['audit-urls', 'Audit selected URLs'],
      ['redirect-trace', 'Redirect trace'],
      ['performance-audit', 'Performance audit'],
    ],
  },
  {
    title: 'Crawl findings',
    introduction:
      'Turn a crawl finding into affected URLs, understand the rule, and inspect saved evidence.',
    reports: [
      ['top-fixes', 'Top fixes'],
      ['affected-urls', 'Affected URLs'],
      ['explain-crawl-issue', 'Explain a crawl issue'],
      ['crawler-rules', 'Crawler rules'],
      ['crawl-history', 'Crawl history'],
      ['crawl-report', 'Saved crawl report'],
    ],
  },
  {
    title: 'Indexing & monitoring',
    introduction:
      'Find indexing candidates, compare crawls, and catch technical changes after a release.',
    reports: [
      ['crawl-diff', 'Crawl diff'],
      ['compare-crawls', 'Compare crawls'],
      ['index-coverage', 'Index coverage'],
      ['index-coverage-plan', 'Index plan'],
      ['index-monitor', 'Index monitor'],
      ['index-watch', 'Index watch'],
      ['bing-webmaster-overview', 'Bing Webmaster overview'],
      ['link-evidence', 'Referring link evidence'],
      ['server-log-analysis', 'Server log crawler analysis'],
      ['technical-watch', 'Technical watch'],
    ],
  },
  {
    title: 'Search opportunities',
    introduction:
      'Combine searches already associated with the site and independent keyword estimates to choose what deserves a closer look.',
    reports: [
      ['keyword-research', 'Keyword research'],
      ['keyword-metrics', 'Keyword metrics'],
      ['serp-results', 'Live search results'],
      ['keyword-opportunities', 'Keyword opportunities'],
      ['pseo-opportunities', 'Programmatic SEO opportunities'],
      ['quick-wins', 'Quick wins'],
      ['striking-distance', 'Striking distance'],
      ['second-page', 'Second page'],
      ['decaying-pages', 'Decaying pages'],
      ['ctr-underperformers', 'CTR underperformers'],
      ['page-opportunities', 'Page opportunities'],
    ],
  },
  {
    title: 'Content & internal links',
    introduction:
      'Find competing pages, weak internal links, and query groups that deserve clearer content.',
    reports: [
      ['cannibalisation', 'Cannibalisation'],
      ['internal-links', 'Internal links'],
      ['content-optimization', 'Content optimization'],
      ['query-clusters', 'Query clusters'],
      ['link-recovery', 'Link recovery'],
      ['community-intent', 'Community intent'],
    ],
  },
  {
    title: 'AI search visibility',
    introduction:
      'Find technical restrictions, improve machine-readable context, and measure AI referral traffic.',
    reports: [
      ['agent-readiness', 'AI agent readiness'],
      ['ai-search-scorecard', 'AI search scorecard'],
      ['ai-readiness', 'AI readiness'],
      ['entity-readiness', 'Entity readiness'],
      ['geo-gaps', 'Google AI search controls'],
      ['llms-txt-audit', 'llms.txt audit'],
      ['generate-llms-txt', 'Generate llms.txt'],
      ['seo-to-ai-query', 'SEO to AI query'],
      ['ai-referrals', 'AI referrals'],
    ],
  },
  {
    title: 'Understand performance',
    introduction:
      'Work out where search performance moved, which part of the site explains it, and whether the change is unusual.',
    reports: [
      ['search-performance-overview', 'Search performance overview'],
      ['segment-impact', 'Segment impact'],
      ['traffic-anomaly', 'Traffic anomaly'],
      ['update-correlation', 'Google update correlation'],
    ],
  },
  {
    title: 'Reports & priorities',
    introduction:
      'Turn the evidence into a short work queue or a clear update for clients and teams.',
    reports: [
      ['refresh-priorities', 'Refresh priorities'],
      ['monthly-report', 'Monthly report'],
      ['monthly-action-plan', 'Monthly action plan'],
      ['narrative-report', 'Narrative report'],
      ['update-postmortem', 'Update postmortem'],
    ],
  },
  {
    title: 'Testing, setup & exports',
    introduction:
      'Check local setup, measure known changes, review templates, and package site knowledge for agents.',
    reports: [
      ['setup-check', 'Setup check'],
      ['measure-change', 'Measure a change'],
      ['pseo-audit', 'pSEO audit'],
      ['okf-build', 'OKF export'],
      ['okf-validate', 'OKF validation'],
    ],
  },
] as const satisfies readonly ReportCollection[]

export const reportCollectionIds = reportCollections.flatMap((collection) =>
  collection.reports.map(([id]) => id),
)
