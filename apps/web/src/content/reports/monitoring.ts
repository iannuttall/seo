import type { ReportEditorial } from './types'

export const monitoringReports = [
  {
    id: 'bing-webmaster-overview',
    name: 'Bing Webmaster overview',
    category: 'monitoring',
    summary:
      'Review recent Bing search and crawl statistics for one verified site with explicit provider coverage and limits.',
    question:
      'What search traffic and crawl activity did Bing report for this verified site?',
    useWhen: [
      'You want Bing search and crawl evidence beside your other site evidence.',
      'You need a small repeatable provider check without crawling the site.',
    ],
    avoidWhen: [
      'You need URL level indexing proof or a complete view across every search engine.',
    ],
    evidence: [
      'Bing Webmaster traffic and crawl statistics returned for the selected verified site.',
    ],
    methodology: [
      'Requests traffic and crawl statistics in parallel, validates provider rows, sorts dates consistently, and keeps each section bounded.',
      'Returns totals and coverage metadata while limiting agent output to the most recent rows.',
    ],
    exampleParams: {
      site: 'https://example.com/',
    },
    interpretation: [
      'Read provider status and coverage before using totals. Compare exact dates when a traffic or crawl value changes.',
    ],
    caveats: [
      'Bing evidence describes Bing only. Its inIndex statistic is not independent URL level proof of indexing.',
      'Partial, capped, invalid, or unavailable evidence cannot support an all clear.',
    ],
    nextSteps: [
      'Check the same date range in Bing Webmaster Tools.',
      'Run a site crawl when current page evidence is needed.',
    ],
    related: ['search-performance-overview', 'site-crawl', 'link-recovery'],
    sources: ['bing-webmaster'],
  },
  {
    id: 'crawl-diff',
    name: 'Crawl diff',
    category: 'monitoring',
    summary:
      'Crawl a limited same-origin set and compare it with the previous run so technical regressions stand out quickly.',
    question:
      'What technical or page evidence changed since the previous comparable crawl?',
    useWhen: [
      'A release, migration, or scheduled technical check needs a fresh comparison.',
      'The start URL and crawl bounds can remain comparable between runs.',
    ],
    avoidWhen: ['A changed crawl scope would dominate the difference.'],
    evidence: [
      'Current fetched crawl evidence and the previous compatible locally saved run.',
    ],
    methodology: [
      'Runs the limited crawl, matches pages and findings consistently, then separates regressions, recoveries, additions, and removals.',
    ],
    exampleParams: {
      startUrl: 'https://example.com/',
      site: 'sc-domain:example.com',
      limit: 250,
      refresh: true,
    },
    interpretation: [
      'Check fetch and scope changes before issue deltas. A missing finding is only a recovery when the page remained testable.',
    ],
    caveats: [
      'Crawl limits, robots changes, timeouts, and client rendering can create apparent changes unrelated to a deployment.',
    ],
    nextSteps: [
      'Audit representative regressions.',
      'Use affected URLs for repeated rule changes.',
    ],
    related: ['compare-crawls', 'audit-page', 'affected-urls'],
    sources: ['robots', 'javascript'],
  },
  {
    id: 'index-coverage',
    name: 'Index coverage signals',
    category: 'monitoring',
    summary:
      'Find crawlable pages missing from the Search Console results returned for the period, then choose representative URLs to inspect.',
    question:
      'Which pages deserve URL Inspection because crawl, sitemap, and Search Console evidence do not line up?',
    useWhen: [
      'You need an evidence-based sample for an index coverage investigation.',
      'A current saved crawl and Search Console page data are available for the same site.',
    ],
    avoidWhen: [
      'You need a definitive current index verdict for one URL. Use URL Inspection instead.',
      'The saved crawl covers the wrong section or is too old for the question.',
    ],
    evidence: [
      'A saved local crawl, an optional sitemap inventory, and finalized Search Console page rows for an explicit date range and row limit.',
    ],
    methodology: [
      'Normalizes URLs across the available sources, keeps crawl controls separate, and groups crawlable pages missing from the returned Search Console data for review.',
      'Groups repeated URL templates to help choose representative checks without diagnosing the template or its index state.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      crawlReportId: 'crawl_saved',
      sitemaps: ['https://example.com/sitemap.xml'],
      days: 90,
      rowLimit: 100000,
    },
    interpretation: [
      'Start with source completeness. A crawlable page missing from returned Search Console rows is a review candidate, not proof that the page is unindexed.',
    ],
    caveats: [
      'Search Analytics is not an index inventory. Missing rows can mean no impressions in the returned data, a row cap, privacy filtering, or a URL that needs direct inspection.',
      'Saved crawl reports do not retain a full sitemap inventory. The report can fetch sitemap documents declared in captured robots.txt evidence, or use sitemap URLs supplied explicitly.',
    ],
    nextSteps: [
      'Choose representative URLs from important page types and template groups.',
      'Run URL Inspection for that limited sample and keep provider failures separate from page findings.',
    ],
    related: ['index-watch', 'index-monitor', 'index-coverage-plan'],
    sources: ['search-analytics', 'sitemaps', 'url-inspection'],
  },
  {
    id: 'index-coverage-plan',
    name: 'Index monitoring plan',
    category: 'monitoring',
    summary:
      'Turn sitemap inventories, Search Console properties, and inspection quotas into a realistic monitoring cycle.',
    question:
      'How should these URLs be allocated across properties and daily URL Inspection capacity?',
    useWhen: [
      'A large site needs limited, repeatable index monitoring.',
      'You need to see whether extra URL-prefix properties would improve ownership coverage.',
    ],
    avoidWhen: [
      'You expect one plan run to inspect URLs or prove index coverage.',
    ],
    evidence: [
      'Sitemap URLs, selected Search Console properties, property ownership boundaries, and explicit daily limits.',
    ],
    methodology: [
      'Deduplicates discovered URLs, assigns eligible properties, estimates a monitoring cycle, and keeps unassigned URLs visible.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      sitemaps: ['https://example.com/sitemap.xml'],
      dailyLimit: 200,
      targetCycleDays: 7,
      maxUrls: 50000,
    },
    interpretation: [
      'Use the cycle estimate to choose a representative inventory and sustainable quota. Unassigned URLs need property-access review.',
    ],
    caveats: [
      'A sitemap is a discovery hint, not proof that every listed URL is indexed or should be indexed.',
    ],
    nextSteps: [
      'Run index monitor with a limited daily sample.',
      'Add appropriate URL-prefix property access if important URLs cannot be inspected.',
    ],
    related: ['index-monitor', 'index-watch'],
    sources: ['sitemaps', 'url-inspection'],
  },
  {
    id: 'index-monitor',
    name: 'Index monitor',
    category: 'monitoring',
    summary:
      'Inspect a quota-limited sitemap sample and store Google’s indexed snapshots for later comparison.',
    question:
      'What indexed-state evidence did Google return for today’s monitored URL sample?',
    useWhen: [
      'A repeatable sitemap-based monitoring process is already planned.',
      'Local quota limits and property access are configured.',
    ],
    avoidWhen: [
      'You need live-page testing or complete inspection of a large sitemap in one run.',
    ],
    evidence: [
      'Sitemap discovery, local quota state, and URL Inspection indexed snapshots returned by Google.',
    ],
    methodology: [
      'Selects a limited repeatable sample, enforces local daily capacity, stores individual results, and records operational failures separately.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      sitemaps: ['https://example.com/sitemap.xml'],
      dailyLimit: 200,
      inspectLimit: 25,
      maxUrls: 50000,
      languageCode: 'en-GB',
    },
    interpretation: [
      'Read exact verdict fields and inspection time. Unknown, excluded, invalid, failed, and uninspected URLs are different states.',
    ],
    caveats: [
      'URL Inspection reports Google’s indexed version, not a live fetch, and provider quota limits coverage.',
    ],
    nextSteps: [
      'Run index watch against stored snapshots.',
      'Inspect live technical evidence for URLs with supported problems.',
    ],
    related: ['index-watch', 'audit-page', 'index-coverage-plan'],
    sources: ['url-inspection', 'sitemaps'],
  },
  {
    id: 'index-watch',
    name: 'Index watch',
    category: 'monitoring',
    summary:
      'Separate current indexed-state issues, regressions, recoveries, and provider failures for a limited URL set.',
    question:
      'Which monitored URLs changed indexed state or need verification?',
    useWhen: [
      'You have important URLs or stored inspection history to compare.',
      'You need operational failures separated from SEO findings.',
    ],
    avoidWhen: [
      'You need a full-site index count or proof that a URL currently appears for a query.',
    ],
    evidence: [
      'Current URL Inspection snapshots, prior local snapshots, exact verdicts, and failure metadata.',
    ],
    methodology: [
      'Compares exact supported state fields per URL and classifies current issues, regressions, recoveries, unchanged results, and failures.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/a', 'https://example.com/b'],
      dailyLimit: 25,
    },
    interpretation: [
      'Verify regressions against page intent and live technical controls. A recovery describes the inspected snapshot, not guaranteed search visibility.',
    ],
    caveats: [
      'Uninspected and failed URLs remain unknown. The indexed snapshot can lag a live deployment.',
    ],
    nextSteps: [
      'Audit a regressed URL directly.',
      'Run redirect trace when the inspected canonical or destination is unexpected.',
    ],
    related: ['index-monitor', 'audit-page', 'redirect-trace'],
    sources: ['url-inspection'],
  },
  {
    id: 'link-recovery',
    name: 'Recover search-value URLs',
    category: 'monitoring',
    summary:
      'Find URLs with returned search value that now fail, block access, or redirect poorly.',
    question:
      'Which search-visible URLs now lead users and crawlers to a broken or unsuitable destination?',
    useWhen: [
      'A migration, deletion, or release may have stranded valuable URLs.',
      'Search Console evidence should determine which URLs get checked first.',
    ],
    avoidWhen: [
      'You want to redirect every historical URL without checking relevance and user value.',
    ],
    evidence: [
      'Returned Search Console page metrics plus fresh response, redirect, robots, indexability, and canonical evidence.',
    ],
    methodology: [
      'Ranks eligible search-value URLs, fetches a limited set, traces outcomes, and keeps failed verification separate.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      limit: 25,
      minClicks: 1,
      minImpressions: 100,
      refresh: true,
    },
    interpretation: [
      'Restore a useful page or redirect to the closest genuinely equivalent destination. A 200 response alone does not make the destination appropriate.',
    ],
    caveats: [
      'Returned Search Console rows are not a complete historical URL inventory, and fetched behavior can differ by user agent.',
    ],
    nextSteps: [
      'Trace the specific redirect chain.',
      'Recrawl and monitor the repaired URL.',
    ],
    related: ['redirect-trace', 'crawl-diff', 'index-watch'],
    sources: ['search-analytics', 'redirects', 'canonical'],
  },
  {
    id: 'redirect-trace',
    name: 'Redirect trace',
    category: 'monitoring',
    summary:
      'Follow one redirect chain and check whether its final page is usable, indexable, and canonical as intended.',
    question:
      'Where does this URL end, how does it get there, and is the final destination technically coherent?',
    useWhen: [
      'A migrated, shortened, or legacy URL behaves unexpectedly.',
      'You need each hop rather than the final status alone.',
    ],
    avoidWhen: [
      'You need a bulk redirect inventory. Use a crawl or affected URL report instead.',
    ],
    evidence: [
      'Every HTTP redirect hop, status, location, final response, robots directives, and canonical observation.',
    ],
    methodology: [
      'Follows redirects up to an explicit hop limit, detects loops and invalid locations, then audits the final response.',
    ],
    exampleParams: {
      url: 'https://example.com/old-page',
      maxHops: 8,
      refresh: true,
    },
    interpretation: [
      'Prefer a short chain to the closest equivalent final page. Check that the final canonical and indexability match the intended move.',
    ],
    caveats: [
      'The trace describes this request from this environment. Geolocation, cookies, user agent, and JavaScript can produce other paths.',
    ],
    nextSteps: [
      'Update internal links to the final destination.',
      'Use link recovery to find other search-visible broken URLs.',
    ],
    related: ['link-recovery', 'audit-page', 'site-crawl'],
    sources: ['redirects', 'canonical'],
  },
] as const satisfies readonly ReportEditorial[]
