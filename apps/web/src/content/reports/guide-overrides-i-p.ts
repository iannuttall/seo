import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesIP: Partial<
  Record<string, ReportGuideOverride>
> = {
  'index-coverage': {
    name: 'Index coverage signals',
    summary:
      'Find crawlable pages missing from the returned Search Console data, then choose representative URLs for direct inspection.',
    lead: 'Use this when you need to investigate index coverage across more than one source. It compares pages found in a saved crawl and sitemap with pages that appeared in Search Console results, then gives you a focused list to check with URL Inspection.',
    inputs: [
      {
        label: 'Saved crawl report',
        role: 'Provides the pages fetched locally, their current crawl controls, and explicit crawl scope and completeness.',
      },
      {
        label: 'XML sitemap inventory when available',
        source: 'sitemaps',
        role: 'Adds pages the site submitted for discovery. A saved crawl can provide declared sitemap document URLs, but it does not contain a complete sitemap inventory by itself.',
      },
      {
        label: 'Finalized Search Console page rows',
        source: 'search-analytics',
        role: 'Shows which pages appeared with Google Search impressions in the chosen date range, up to the explicit row limit.',
      },
    ],
    checks: [
      'Separates pages found in Search Console, crawlable review candidates, current crawl controls, sitemap-only URLs, and Search Console-only URLs.',
      'Keeps source completeness, date range, row caps, invalid rows, duplicate rows, and omitted detail beside the result.',
      'Groups repeated URL templates for representative sampling only. It does not label them as poor quality or index bloat.',
    ],
    returns: [
      'Exact cross-source counts plus limited URL lists for each evidence group.',
      'A representative review queue, template samples, source details, and caveats that explain what missing Search Console rows cannot prove.',
    ],
    seo: {
      title: 'Index Coverage Signals: Find Pages That Need URL Inspection',
      description:
        'Compare crawl, sitemap, and Search Console evidence to choose pages for URL Inspection without treating missing search rows as proof they are unindexed.',
      heading: 'Find the right pages to check with URL Inspection',
    },
  },
  'index-coverage-plan': {
    name: 'Plan Google index monitoring',
    summary:
      'Turn sitemap URLs, Search Console properties, and daily URL Inspection limits into a realistic monitoring cycle.',
    lead: 'Run this before spending URL Inspection quota on a large site. It allocates sitemap URLs to available properties and shows where an additional URL-prefix property could improve monitoring coverage.',
    inputs: [
      {
        label: 'XML sitemap inventories',
        source: 'sitemaps',
        role: 'Provide the limited URL population that needs an inspection plan.',
      },
      {
        label: 'Available Search Console properties and quota',
        source: 'url-inspection',
        role: 'Define ownership coverage, daily capacity, and the target monitoring cycle.',
      },
    ],
    checks: [
      'Assigns eligible sitemap URLs to the most specific available Search Console property.',
      'Calculates cycle capacity and suggests URL-prefix properties where meaningful folders lack practical coverage.',
    ],
    returns: [
      'URL inventory counts, property allocations, daily capacity, target cycle, and uncovered or unassigned URLs.',
      'Suggested URL-prefix properties and representative paths, with no URL Inspection quota spent.',
    ],
    seo: {
      title: 'Google Index Monitoring Plan: Use URL Inspection Quota Wisely',
      description:
        'Plan Google index monitoring from sitemap URLs, Search Console properties, and URL Inspection limits before spending daily quota on a large site.',
      heading: 'Plan URL Inspection coverage before spending Google quota',
    },
  },
  'index-monitor': {
    name: 'Collect Google index snapshots',
    summary:
      'Inspect a quota-limited sitemap sample and save Google indexed-state snapshots for later comparison.',
    lead: 'Use this to build or refresh the snapshot history behind index monitoring. It selects due URLs within locally enforced quota and records every inspected, deferred, blocked, or failed request.',
    inputs: [
      {
        label: 'XML sitemap URLs',
        source: 'sitemaps',
        role: 'Provide the limited inventory from which due URLs are selected.',
      },
      {
        label: 'Search Console properties and URL Inspection quota',
        source: 'url-inspection',
        role: 'Provide exact Google index verdicts and the daily capacity available for each property.',
      },
      {
        label: 'Previous local index snapshots',
        role: 'Determine which URLs are due and preserve history for later change analysis.',
      },
    ],
    checks: [
      'Builds the sitemap inventory, maps URLs to properties, enforces local daily limits, and selects a limited due sample.',
      'Stores successful Google inspection snapshots and keeps quota blocks, deferred URLs, provider failures, and unselected due URLs separate.',
    ],
    returns: [
      'Inventory, due, selected, inspected, deferred, failed, quota-blocked, and unselected counts with exact selection source details.',
      'Current Google indexed-state snapshots, operational review rows, warnings, and a projected monitoring cycle.',
    ],
    seo: {
      title: 'Google Index Monitor: Collect URL Inspection Snapshots Locally',
      description:
        'Collect quota-limited Google URL Inspection snapshots from sitemap URLs, save local history, and keep deferred, failed, blocked, and unselected states clear.',
      heading: 'Collect Google index snapshots within your daily quota',
    },
  },
  'index-watch': {
    name: 'Review Google index changes',
    summary:
      'Inspect a limited URL set and separate current index issues, regressions, recoveries, and operational failures.',
    lead: 'Use this when you already know which URLs matter and want to compare Google’s latest indexed-state evidence with saved snapshots. Intentional controls stay observations until the history shows a meaningful contradiction.',
    inputs: [
      {
        label: 'Explicit URL sample',
        role: 'Defines the exact limited pages whose Google index state should be checked.',
      },
      {
        label: 'Google URL Inspection evidence',
        source: 'url-inspection',
        role: 'Provides the current indexed verdict, coverage state, canonical, crawl details, and provider status.',
      },
      {
        label: 'Previous local index snapshots',
        role: 'Provide the baseline used to classify regressions and recoveries.',
      },
    ],
    checks: [
      'Inspects only the selected URLs within quota and compares successful results with compatible saved snapshots.',
      'Separates current review states, regressions, recoveries, unchanged results, quota blocks, invalid inputs, and provider failures.',
    ],
    returns: [
      'Per-URL Google indexed-state evidence with current classification and previous snapshot comparison.',
      'Summary counts, operational failures, retry guidance, source limits, and caveats for intentional directives and incomplete samples.',
    ],
    seo: {
      title: 'Google Index Watch: Find Regressions and Recoveries in Google',
      description:
        'Check a limited URL set with Google URL Inspection and separate current index issues, regressions, recoveries, quota blocks, and provider failures.',
      heading: 'Review Google index changes for the URLs that matter',
    },
  },
  'internal-links': {
    name: 'Find internal link candidates',
    summary:
      'Find fetched pages with relevant search evidence that do not currently contain a verified contextual link to a chosen target.',
    lead: 'Use this when a sound target page needs better discovery paths from related content. Every candidate combines query evidence with a fetched source page and a verified missing link.',
    inputs: [
      {
        label: 'Search Console page and query evidence',
        source: 'search-analytics',
        role: 'Finds pages with returned query wording related to the chosen target topic.',
      },
      {
        label: 'Fetched source and target pages',
        source: 'crawlable-links',
        role: 'Verifies current links, page availability, canonical state, and visible content context.',
      },
    ],
    checks: [
      'Finds returned query overlap between the target topic and eligible source pages.',
      'Fetches limited candidates and keeps only pages where no contextual link to the canonical target was verified.',
    ],
    returns: [
      'Ranked source-page candidates with supporting queries, metrics, current link state, and target URL.',
      'Verification status, failed fetches, limits, caveats, and a prompt to choose natural anchor and placement manually.',
    ],
    seo: {
      title: 'Internal Link Opportunities: Find Relevant Source Pages',
      description:
        'Find relevant internal link source pages from Search Console evidence, verify the link is missing, and review each page before adding a contextual link.',
      heading: 'Find relevant pages that could link to a chosen target',
    },
  },
  'link-recovery': {
    name: 'Recover broken URLs with search value',
    summary:
      'Find URLs that still earn returned clicks or impressions but now fail, block access, or redirect poorly.',
    lead: 'Use this after a migration, deletion, redesign, or crawl regression to find broken destinations that still matter in search. The result prioritises observed demand and leaves the recovery choice to the page’s intent and replacement.',
    inputs: [
      {
        label: 'Returned Search Console page evidence',
        source: 'search-analytics',
        role: 'Provides clicks and impressions for URLs that still hold observed search value.',
      },
      {
        label: 'Live response and redirect evidence',
        source: 'redirects',
        role: 'Shows whether each candidate fails, blocks access, redirects poorly, or reaches a usable final page.',
      },
    ],
    checks: [
      'Finds search-visible URLs and verifies their current response, redirect chain, access, indexability, and final destination.',
      'Ranks supported recovery candidates by returned value and observed technical state without assuming every old URL should return.',
    ],
    returns: [
      'Broken, blocked, or poorly redirected URLs with returned clicks, impressions, live status, and final destination evidence.',
      'A limited recovery queue with restore, redirect, canonical, investigate, or leave-alone guidance tied to observed evidence.',
    ],
    seo: {
      title: 'SEO Link Recovery: Find Broken URLs With Search Value in GSC',
      description:
        'Find broken, blocked, or poorly redirected URLs that still hold Search Console clicks or impressions and build an evidence-backed recovery list.',
      heading: 'Find broken URLs that still hold search value',
    },
  },
  'crawl-history': {
    name: 'Find a saved crawl report',
    summary:
      'List local crawl snapshots by site and date so you can choose the right baseline without opening every report.',
    lead: 'Use this before comparing crawls or continuing an old audit. It returns report metadata only, which keeps discovery fast and avoids loading page or issue inventories into context.',
    inputs: [
      {
        label: 'Local saved crawl metadata',
        role: 'Provides report id, site, generated date, status, page count, issue count, and crawl scope.',
      },
      {
        label: 'Optional site and result limit',
        role: 'Narrows the list to the project and amount of history needed.',
      },
    ],
    checks: [
      'Reads locally saved report metadata and filters it by the exact optional site.',
      'Orders snapshots consistently and applies the requested limit without loading report detail.',
    ],
    returns: [
      'A compact list of saved crawl ids, sites, dates, status, page totals, issue totals, and configuration metadata.',
      'Enough context to open one snapshot or choose compatible before and after reports for comparison.',
    ],
    seo: {
      title: 'Saved SEO Crawl Reports: Find the Right Local Snapshot by Date',
      description:
        'List saved local SEO crawl reports by site and date, compare their scope and status, and choose the right snapshot without loading every page or issue.',
      heading: 'Find the saved crawl snapshot you need',
    },
  },
  'crawler-rules': {
    name: 'Browse crawler rules',
    summary:
      'See every technical check built into the local crawler and find the right rule for a focused follow-up.',
    lead: 'Use the rule catalog when a crawl returns an unfamiliar rule id or you want to see which technical checks are available before running a site audit.',
    inputs: [
      {
        label: 'Local crawler rule catalog',
        role: 'Provides the current rule ids, categories, severity, and guidance metadata.',
      },
      {
        label: 'Optional rule category',
        role: 'Limits the catalog to checks such as metadata, canonicals, or indexability.',
      },
    ],
    checks: [
      'Reads the versioned rule definitions shipped with the installed SEO package.',
      'Filters by an exact supported category without crawling a site or inventing findings.',
    ],
    returns: [
      'A compact list of valid rule ids with category, severity, and guidance metadata.',
      'The identifiers needed to explain a rule or find affected URLs in a saved crawl.',
    ],
    seo: {
      title: 'SEO Crawler Rules: Browse Every Technical Check | SEO Skills CLI',
      description:
        'Browse every SEO crawler rule, filter technical checks by category, and find the exact rule id needed for issue guidance or affected URLs from a saved crawl.',
      heading: 'Browse the technical checks built into SEO Skills CLI',
    },
  },
  'llms-txt-audit': {
    name: 'Audit an llms.txt file',
    summary:
      'Check whether an optional llms.txt file is reachable, readable, and consistent with useful pages from the crawl.',
    lead: 'This report is for publishers who have chosen to maintain llms.txt. It checks the file and its links without treating the format as a Google requirement or a shortcut to AI visibility.',
    inputs: [
      {
        label: 'Saved or fresh crawl report',
        role: 'Provides the observed llms.txt response and candidate source pages.',
      },
      {
        label: 'Current Google AI feature guidance',
        source: 'ai-features',
        role: 'Keeps optional file observations separate from Google crawl and indexing requirements.',
      },
    ],
    checks: [
      'Checks whether llms.txt was found, fetched successfully, parsed, and linked to usable destinations.',
      'Compares listed pages with limited crawl candidates while keeping normal crawl and indexing controls separate.',
    ],
    returns: [
      'The observed file status, parsed entries, broken or questionable destinations, and candidate pages.',
      'Clear caveats explaining that presence or absence does not predict crawling, citations, rankings, or AI visibility.',
    ],
    seo: {
      title: 'llms.txt Audit: Check the File, Links, and Page Coverage',
      description:
        'Audit an optional llms.txt file, check its linked pages, and find crawl-backed gaps without treating the format as a search ranking requirement.',
      heading: 'Check whether your llms.txt file is useful and accurate',
    },
  },
  'generate-llms-txt': {
    name: 'Create an llms.txt draft',
    summary:
      'Build a concise llms.txt draft from selected crawl evidence when someone has decided to maintain the optional file.',
    lead: 'The generator turns a limited page inventory into a draft you can review. It does not claim that publishing the file will improve rankings, indexing, citations, or AI visibility.',
    inputs: [
      {
        label: 'Saved or fresh crawl report',
        role: 'Supplies page URLs, titles, descriptions, and crawl exclusions.',
      },
      {
        label: 'Selection limits and exclusions',
        role: 'Control the maximum URLs, token budget, and paths that should stay out of the draft.',
      },
    ],
    checks: [
      'Selects eligible pages consistently within the requested URL and token limits.',
      'Keeps excluded, invalid, redirected, and unavailable pages out of the generated list.',
    ],
    returns: [
      'A reviewable llms.txt draft with the selected page titles, descriptions, and URLs.',
      'Generation metadata showing the crawl source, limits, exclusions, selected count, and caveats.',
    ],
    seo: {
      title: 'llms.txt Generator: Create a Draft From Your Site Crawl',
      description:
        'Create a limited llms.txt draft from crawl evidence, review every selected page, and keep the optional file accurate as your site changes over time.',
      heading: 'Create an llms.txt draft from pages you have crawled',
    },
  },
  'measure-change': {
    name: 'Measure an SEO change',
    summary:
      'Compare equal, finalised search windows around a recorded change and see what moved without claiming the change caused it.',
    lead: 'Use this after a title update, migration, template release, internal-link change, or content edit with a known date. The report keeps incomplete windows and competing explanations in view.',
    inputs: [
      {
        label: 'Search Console performance windows',
        source: 'search-analytics',
        role: 'Provides equal finalised periods before and after the recorded change.',
      },
      {
        label: 'Saved or ad hoc change details',
        role: 'Defines the site, page, query, or content group being measured and the date it changed.',
      },
      {
        label: 'Optional GA4 and control evidence',
        source: 'ga4-acquisition',
        role: 'Adds separate post-click or comparison context when configured.',
      },
    ],
    checks: [
      'Builds adjacent equal-length windows from finalised Search Console dates and reports any shortfall in usable days.',
      'Compares the selected scope while keeping absent rows, controls, GA4 evidence, and known confounders separate.',
    ],
    returns: [
      'Before and after search metrics, absolute and percentage movement, window coverage, and a cautious verdict.',
      'Optional control and GA4 comparisons plus warnings for incomplete data and plausible confounders.',
    ],
    seo: {
      title: 'Measure an SEO Change: Before and After Search Evidence',
      description:
        'Measure an SEO change with equal finalised Search Console windows, optional controls, and clear caveats that stop timing being mistaken for causation.',
      heading: 'Measure what changed after a specific SEO update',
    },
  },
  'monthly-report': {
    name: 'Monthly SEO report',
    summary:
      'Turn one calendar month of finalised search data into a clear report with changes, opportunities, gaps, and follow-up work.',
    lead: 'Use this for a repeatable monthly review that people can read without opening raw Search Console exports. Every headline stays tied to its date range and source coverage.',
    inputs: [
      {
        label: 'Finalised Search Console data',
        source: 'search-analytics',
        role: 'Provides the selected calendar month, compatible comparison data, and returned page and query evidence.',
      },
      {
        label: 'Optional live-page checks',
        role: 'Verifies a limited number of opportunity pages before the report suggests follow-up work.',
      },
    ],
    checks: [
      'Builds the requested calendar month and compares only compatible finalised evidence.',
      'Summarises supported movement and opportunities while preserving skipped sections, row limits, and source gaps.',
    ],
    returns: [
      'A readable monthly narrative with headline metrics, comparison context, opportunities, and caveats.',
      'Structured JSON with exact dates, source source details, returned rows, skipped work, and focused next actions.',
    ],
    seo: {
      title: 'Monthly SEO Report: Search Performance and Next Actions',
      description:
        'Create a monthly SEO report from finalised Search Console data with clear comparisons, opportunity evidence, data gaps, and useful follow-up actions.',
      heading: 'Turn a month of search data into a useful SEO report',
    },
  },
  'okf-build': {
    name: 'Build site knowledge for agents',
    summary:
      'Turn a saved crawl into a compact OKF knowledge pack with source pages an agent can inspect and verify locally.',
    lead: 'Use this when an agent needs a limited map of a site instead of thousands of crawl rows. The generated knowledge pack keeps citations back to the pages it came from.',
    inputs: [
      {
        label: 'Saved or fresh crawl report',
        role: 'Provides page URLs, metadata, internal links, extracted concepts, and crawl caveats.',
      },
      {
        label: 'Concept and file limits',
        role: 'Bounds the manifest and optional inline Markdown files for the agent context available.',
      },
    ],
    checks: [
      'Selects concepts and source pages consistently within the requested limits.',
      'Builds the OKF manifest, file paths, citations, and validation result from the selected crawl evidence.',
    ],
    returns: [
      'A compact OKF manifest with concept counts, source references, file paths, and inherited crawl caveats.',
      'Optional limited Markdown files plus a validation result when inline files are requested.',
    ],
    seo: {
      title: 'Site Knowledge for AI Agents: Build a Cited OKF Pack Locally',
      description:
        'Build a compact site knowledge pack from a saved crawl, keep every concept tied to source pages, and validate the OKF files before agents use them.',
      heading: 'Build a cited site knowledge pack for an AI agent',
    },
  },
  'okf-validate': {
    name: 'Validate an OKF knowledge pack',
    summary:
      'Check OKF files for structural, path, link, citation, and manifest problems before an agent or automation relies on them.',
    lead: 'Run validation after generating or editing an OKF knowledge pack. It catches format and reference problems, but it cannot prove that every statement in the files is current or correct.',
    inputs: [
      {
        label: 'OKF Markdown files',
        role: 'Supplies the limited paths and file contents that need structural validation.',
      },
    ],
    checks: [
      'Parses supported frontmatter, headings, links, citations, paths, and manifest references.',
      'Returns repeatable errors and warnings without fetching pages or judging the truth of their content.',
    ],
    returns: [
      'A pass or fail result with structured validation errors and warnings for each affected file.',
      'Plain-language guidance for fixing supported format and reference problems.',
    ],
    seo: {
      title: 'Validate an OKF Knowledge Pack: Find File and Link Errors',
      description:
        'Validate OKF Markdown files, find broken paths, links, citations, and manifest references, then fix the pack before an AI agent relies on it.',
      heading: 'Check an OKF knowledge pack before an agent uses it',
    },
  },
  'page-opportunities': {
    name: 'Find opportunities for one page',
    summary:
      'See which returned search queries are already associated with one URL and what deserves a closer look on the live page.',
    lead: 'Start here when one page needs a focused opportunity review. You get its first-party query evidence and optional page checks without turning every query into a content recommendation.',
    inputs: [
      {
        label: 'Exact-page Search Console rows',
        source: 'search-analytics',
        role: 'Provides returned queries, clicks, impressions, CTR, and average position for the selected URL.',
      },
      {
        label: 'Optional live-page fetch',
        source: 'javascript',
        role: 'Adds current metadata, content, and technical observations for a limited verification step.',
      },
    ],
    checks: [
      'Filters and ranks returned query rows for the exact page and requested date range.',
      'Records whether page verification succeeded and keeps unverified content conclusions out of the result.',
    ],
    returns: [
      'A compact query opportunity list with metrics, source completeness, and the selected page scope.',
      'Optional live-page observations plus investigation prompts that stay separate from measured search evidence.',
    ],
    seo: {
      title: 'SEO Page Opportunities: Find Queries Worth Investigating',
      description:
        'Find the Search Console queries attached to one page, review clicks, impressions, CTR, and position, then verify the live URL before making changes.',
      heading: 'Find the search opportunities attached to one page',
    },
  },
  'performance-audit': {
    name: 'Audit page performance',
    summary:
      'Combine a local Lighthouse test with available CrUX field data and see where a page is slow without mixing lab and real-user evidence.',
    lead: 'Use this to reproduce loading problems and check available Core Web Vitals for one URL. Lab results explain a controlled run. CrUX describes eligible real-user visits.',
    inputs: [
      {
        label: 'Local Lighthouse navigation',
        role: 'Provides lab performance metrics, diagnostics, and opportunities for the selected device strategy.',
      },
      {
        label: 'Optional CrUX field data',
        source: 'core-web-vitals',
        role: 'Provides device-specific p75 Core Web Vitals when the URL or origin has enough eligible traffic.',
      },
    ],
    checks: [
      'Runs Lighthouse locally and records the tested URL, strategy, environment, metrics, and diagnostic opportunities.',
      'Reports URL or origin CrUX coverage separately and never substitutes lab TBT for field INP.',
    ],
    returns: [
      'A lab performance summary with Lighthouse metrics, diagnostics, and the strongest reproducible bottlenecks.',
      'Available CrUX LCP, INP, and CLS evidence with device, scope, thresholds, and unavailable states shown explicitly.',
    ],
    seo: {
      title: 'Page Performance Audit: Lighthouse and Core Web Vitals for SEO',
      description:
        'Audit one page with a local Lighthouse run and available CrUX Core Web Vitals, keeping lab diagnostics and real-user field evidence separate.',
      heading: 'Check page speed with lab and real-user evidence',
    },
  },
  'pseo-audit': {
    name: 'Audit programmatic SEO templates',
    summary:
      'Review repeated page families with search demand, limited crawl samples, and optional Google index evidence kept separate.',
    lead: 'Use this for city pages, directories, comparisons, integrations, and other repeated templates. It looks for patterns worth reviewing without condemning thousands of URLs from one sample.',
    inputs: [
      {
        label: 'Sitemap and template inventory',
        source: 'sitemaps',
        role: 'Provides discoverable URLs and repeated path patterns for the population under review.',
      },
      {
        label: 'Search Console page and query rows',
        source: 'search-analytics',
        role: 'Adds returned visibility and demand evidence for template families.',
      },
      {
        label: 'Limited crawl and URL Inspection samples',
        source: 'url-inspection',
        role: 'Adds observed page checks and optional Google index verdicts for selected URLs.',
      },
    ],
    checks: [
      'Detects repeated URL patterns and groups returned search evidence without treating absent rows as zero demand.',
      'Reviews limited samples for response, canonical, indexability, metadata, headings, repeated text, and exact inspection verdicts when requested.',
    ],
    returns: [
      'Template families with population counts, returned search evidence, sampled findings, and representative URLs.',
      'A limited verdict and review plan that states which claims apply only to crawl or inspection samples.',
    ],
    seo: {
      title: 'Programmatic SEO Audit: Check Templates, Demand, and Indexing',
      description:
        'Audit programmatic SEO templates with sitemap, Search Console, crawl, and optional URL Inspection evidence while keeping every sample limit visible.',
      heading: 'Audit repeated page templates with evidence you can check',
    },
  },
  'query-clusters': {
    name: 'Group related search queries',
    summary:
      'Turn a large returned Search Console query set into reproducible groups that are easier to review for shared demand.',
    lead: 'Use query clusters to organise similar wording before content or reporting work. The grouping is based on token overlap, so it stays reproducible and does not pretend to understand every search intent.',
    inputs: [
      {
        label: 'Returned Search Console queries',
        source: 'search-analytics',
        role: 'Provides query wording and metrics from the selected property and date range.',
      },
      {
        label: 'Clustering threshold and limits',
        role: 'Control the required token overlap, source rows, and number of groups returned.',
      },
    ],
    checks: [
      'Normalises eligible query tokens and groups rows using the documented overlap threshold.',
      'Aggregates returned metrics and orders clusters consistently while preserving source limits.',
    ],
    returns: [
      'Named query groups with member queries, aggregate metrics, representative terms, and stable ordering.',
      'Selection and source metadata showing returned rows, limits, filtering, and possible truncation.',
    ],
    seo: {
      title: 'SEO Query Clusters: Group Related Search Console Demand',
      description:
        'Group related Search Console queries with reproducible token overlap, inspect each member and metric, and turn a large export into reviewable themes.',
      heading: 'Group related Search Console queries into useful themes',
    },
  },
}
