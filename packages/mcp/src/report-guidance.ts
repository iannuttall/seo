import { REPORT_DEPTH, type ReportDepth } from './report-depth.js'
import { REPORT_GUIDANCE_DOMAIN_RESEARCH } from './report-guidance-domain-research.js'

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
  ...REPORT_GUIDANCE_DOMAIN_RESEARCH,
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
  'agent-readiness': {
    name: 'AI agent readiness',
    description:
      'Check whether a content site gives agents clean, stable, machine-readable pages and discovery files.',
    useWhen: [
      'You want to test Markdown alternatives, content negotiation, Agent Skills, llms.txt, identity, and crawler access together.',
      'You need evidence that the agent-facing version of a content site matches its public HTML routes.',
    ],
    avoidWhen: [
      'You need an AI visibility, mention, citation, or ranking report.',
      'You are auditing a public API, interactive application, or commerce flow rather than a content site.',
    ],
    outcome:
      'An unscored content-site assessment with failed routes, evidence, and clear next actions.',
  },
  'ai-readiness': {
    name: 'AI search technical readiness',
    description:
      'Check whether crawl, index, or snippet controls could block pages from Google AI search features.',
    useWhen: [
      'You want to check technical access before investigating AI search visibility.',
      'You need page-level evidence for robots, indexability, or snippet restrictions.',
    ],
    avoidWhen: [
      'You want a visibility score or a prediction of AI citations.',
      'You need evidence of visits from AI products.',
    ],
    outcome: 'A technical blocker list with affected pages and clear limits.',
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
  'ai-search-scorecard': {
    name: 'AI search scorecard',
    description:
      "Score AI-search technical readiness 0-100 from one crawl using this tool's own weighted checks, with observed evidence kept separate.",
    useWhen: [
      'You want a single scored summary of the AI-search technical evidence this tool already collects.',
      'You need per-check pass, warn, fail, or unknown states with the exact weights and formula.',
    ],
    avoidWhen: [
      'You want a Google or AI-engine eligibility verdict, a ranking prediction, or proof of citations.',
      'You need per-page fixes rather than a scored overview.',
    ],
    outcome:
      'A 0-100 heuristic score with per-check evidence, unknown exclusions, and a partial flag.',
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
  'bing-webmaster-overview': {
    name: 'Bing Webmaster overview',
    description:
      'Review bounded Bing traffic trends, crawl changes, and query and page opportunities for one verified site.',
    useWhen: [
      'You want processed search and crawl insights observed by Bing.',
      'You need a second search-engine view beside Search Console.',
    ],
    avoidWhen: [
      'Bing Webmaster is not connected for this installation.',
      'You need URL-level backlink rows or proof that a page is indexed.',
    ],
    outcome:
      'Prioritized Bing findings with traffic comparisons, crawl changes, query and page opportunities, provider coverage, and caveats.',
  },
  'link-evidence': {
    name: 'Referring link evidence',
    description:
      'Review bounded referring-link evidence from a live provider, Bing Webmaster or a local export.',
    useWhen: [
      'You want concrete referring URLs and anchor text where available.',
      'You want to compare a live provider summary with saved crawl and Search Console evidence for linked target pages.',
      'You need one normalized view of DataForSEO, Bing or an exported CSV, JSON, or JSONL file.',
    ],
    avoidWhen: [
      'You need a complete backlink index or a universal authority score.',
      'You want to find broken internal links during a crawl.',
    ],
    outcome:
      'Provider summary counts, representative links, target-page search and crawl context, and bounded technical findings with explicit source coverage.',
  },
  'server-log-analysis': {
    name: 'Server log crawler analysis',
    description:
      'Stream a local access log to see observed search and AI crawler requests, statuses, and paths.',
    useWhen: [
      'You need evidence of crawler requests that reached the web server.',
      'You want to find crawler-facing 4xx or 5xx responses in a local access log.',
    ],
    avoidWhen: [
      'You do not have a combined or JSONL access log.',
      'You need to prove crawler identity from a user-agent string alone.',
    ],
    outcome:
      'Bounded crawler, status, and path aggregates with file coverage and parser limits kept visible.',
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
  'community-intent': {
    name: 'Community and review intent',
    description:
      'Find Search Console queries that explicitly ask for reviews, comparisons, recommendations, or real experience.',
    useWhen: [
      'You want to see where searchers ask for proof, opinions, or comparisons.',
      'You are planning content that answers community-style questions.',
    ],
    avoidWhen: [
      'You want the tool to guess intent without explicit query wording.',
      'You need proof that a new page will rank.',
    ],
    outcome:
      'A review list of real queries grouped by the intent language they contain.',
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
  'entity-readiness': {
    name: 'Entity signal review',
    description:
      'Check names, authors, dates, structured data, and profile links that help identify who created a page.',
    useWhen: [
      'You want to review publisher, organization, or author signals across crawled pages.',
      'You need examples of missing or inconsistent entity evidence.',
    ],
    avoidWhen: [
      'You want a knowledge graph or ranking guarantee.',
      'You have not saved or supplied a crawl.',
    ],
    outcome:
      'Page-level entity observations with examples that need human review.',
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
  'generate-llms-txt': {
    name: 'Generate an llms.txt draft',
    description:
      'Create a concise llms.txt draft from selected public pages in a crawl report.',
    useWhen: [
      'You want a human-reviewed navigation file for useful public pages.',
      'You have a current crawl that identifies suitable canonical URLs.',
    ],
    avoidWhen: [
      'You expect the file to improve rankings, indexing, or AI citations.',
      'The source crawl is old, partial, or aimed at the wrong site section.',
    ],
    outcome:
      'An editable llms.txt draft with source and size limits kept visible.',
  },
  'geo-gaps': {
    name: 'Google AI search controls',
    description:
      'Find crawl, index, and snippet settings that could restrict pages in Google AI search features.',
    useWhen: [
      'You want to find technical restrictions that apply to Google AI search.',
      'You need affected pages for a crawl, index, or preview control.',
    ],
    avoidWhen: [
      'You want a generic AI visibility score.',
      'You need referral traffic or citation monitoring.',
    ],
    outcome:
      'A focused list of technical restrictions and the pages where they appear.',
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
  'llms-txt-audit': {
    name: 'Audit llms.txt',
    description:
      'Check whether llms.txt exists, whether its links work, and how well it reflects useful public pages.',
    useWhen: [
      'The site publishes llms.txt and you want to verify it.',
      'You are deciding whether a concise navigation file would help agents.',
    ],
    avoidWhen: [
      'You expect llms.txt to improve Google rankings or indexing.',
      'You need to generate a new draft rather than audit the current file.',
    ],
    outcome:
      'File, link, and page coverage findings with no visibility claims.',
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
  'monthly-action-plan': {
    name: 'Monthly SEO action plan',
    description:
      'Review a calendar month of search performance and turn the evidence into next actions.',
    useWhen: [
      'You need a recurring monthly review with clear priorities.',
      'The selected month has final Search Console data.',
    ],
    avoidWhen: [
      'You only need a client-ready summary without an action queue.',
      'The month is still incomplete.',
    ],
    outcome: 'A monthly performance summary followed by a focused action plan.',
  },
  'monthly-report': {
    name: 'Monthly SEO report',
    description:
      'Turn one calendar month of search evidence into a concise report for clients or teams.',
    useWhen: [
      'You need a readable monthly summary of organic search performance.',
      'The selected month has final Search Console data.',
    ],
    avoidWhen: [
      'You need a rolling period rather than a calendar month.',
      'You want a detailed technical site audit.',
    ],
    outcome:
      'A clear monthly narrative with wins, losses, caveats, and next steps.',
  },
  'narrative-report': {
    name: 'Client-ready SEO narrative',
    description:
      'Turn search, change, and monitoring evidence into a readable update without hiding caveats.',
    useWhen: [
      'You need to explain recent SEO performance to a client or team.',
      'You want one narrative built from several available evidence sources.',
    ],
    avoidWhen: [
      'You need raw rows for further analysis.',
      'You want unsupported forecasts or causal claims.',
    ],
    outcome:
      'A concise written report with evidence, limits, and practical next steps.',
  },
  'okf-build': {
    name: 'Build site knowledge for agents',
    description:
      'Create a compact, cited site knowledge pack from public pages in a crawl.',
    useWhen: [
      'An agent needs reliable site facts with links back to source pages.',
      'You want a portable knowledge pack from selected crawl content.',
    ],
    avoidWhen: [
      'The crawl contains private, stale, or irrelevant pages.',
      'You want the tool to invent missing facts.',
    ],
    outcome: 'An OKF manifest and optional markdown files with source links.',
  },
  'okf-validate': {
    name: 'Validate a site knowledge pack',
    description:
      'Check supplied OKF markdown files for structure, references, and broken links before use.',
    useWhen: [
      'You created or edited an OKF pack and want to check it.',
      'An agent needs to verify files before loading them.',
    ],
    avoidWhen: ['You need to build the pack from a crawl first.'],
    outcome: 'A validation result with exact file, reference, and link errors.',
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
  'pseo-audit': {
    name: 'Programmatic SEO audit',
    description:
      'Review repeated page templates using search demand, crawl evidence, and optional Google index checks.',
    useWhen: [
      'A site publishes many pages from repeatable templates.',
      'You need to compare template groups before expanding or pruning them.',
    ],
    avoidWhen: [
      'You want every repeated path labelled as spam or thin content.',
      'There are too few pages to compare as a template group.',
    ],
    outcome:
      'Template-level demand, quality, and index evidence with representative URLs.',
  },
  'pseo-opportunities': {
    name: 'Programmatic SEO opportunities',
    description:
      'Combine repeated template and query-cluster evidence with optional keyword discovery, live results, competitor URL patterns, and data-source research briefs.',
    useWhen: [
      'You want to expand a template that already earns impressions without treating every related keyword as a new page.',
      'You need to separate extensions of an observed template from research for a possible new template.',
      'Current result pages and repeated competitor URL patterns would change the programmatic SEO decision.',
    ],
    avoidWhen: [
      'You only need to audit the current technical and index state of existing templates.',
      'You want external provider calls made without explicit market, cost, and result limits.',
    ],
    outcome:
      'A bounded research queue that keeps first-party templates, provider estimates, live results, competitor patterns, costs, and data-source checks separate.',
  },
  'keyword-metrics': {
    name: 'Keyword metrics',
    description:
      'Compare market-specific keyword demand, trend, cost, competition, difficulty, intent, and result-count estimates.',
    useWhen: [
      'You have a bounded keyword list and need independent market estimates.',
      'You want recent demand history before deciding which terms deserve deeper research.',
    ],
    avoidWhen: [
      'You need first-party evidence of how your own pages perform.',
      'You need an exact current rank or a current result-page comparison.',
    ],
    outcome:
      'Provider-neutral keyword evidence with missing values, costs, coverage, and trend heuristics kept visible.',
  },
  'keyword-opportunities': {
    name: 'Enriched keyword opportunities',
    description:
      'Combine existing Search Console opportunity evidence with optional market estimates and programmatic SEO cluster context.',
    useWhen: [
      'You want quick-win, second-page, and striking-distance evidence from one bounded Search Console acquisition.',
      'You want to add independent keyword estimates without replacing first-party evidence or its existing scores.',
      'You need candidate query clusters and repeatable page patterns to validate before expanding a template.',
    ],
    avoidWhen: [
      'You only need independent metrics for a supplied keyword list.',
      'You need a current result snapshot, exact rank, competitor comparison, or external provider work without explicit paid-request intent.',
    ],
    outcome:
      'Bounded first-party opportunity sections, optional typed provider evidence, discrepancy findings, and programmatic SEO validation prompts.',
  },
  'keyword-research': {
    name: 'Keyword research',
    description:
      'Expand a small seed list into market-specific keyword ideas with source, metric, coverage, and cost evidence.',
    useWhen: [
      'You need candidate terms beyond the queries already visible in Search Console.',
      'You want to compare several bounded provider discovery methods before deeper result-page research.',
    ],
    avoidWhen: [
      'You need exact current rankings or pages in the live results.',
      'You plan to turn every discovered term into a page without checking intent or fit.',
    ],
    outcome:
      'A bounded keyword set with discovery sources, provider estimates, evidence states, and research follow-ups.',
  },
  'local-search-demand': {
    name: 'Local search demand',
    description:
      'Find location-specific Search Console demand and enrich a small shortlist with exact local result snapshots.',
    useWhen: [
      'You want to find retained queries that name a service area, use a proximity phrase, or contain a postcode or ZIP code.',
      'You need to connect local demand with current landing pages and repeated programmatic page patterns.',
      'You want optional city and device-specific result evidence without replacing first-party performance data.',
    ],
    avoidWhen: [
      'You need Google Business Profile performance or a complete business listing audit.',
      'You want the searcher location inferred from a place name in the query.',
    ],
    outcome:
      'A bounded local-intent query and page queue, repeated local template signals, and optional local SERP feature and competitor evidence.',
  },
  'saved-keywords': {
    name: 'Saved keyword set',
    description:
      'Review one local keyword set with metric freshness, tags, page mappings, and explicit view limits.',
    useWhen: [
      'You want to continue earlier keyword research from a saved project set.',
      'You need to review stale, unmapped, or tagged terms before deeper research.',
    ],
    avoidWhen: [
      'You need independent keyword discovery or a current result snapshot.',
      'You plan to treat user-managed tags as proof of shared search intent.',
    ],
    outcome:
      'A bounded local research view with saved evidence, freshness state, planning mappings, and next steps.',
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
  'serp-results': {
    name: 'Live search results',
    description:
      'Inspect one location and device-specific search snapshot with exact organic ranks, domains, result features, and provider evidence.',
    useWhen: [
      'A keyword needs a current result-page review before content or targeting decisions.',
      'You need exact snapshot ranks kept separate from Search Console average position.',
    ],
    avoidWhen: [
      'You need rank history or scheduled tracking across many keywords.',
      'You want a domain strength, content quality, or ranking feasibility verdict.',
    ],
    outcome:
      'A bounded result snapshot with exact retained ranks, domain repetition, query corrections, features, cost, and coverage.',
  },
  'rank-tracking': {
    name: 'Exact rank tracking',
    description:
      'Collect and compare exact organic positions for a saved keyword set without mixing markets, devices, or Search Console averages.',
    useWhen: [
      'You need repeatable exact-rank snapshots for a fixed market and device.',
      'You want new, lost, improved, declined, or ranking URL change evidence over time.',
      'A recurring set should use cheaper queued collection and local history.',
    ],
    avoidWhen: [
      'You need first-party clicks, impressions, or average position; use a Search Console report.',
      'One current query needs result-page inspection but no history; use live search results.',
    ],
    outcome:
      'A bounded exact-rank comparison with explicit depth, pending and failed states, provider cost, and local retention evidence.',
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
  'seo-to-ai-query': {
    name: 'AI monitoring prompt ideas',
    description:
      'Turn real Search Console query wording into a repeatable set of prompts for external AI monitoring.',
    useWhen: [
      'You need prompt ideas grounded in the way people already find the site.',
      'You want a stable prompt set for manual or third-party monitoring.',
    ],
    avoidWhen: [
      'You want proof of demand inside AI products.',
      'You want citation or visibility results from this report.',
    ],
    outcome:
      'A prompt set linked back to its source queries and search metrics.',
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
