import { REPORT_DEPTH, type ReportDepth } from './report-depth.js'

export type { RelatedReport, ReportDepth } from './report-depth.js'

export type ReportGuidance = {
  name: string
  description: string
  useWhen:
    | readonly [string]
    | readonly [string, string]
    | readonly [string, string, string]
  avoidWhen: readonly [string] | readonly [string, string]
  outcome: string
}

export type FullReportGuidance = ReportGuidance & ReportDepth

export const REPORT_GUIDANCE = {
  'affected-urls': {
    name: 'URLs affected by a crawl issue',
    description:
      'Open the exact pages behind a crawl finding so you can review or fix the right URLs.',
    useWhen: [
      'A crawl summary shows an issue that needs a closer look.',
      'You need the affected URLs for one rule, category, or severity.',
    ],
    avoidWhen: [
      'You have not run or selected a crawl yet.',
      'You need an overview of the most important crawl findings first.',
    ],
    outcome:
      'A focused list of affected URLs with the evidence for each match.',
  },
  'ai-referrals': {
    name: 'AI referral traffic',
    description:
      'Find visits from known AI products in Google Analytics and see a ranked, bounded set of landing pages that received them.',
    useWhen: [
      'You want measured AI referral traffic from Google Analytics.',
      'You need the landing pages and sources behind those visits.',
    ],
    avoidWhen: [
      'Google Analytics is not connected or does not track the site.',
      'You want to measure citations or unclicked mentions inside AI answers.',
    ],
    outcome:
      'A source and landing-page breakdown of identifiable AI referrals.',
  },
  'audit-page': {
    name: 'Single-page SEO audit',
    description:
      'Check one URL for response, indexability, metadata, headings, links, and page content evidence.',
    useWhen: [
      'One page needs a technical review before you change it.',
      'A broader report points to a specific URL.',
    ],
    avoidWhen: [
      'You need to discover issues across a whole site.',
      'The page requires a logged-in browser session.',
    ],
    outcome:
      'A page-level audit that separates observed evidence from review advice.',
  },
  'audit-urls': {
    name: 'Selected URL audit',
    description:
      'Audit a specific list of pages without crawling the rest of the site.',
    useWhen: [
      'You already know which URLs need checking.',
      'You want a repeatable pre-release or post-release check for key pages.',
    ],
    avoidWhen: [
      'You need the crawler to discover pages for you.',
      'You only need a deep review of one page.',
    ],
    outcome: 'Consistent technical checks for each supplied URL.',
  },
  cannibalisation: {
    name: 'Query and URL overlap',
    description:
      'Find search queries that appear across several URLs and decide whether the overlap needs attention.',
    useWhen: [
      'Several pages may be competing for the same search intent.',
      'You want query-level evidence before merging or redirecting pages.',
    ],
    avoidWhen: [
      'You plan to treat every multi-URL query as a problem.',
      'The site has too little Search Console data for meaningful overlap.',
    ],
    outcome:
      'A ranked review list of queries, URLs, and their share of search exposure.',
  },
  'compare-crawls': {
    name: 'Compare saved crawls',
    description:
      'Compare two saved crawl snapshots to see which pages and technical findings changed.',
    useWhen: [
      'You want to check what changed after a release or migration.',
      'You need evidence that a technical fix appeared in a later crawl.',
    ],
    avoidWhen: [
      'The two crawls used materially different scope or settings.',
      'You have only one saved crawl.',
    ],
    outcome:
      'A before-and-after view of added, removed, fixed, and new findings.',
  },
  'content-optimization': {
    name: 'Search-led content brief',
    description:
      'Turn a page and its Search Console queries into a practical brief for improving relevance and coverage.',
    useWhen: [
      'An existing page has search demand but needs a clearer improvement plan.',
      'You want first-party query evidence beside the current page content.',
    ],
    avoidWhen: [
      'The URL has no useful Search Console history.',
      'You want generated copy or a traffic forecast.',
    ],
    outcome:
      'A page brief with query evidence, content checks, and specific review points.',
  },
  'crawl-diff': {
    name: 'Monitor crawl changes',
    description:
      'Crawl a site and compare it with the previous matching run to catch technical changes.',
    useWhen: [
      'You want a repeatable technical check after deployments.',
      'You need newly introduced or resolved crawl findings.',
    ],
    avoidWhen: [
      'There is no comparable earlier crawl.',
      'You need to compare two specific saved crawl IDs.',
    ],
    outcome:
      'A fresh crawl plus a clear list of technical changes since the previous run.',
  },
  'crawl-history': {
    name: 'Saved crawl history',
    description:
      'List local crawl snapshots so you can choose the right report by site and date.',
    useWhen: [
      'You need to find a crawl ID for review or comparison.',
      'You want to confirm which crawl snapshots exist locally.',
    ],
    avoidWhen: [
      'You need the findings inside a crawl rather than its saved metadata.',
    ],
    outcome:
      'A compact list of saved crawls with IDs, sites, dates, and scope.',
  },
  'crawl-report': {
    name: 'Open a saved crawl',
    description:
      'Load a saved crawl by ID, or open the latest local crawl for a site.',
    useWhen: [
      'You already know which saved crawl you want to inspect.',
      'Another report asks for crawl evidence by report ID.',
    ],
    avoidWhen: [
      'You need to create a new crawl.',
      'You only need a filtered list for one issue.',
    ],
    outcome: 'The selected crawl summary with optional page and issue detail.',
  },
  'crawler-rules': {
    name: 'Crawler rule catalog',
    description:
      'Find the available technical check IDs and the evidence each crawler rule looks for.',
    useWhen: [
      'You need a valid rule ID for another crawl report.',
      'You want to see which technical checks are available by category.',
    ],
    avoidWhen: ['You need affected pages or live crawl results.'],
    outcome: 'A searchable catalog of crawler rules, severity, and guidance.',
  },
  'ctr-underperformers': {
    name: 'CTR underperformers',
    description:
      'Find high-impression queries whose click-through rate trails comparable queries at similar positions.',
    useWhen: [
      'You want title or snippet review candidates backed by Search Console data.',
      'You need to compare CTR fairly across similar average positions.',
    ],
    avoidWhen: [
      'You want a promised click uplift.',
      'The comparison groups have too little data.',
    ],
    outcome:
      'A ranked list of query and page pairs with CTR comparison evidence.',
  },
  'decaying-pages': {
    name: 'Pages losing search clicks',
    description:
      'Find pages and queries with meaningful click declines across comparable Search Console periods.',
    useWhen: [
      'You want to investigate a sustained organic search decline.',
      'You need the pages and queries behind lost clicks.',
    ],
    avoidWhen: [
      'The newer period is incomplete or not comparable.',
      'You want to assume every decline is caused by old content.',
    ],
    outcome:
      'A ranked investigation list with before-and-after search evidence.',
  },
  'explain-crawl-issue': {
    name: 'Explain a crawl issue',
    description:
      'Explain what one crawler rule means, why it may matter, and how to verify a fix.',
    useWhen: [
      'A crawl returned a rule ID you do not recognize.',
      'You need implementation and verification guidance before creating work.',
    ],
    avoidWhen: [
      'You need the URLs affected by the rule.',
      'You have not selected a valid crawler rule ID.',
    ],
    outcome:
      'A plain-English rule explanation with fix and verification steps.',
  },
  'index-coverage-plan': {
    name: 'URL Inspection coverage plan',
    description:
      'Choose which sitemap URLs and Search Console properties should use limited URL Inspection checks.',
    useWhen: [
      'A large site needs a practical sampling plan for URL Inspection.',
      'You want to spread checks across useful URL-prefix properties.',
    ],
    avoidWhen: [
      'You need current Google index results rather than a plan.',
      'You want complete coverage beyond the available quota.',
    ],
    outcome: 'A quota-aware list of URLs and properties to inspect next.',
  },
  'index-coverage': {
    name: 'Index coverage signals',
    description:
      'Compare the pages your site exposes with pages that had Google Search visibility, then choose representative URLs for URL Inspection.',
    useWhen: [
      'You need to find crawlable pages that did not appear in the Search Console results returned for the selected period.',
      'You want a focused review list before spending URL Inspection quota.',
    ],
    avoidWhen: [
      'You need proof that a URL is indexed or excluded. Use URL Inspection for that URL.',
      'You do not have a saved crawl for the selected site.',
    ],
    outcome:
      'Cross-source URL groups with clear evidence limits and a representative review queue for URL Inspection.',
  },
  'index-monitor': {
    name: 'Collect index snapshots',
    description:
      'Check selected sitemap URLs with Google URL Inspection and save the results locally for later comparison.',
    useWhen: [
      'You want current Google index evidence for a controlled URL set.',
      'You need repeatable snapshots for future monitoring.',
    ],
    avoidWhen: [
      'You expect every URL in a large site to be checked at once.',
      'You only need to review previously saved snapshots.',
    ],
    outcome:
      'Saved URL Inspection results with quota skips and provider failures separated.',
  },
  'index-watch': {
    name: 'Review index changes',
    description:
      'Compare current Google index evidence with saved snapshots to find regressions and recoveries.',
    useWhen: [
      'You want to see which monitored URLs changed index state.',
      'You need to separate page issues from quota or provider failures.',
    ],
    avoidWhen: [
      'No earlier index snapshots exist.',
      'You want a complete index count for the whole site.',
    ],
    outcome:
      'A review queue of current issues, regressions, recoveries, and failed checks.',
  },
  'internal-links': {
    name: 'Internal link opportunities',
    description:
      'Find relevant pages that could add a useful internal link to a target URL.',
    useWhen: [
      'A target page needs stronger internal discovery or contextual links.',
      'You want candidate source pages checked against their current content.',
    ],
    avoidWhen: [
      'You want links added automatically.',
      'The target and candidate pages do not share a clear topic or user need.',
    ],
    outcome:
      'Verified source-page candidates with query and page evidence for review.',
  },
  'link-recovery': {
    name: 'Recover broken search-value URLs',
    description:
      'Find URLs that previously earned search clicks but now fail, redirect poorly, or block indexing.',
    useWhen: [
      'You suspect valuable URLs broke during a migration or release.',
      'You want to prioritize technical recovery using Search Console evidence.',
    ],
    avoidWhen: [
      'You want a backlink report.',
      'You have no Search Console page history for the site.',
    ],
    outcome:
      'A ranked recovery list with current URL checks and prior search value.',
  },
  'measure-change': {
    name: 'Measure an SEO change',
    description:
      'Compare equal Search Console periods before and after a known site change.',
    useWhen: [
      'A release, migration, or content change has a clear date.',
      'Both comparison periods contain final and comparable data.',
    ],
    avoidWhen: [
      'The after period is incomplete.',
      'You need proof that the change caused the movement.',
    ],
    outcome:
      'A before-and-after search comparison with confounders and data limits shown.',
  },
  'page-opportunities': {
    name: 'Opportunities for one page',
    description:
      'Find Search Console queries and page evidence that point to useful improvements for one URL.',
    useWhen: [
      'You want to improve an existing page using its own search demand.',
      'You need query themes and page checks in one result.',
    ],
    avoidWhen: [
      'The page has no useful Search Console data.',
      'You want a guaranteed traffic gain.',
    ],
    outcome:
      'A ranked page improvement list tied to real queries and current content.',
  },
  'performance-audit': {
    name: 'Page performance audit',
    description:
      'Run Lighthouse lab checks and add CrUX field Core Web Vitals when that data is available.',
    useWhen: [
      'You need actionable performance diagnostics for a page.',
      'You want lab findings kept separate from real-user field data.',
    ],
    avoidWhen: [
      'You want Lighthouse scores presented as field Core Web Vitals.',
      'The page cannot be fetched from the local machine.',
    ],
    outcome:
      'Lab diagnostics plus clearly labelled field metrics when available.',
  },
  'query-clusters': {
    name: 'Search query clusters',
    description:
      'Group related Search Console queries so repeated demand themes are easier to review.',
    useWhen: [
      'A large query list needs a clearer topic structure.',
      'You want to find repeated wording within a site section.',
    ],
    avoidWhen: [
      'You need semantic or intent classification beyond shared query terms.',
      'You want clusters turned into new pages automatically.',
    ],
    outcome: 'Stable query groups with the search demand behind each theme.',
  },
  'quick-wins': {
    name: 'Page-one CTR opportunities',
    description:
      'Find page-one query and URL pairs whose CTR deserves a closer look.',
    useWhen: [
      'You want high-impression title and snippet review candidates.',
      'You need page-one opportunities ranked from Search Console data.',
    ],
    avoidWhen: [
      'You want a promised click gain.',
      'You plan to treat a CTR heuristic as a Google requirement.',
    ],
    outcome:
      'A ranked review queue with CTR, position, impressions, and comparison evidence.',
  },
  'redirect-trace': {
    name: 'Redirect trace',
    description:
      'Follow every redirect hop and check the final page, indexability, and canonical signals.',
    useWhen: [
      'A URL redirects unexpectedly or through several hops.',
      'You need to verify the final destination after a migration.',
    ],
    avoidWhen: [
      'You need to discover redirect issues across a whole site.',
      'The URL requires a signed-in browser session.',
    ],
    outcome: 'The complete redirect chain with final response and page checks.',
  },
  'refresh-priorities': {
    name: 'Content refresh priorities',
    description:
      'Combine search declines and near-term opportunities into a ranked content review queue.',
    useWhen: [
      'You need to decide which existing pages to review first.',
      'You want several Search Console signals ranked in one queue.',
    ],
    avoidWhen: [
      'You need a technical crawl plan.',
      'You want the ranking treated as a traffic forecast.',
    ],
    outcome:
      'A focused list of pages and queries to investigate next, with reasons.',
  },
  'search-performance-overview': {
    name: 'Search performance overview',
    description:
      'Find where Google Search performance changed and choose the next focused report to inspect it.',
    useWhen: [
      'You are starting an investigation and do not yet know which pages or queries moved.',
      'You want one view of declines, gains, overlap, and near-term opportunities.',
    ],
    avoidWhen: [
      'You already know the exact question and can run a focused report.',
      'You need a technical crawl without Search Console analysis.',
    ],
    outcome:
      'A clear search performance summary with a short list of next reports.',
  },
  'second-page': {
    name: 'Second-page opportunities',
    description:
      'Find URLs averaging positions 11 to 20 and see the queries behind each opportunity.',
    useWhen: [
      'You want existing pages that may deserve closer review near page one.',
      'You need page-level evidence across all matching queries.',
    ],
    avoidWhen: [
      'You want average position treated as a fixed rank.',
      'You need proof that a change will move the page to page one.',
    ],
    outcome:
      'A ranked URL list with query, click, impression, and position evidence.',
  },
  'segment-impact': {
    name: 'Search impact by segment',
    description:
      'Compare page or query groups across equal periods to find which parts of a site moved.',
    useWhen: [
      'A traffic change may be concentrated in one directory, page type, or query group.',
      'You need to separate broad movement from a local segment issue.',
    ],
    avoidWhen: [
      'The periods are incomplete or not comparable.',
      'Missing Search Console rows would be mistaken for zero activity.',
    ],
    outcome:
      'A segment comparison showing where clicks and impressions changed.',
  },
  'setup-check': {
    name: 'Check local setup',
    description:
      'Check Google login, scopes, local configuration, and saved defaults before running reports.',
    useWhen: [
      'Authentication or site selection is failing.',
      'You want to verify the local setup before investigating report errors.',
    ],
    avoidWhen: ['You need SEO findings rather than a setup check.'],
    outcome: 'A local setup status with the exact problems that need fixing.',
  },
  'site-crawl': {
    name: 'Sitemap health pass and technical site crawl',
    description:
      'Start with a lightweight sitemap health pass, then run a full technical crawl only when page bodies and content-level evidence are needed.',
    useWhen: [
      'You need a fast first check of sitemap URLs, statuses, redirects, robots decisions, or access blocks.',
      'You need to discover technical issues across linked pages.',
      'You want a crawl snapshot for later filtering or comparison.',
    ],
    avoidWhen: [
      'You only need to check one page or a known URL list.',
      'Do not run a full crawl on a large or unknown site before health=true, or when important content requires browser rendering that is not enabled.',
    ],
    outcome:
      'A fast sitemap response gate or a full crawl summary with page evidence, technical findings, crawler identity, access guidance, and an optional saved report ID.',
  },
  'striking-distance': {
    name: 'Queries near page one',
    description:
      'Find Search Console query and page pairs averaging positions 11 to 20.',
    useWhen: [
      'You want existing search demand close to page one.',
      'You need a compact list of queries and URLs for content review.',
    ],
    avoidWhen: [
      'You want average position treated as an exact daily rank.',
      'You need a promised ranking or click gain.',
    ],
    outcome:
      'A ranked list of near-page-one query and URL pairs with search evidence.',
  },
  'technical-watch': {
    name: 'Technical SEO watch',
    description:
      'Run crawl and index checks together to catch technical regressions on a schedule.',
    useWhen: [
      'You want recurring checks after releases or site changes.',
      'You need crawl changes and selected Google index checks in one run.',
    ],
    avoidWhen: [
      'You have not chosen any crawl, index, or link recovery input.',
      'You need a one-off deep audit rather than ongoing monitoring.',
    ],
    outcome:
      'A combined technical change report with failures and skipped checks kept separate.',
  },
  'top-fixes': {
    name: 'Top technical SEO fixes',
    description:
      'Turn crawl findings into a short, ranked queue of technical issues to investigate first.',
    useWhen: [
      'A crawl contains too many findings to review at once.',
      'You need representative URLs and reasons for the highest priorities.',
    ],
    avoidWhen: [
      'You need every affected URL for one rule.',
      'You plan to treat rank as proof of business impact.',
    ],
    outcome:
      'A focused technical fix queue with issue evidence and example URLs.',
  },
  'traffic-anomaly': {
    name: 'Unusual search traffic changes',
    description:
      "Find recent clicks or impressions that moved beyond the site's normal Search Console pattern.",
    useWhen: [
      'You want an early signal of an unusual search change.',
      'You need to know whether recent movement stands out from normal variation.',
    ],
    avoidWhen: [
      'There is too little history for a useful baseline.',
      'You want the report to identify the cause of the change.',
    ],
    outcome:
      'A statistical movement signal with the dates, baseline, and limits shown.',
  },
  'update-correlation': {
    name: 'Google update correlation',
    description:
      'Compare search movement dates with official Google ranking update windows.',
    useWhen: [
      'A traffic change overlaps a confirmed Google ranking update.',
      'You need a timeline before investigating affected pages and queries.',
    ],
    avoidWhen: [
      'You want overlap presented as proof of causation.',
      'The traffic window does not cover the update dates.',
    ],
    outcome:
      'A traffic and update timeline with overlaps clearly labelled as correlation.',
  },
  'update-postmortem': {
    name: 'Google update impact review',
    description:
      'Find the pages and queries that gained or lost around a confirmed Google ranking update.',
    useWhen: [
      'You need winners and losers around a known update window.',
      'You want to compare affected segments and known site changes.',
    ],
    avoidWhen: [
      'You want the report to claim the update caused every change.',
      'The comparison periods are incomplete or contain major unrecorded changes.',
    ],
    outcome:
      'A post-update review of winners, losers, confounders, and next checks.',
  },
} as const satisfies Record<string, ReportGuidance>

export function getReportGuidance(id: string): FullReportGuidance | undefined {
  const base = (REPORT_GUIDANCE as Record<string, ReportGuidance>)[id]
  const depth = (REPORT_DEPTH as Record<string, ReportDepth>)[id]
  if (!base || !depth) return undefined
  return { ...base, ...depth }
}
