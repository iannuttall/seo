export type ReportCollection = {
  title: string
  introduction: string
  reports: readonly (readonly [id: string, label: string])[]
}

export const reportCollections = [
  {
    title: 'Crawl & technical',
    introduction:
      'Find technical problems, open the affected URLs, and verify what changed after a fix or release.',
    reports: [
      ['site-crawl', 'Site crawl'],
      ['crawl-diff', 'Crawl diff'],
      ['audit-page', 'Audit page'],
      ['audit-urls', 'Audit selected URLs'],
      ['compare-crawls', 'Compare crawls'],
      ['redirect-trace', 'Redirect trace'],
      ['index-coverage', 'Index coverage'],
      ['index-coverage-plan', 'Index plan'],
      ['index-monitor', 'Index monitor'],
      ['index-watch', 'Index watch'],
      ['link-recovery', 'Link recovery'],
      ['technical-watch', 'Technical watch'],
      ['top-fixes', 'Top fixes'],
      ['affected-urls', 'Affected URLs'],
      ['explain-crawl-issue', 'Explain a crawl issue'],
      ['crawl-history', 'Crawl history'],
      ['crawl-report', 'Saved crawl report'],
      ['crawler-rules', 'Crawler rules'],
    ],
  },
  {
    title: 'Search opportunities',
    introduction:
      'Use the searches already bringing people to your site to choose pages, snippets, and links worth improving.',
    reports: [
      ['quick-wins', 'Quick wins'],
      ['striking-distance', 'Striking distance'],
      ['second-page', 'Second page'],
      ['decaying-pages', 'Decaying pages'],
      ['cannibalisation', 'Cannibalisation'],
      ['ctr-underperformers', 'CTR underperformers'],
      ['internal-links', 'Internal links'],
      ['page-opportunities', 'Page opportunities'],
      ['content-optimization', 'Content optimization'],
      ['query-clusters', 'Query clusters'],
    ],
  },
  {
    title: 'AI search readiness',
    introduction:
      'Find technical restrictions, weak entity signals, and measurable AI referrals without inventing a visibility score.',
    reports: [
      ['ai-readiness', 'AI readiness'],
      ['entity-readiness', 'Entity readiness'],
      ['geo-gaps', 'Google AI search controls'],
      ['llms-txt-audit', 'llms.txt audit'],
      ['generate-llms-txt', 'Generate llms.txt'],
      ['seo-to-ai-query', 'SEO to AI query'],
      ['ai-referrals', 'AI referrals'],
      ['community-intent', 'Community intent'],
    ],
  },
  {
    title: 'Search Console & GA4',
    introduction:
      'Work out where search performance moved, which part of the site explains it, and whether the change is unusual.',
    reports: [
      ['search-performance-overview', 'Search performance overview'],
      ['segment-impact', 'Segment impact'],
      ['traffic-anomaly', 'Traffic anomaly'],
      ['update-correlation', 'Google update correlation'],
      ['setup-check', 'Setup check'],
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
    title: 'Testing & exports',
    introduction:
      'Measure known changes, review repeated page templates, and package site knowledge for agents.',
    reports: [
      ['measure-change', 'Measure a change'],
      ['performance-audit', 'Performance audit'],
      ['pseo-audit', 'pSEO audit'],
      ['okf-build', 'OKF export'],
      ['okf-validate', 'OKF validation'],
    ],
  },
] as const satisfies readonly ReportCollection[]

export const reportCollectionIds = reportCollections.flatMap((collection) =>
  collection.reports.map(([id]) => id),
)
