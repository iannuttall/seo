import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesIP: Partial<
  Record<string, ReportGuideOverride>
> = {
  'index-coverage': {
    name: 'Index coverage signals',
    summary:
      'Find crawlable pages missing from the returned Search Console data, then choose representative URLs for direct inspection.',
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
    alternatives: [
      {
        when: 'You need Google’s current indexed verdict for a specific URL.',
        reportId: 'index-watch',
        doInstead:
          'Run index watch for a limited URL set. It adds direct URL Inspection verdicts and saved-history comparisons instead of inferring index state from crawl, sitemap, or Search Analytics data.',
      },
      {
        when: 'You need a definitive count of every indexed URL on a large site.',
        doInstead:
          'No automated report can produce that count from Search Analytics or a quota-limited URL Inspection sample. Use this report to select representative URLs, inspect them directly, and review Search Console indexing reports alongside the site’s intended URL inventory.',
      },
    ],
    seo: {
      primaryKeyword: 'index coverage',
      supportingKeywords: [
        'google search console audit',
        'technical SEO audit',
      ],
    },
  },
  'index-coverage-plan': {
    name: 'Plan Google index monitoring',
    summary:
      'Turn sitemap URLs, Search Console properties, and daily URL Inspection limits into a realistic monitoring cycle.',
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
    alternatives: [
      {
        when: 'You need to collect Google index verdicts now rather than plan future coverage.',
        reportId: 'index-monitor',
        doInstead:
          'Run index monitor after checking the proposed sample and quota. It spends the configured URL Inspection capacity, stores exact provider results locally, and keeps deferred and failed requests separate.',
      },
      {
        when: 'You need to decide whether every sitemap URL deserves indexing.',
        doInstead:
          'No automated report can infer page intent or business value from a sitemap. Review the intended page types and canonical strategy with the people who own the site, then use this plan to create a representative inspection cycle.',
      },
    ],
    seo: {
      primaryKeyword: 'url inspection api',
      supportingKeywords: [
        'google search console url inspection tool',
        'index coverage',
      ],
    },
  },
  'index-monitor': {
    name: 'Collect Google index snapshots',
    summary:
      'Inspect a quota-limited sitemap sample and save Google indexed-state snapshots for later comparison.',
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
    alternatives: [
      {
        when: 'You need to know which inspected URLs regressed or recovered since an earlier snapshot.',
        reportId: 'index-watch',
        doInstead:
          'Run index watch after snapshots exist. It compares compatible URL Inspection fields and separates regressions, recoveries, unchanged results, and provider failures.',
      },
      {
        when: 'You need to diagnose the live technical state of one URL flagged by Google.',
        reportId: 'audit-page',
        doInstead:
          'Audit the live page to add current response, redirect, canonical, robots, metadata, link, and schema evidence. URL Inspection describes Google’s indexed version and can lag the deployed page.',
      },
    ],
    seo: {
      primaryKeyword: 'Google index monitoring',
      supportingKeywords: ['URL inspection monitoring'],
    },
  },
  'index-watch': {
    name: 'Review Google index changes',
    summary:
      'Inspect a limited URL set and separate current index issues, regressions, recoveries, and operational failures.',
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
    alternatives: [
      {
        when: 'You do not yet know which URLs deserve direct inspection.',
        reportId: 'index-coverage',
        doInstead:
          'Run index coverage first. It compares crawl, sitemap, and returned Search Console evidence to build a limited review sample without spending URL Inspection quota on every discovered URL.',
      },
      {
        when: 'You need to decide whether a noindex, canonical, or exclusion is intentional.',
        doInstead:
          'No automated report can recover the site owner’s intent. Compare the page purpose with the canonical and index strategy, then use this report’s exact Google verdict and history to check whether the observed state contradicts that decision.',
      },
    ],
    seo: {
      primaryKeyword: 'google search console url inspection tool',
      supportingKeywords: ['url inspection api', 'index coverage'],
    },
  },
  'internal-links': {
    name: 'Find internal link candidates',
    summary:
      'Find fetched pages with relevant search evidence that do not currently contain a verified contextual link to a chosen target.',
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
    alternatives: [
      {
        when: 'You need a page brief for the target rather than possible source pages.',
        reportId: 'content-optimization',
        doInstead:
          'Run content optimization for the target URL. It adds the live page structure and its returned Search Console queries so you can review topic coverage before adding links.',
      },
      {
        when: 'You need the final anchor text and exact sentence where a link should appear.',
        doInstead:
          'No automated report can choose natural wording without editorial context. Use these candidates to open the source and target pages, then place a descriptive link only where it helps the reader and matches the surrounding copy.',
      },
    ],
    seo: {
      primaryKeyword: 'internal linking SEO',
      supportingKeywords: ['internal links seo', 'seo audit'],
    },
  },
  'link-recovery': {
    name: 'Recover broken URLs with search value',
    summary:
      'Find URLs that still earn returned clicks or impressions but now fail, block access, or redirect poorly.',
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
    alternatives: [
      {
        when: 'You need every redirect hop and the final page controls for one recovery candidate.',
        reportId: 'redirect-trace',
        doInstead:
          'Run redirect trace for that URL. It adds the complete hop sequence plus the final response, canonical, robots directives, and indexability evidence needed to verify a redirect fix.',
      },
      {
        when: 'You need to decide whether an old URL should be restored, redirected, or left gone.',
        doInstead:
          'No automated report can decide relevance, replacement quality, or business intent. Use this report to rank URLs with observed search value, then review the old purpose and the best current destination before choosing a response.',
      },
    ],
    seo: {
      primaryKeyword: 'broken link recovery',
      supportingKeywords: ['technical SEO audit', 'seo audit'],
    },
  },
  'crawl-history': {
    name: 'Find a saved crawl report',
    summary:
      'List local crawl snapshots by site and date so you can choose the right baseline without opening every report.',
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
    alternatives: [
      {
        when: 'You need the pages and issues inside one saved snapshot.',
        reportId: 'crawl-report',
        doInstead:
          'Open the saved crawl report by id. It loads the report summary and lets you request its page or issue detail without fetching the site again.',
      },
      {
        when: 'You need to know what changed between two saved snapshots.',
        reportId: 'compare-crawls',
        doInstead:
          'Compare the chosen crawl reports. It matches compatible page and issue evidence and separates additions, removals, regressions, and recoveries.',
      },
    ],
    seo: {
      primaryKeyword: 'SEO crawl',
      supportingKeywords: ['SEO crawl report'],
    },
  },
  'crawler-rules': {
    name: 'Browse crawler rules',
    summary:
      'See every technical check built into the local crawler and find the right rule for a focused follow-up.',
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
    alternatives: [
      {
        when: 'You need a plain-English explanation and verification steps for one rule.',
        reportId: 'explain-crawl-issue',
        doInstead:
          'Run explain crawl issue with the rule id. It adds the rule meaning, why it may matter, practical fix guidance, and a check you can perform after the change.',
      },
      {
        when: 'You need the URLs currently affected by a rule in a saved crawl.',
        reportId: 'affected-urls',
        doInstead:
          'Run affected URLs with the saved crawl and rule id. It returns the observed page instances, counts, limits, and available search evidence rather than the rule definition alone.',
      },
    ],
    seo: {
      primaryKeyword: 'SEO crawler',
      supportingKeywords: ['SEO crawler tool'],
    },
  },
  'llms-txt-audit': {
    name: 'Audit an llms.txt file',
    summary:
      'Check whether an optional llms.txt file is reachable, readable, and consistent with useful pages from the crawl.',
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
    alternatives: [
      {
        when: 'You need to check the site’s wider crawl, indexability, snippet, and page-structure controls for AI search.',
        reportId: 'ai-readiness',
        doInstead:
          'Run AI readiness on the crawl. It checks the controls and page evidence that apply beyond the optional llms.txt file, while still avoiding unsupported visibility or citation predictions.',
      },
      {
        when: 'You need to know whether llms.txt improved AI citations, rankings, or visibility.',
        doInstead:
          'No automated report can attribute those outcomes to llms.txt. Keep a dated record of the change, review referral and visibility evidence over time, and treat any movement as observational rather than proof that the file caused it.',
      },
    ],
    seo: {
      primaryKeyword: 'llms.txt',
      supportingKeywords: ['what is llms.txt', 'ai search optimization'],
    },
  },
  'generate-llms-txt': {
    name: 'Create an llms.txt draft',
    summary:
      'Build a concise llms.txt draft from selected crawl evidence when someone has decided to maintain the optional file.',
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
    alternatives: [
      {
        when: 'You need to check a published llms.txt file and the pages it links to.',
        reportId: 'llms-txt-audit',
        doInstead:
          'Run the llms.txt audit after publishing. It fetches the live file, parses its entries, checks linked destinations, and compares them with limited crawl candidates.',
      },
      {
        when: 'You need to decide whether the site should publish llms.txt at all.',
        doInstead:
          'No automated report can make that product decision because the format is optional and does not guarantee crawling, citations, or rankings. Review who will maintain the file and whether the intended agent audience benefits from a curated page list; this generator can show the likely draft before you commit.',
      },
    ],
    seo: {
      primaryKeyword: 'llms.txt',
      supportingKeywords: ['generate llms.txt', 'ai search optimization'],
    },
  },
  'measure-change': {
    name: 'Measure an SEO change',
    summary:
      'Compare equal, finalised search windows around a recorded change and see what moved without claiming the change caused it.',
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
        label: 'Optional Google Analytics and control evidence',
        source: 'google-analytics-acquisition',
        role: 'Adds separate post-click or comparison context when configured.',
      },
    ],
    checks: [
      'Builds adjacent equal-length windows from finalised Search Console dates and reports any shortfall in usable days.',
      'Compares the selected scope while keeping absent rows, controls, Google Analytics evidence, and known confounders separate.',
    ],
    returns: [
      'Before and after search metrics, absolute and percentage movement, window coverage, and a cautious verdict.',
      'Optional control and Google Analytics comparisons plus warnings for incomplete data and plausible confounders.',
    ],
    alternatives: [
      {
        when: 'You know total performance moved but need to find the pages, queries, countries, or devices behind it.',
        reportId: 'segment-impact',
        doInstead:
          'Run segment impact across the same comparable periods. It breaks the movement down by the selected Search Console dimension and keeps unmatched or partial rows visible.',
      },
      {
        when: 'You need proof that the recorded change caused the observed movement.',
        doInstead:
          'No automated report can prove causation from a before-and-after comparison, even with a control. Review releases, seasonality, demand, ranking updates, and experimental design; use this report to preserve the measured windows and confounders for that review.',
      },
    ],
    seo: {
      primaryKeyword: 'seo testing',
      supportingKeywords: ['seo report', 'google search console seo'],
    },
  },
  'monthly-report': {
    name: 'Monthly SEO report',
    summary:
      'Turn one calendar month of finalised search data into a clear report with changes, opportunities, gaps, and follow-up work.',
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
      'Structured JSON with exact dates, source details, returned rows, skipped work, and focused next actions.',
    ],
    alternatives: [
      {
        when: 'You need a current technical inventory rather than a monthly Search Console summary.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl to add current response, redirect, canonical, robots, metadata, link, and structured-data evidence. The monthly report does not crawl the whole site.',
      },
      {
        when: 'You need to explain why search performance changed during the month.',
        doInstead:
          'No automated report can assign a cause from monthly totals. Use this report to identify the movement and next evidence to inspect, then review releases, page changes, demand, competitor activity, and confirmed Google updates before drawing a conclusion.',
      },
    ],
    seo: {
      primaryKeyword: 'monthly SEO report',
      supportingKeywords: ['seo report', 'google analytics seo report'],
    },
  },
  'okf-build': {
    name: 'Build site knowledge for agents',
    summary:
      'Turn a saved crawl into a compact OKF knowledge pack with source pages an agent can inspect and verify locally.',
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
    alternatives: [
      {
        when: 'You need to check an edited or generated OKF file set for broken structure and references.',
        reportId: 'okf-validate',
        doInstead:
          'Run OKF validation on the exact files. It checks supported frontmatter, paths, headings, links, citations, and manifest references without rebuilding the pack.',
      },
      {
        when: 'You need to prove that every statement in the knowledge pack is current and correct.',
        doInstead:
          'No automated report can verify the truth of every extracted statement. Use this build to retain source-page references, then have a person compare important claims with the current live pages and the intended site meaning.',
      },
    ],
    seo: {
      primaryKeyword: 'OKF export',
      supportingKeywords: ['site knowledge', 'ai search optimization'],
    },
  },
  'okf-validate': {
    name: 'Validate an OKF knowledge pack',
    summary:
      'Check OKF files for structural, path, link, citation, and manifest problems before an agent or automation relies on them.',
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
    alternatives: [
      {
        when: 'You need to rebuild the knowledge pack from a current saved crawl.',
        reportId: 'okf-build',
        doInstead:
          'Run OKF build with the current crawl and explicit file limits. It regenerates the manifest, concepts, source references, and optional Markdown files before validation.',
      },
      {
        when: 'You need to know whether the content inside valid files is accurate, complete, or still current.',
        doInstead:
          'No automated report can establish factual accuracy from file structure. Follow the citations to the current source pages and review the claims manually; this validator can still identify broken references that would prevent that review.',
      },
    ],
    seo: {
      primaryKeyword: 'open knowledge format',
      supportingKeywords: ['file validation'],
    },
  },
  'page-opportunities': {
    name: 'Find opportunities for one page',
    summary:
      'See which returned search queries are already associated with one URL and what deserves a closer look on the live page.',
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
    alternatives: [
      {
        when: 'You need a detailed content brief for the selected page.',
        reportId: 'content-optimization',
        doInstead:
          'Run content optimization for the URL. It combines its returned Search Console queries with the fetched title, headings, content, and technical conflicts to produce a reviewable brief.',
      },
      {
        when: 'You suspect several URLs may be sharing the same query demand.',
        reportId: 'cannibalisation',
        doInstead:
          'Run cannibalisation across the property. It shows queries associated with multiple URLs so you can compare intent, canonicals, and live-page evidence before deciding whether the overlap is harmful.',
      },
    ],
    seo: {
      primaryKeyword: 'page SEO',
      supportingKeywords: ['seo page audit', 'google search console seo'],
    },
  },
  'performance-audit': {
    name: 'Audit page performance',
    summary:
      'Combine a local Lighthouse test with available CrUX field data and see where a page is slow without mixing lab and real-user evidence.',
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
    alternatives: [
      {
        when: 'You need technical SEO evidence beyond loading performance for this URL.',
        reportId: 'audit-page',
        doInstead:
          'Audit the page to add redirects, canonicals, directives, metadata, headings, links, schema, and content evidence. Lighthouse and CrUX do not answer those questions.',
      },
      {
        when: 'You need to conclude that one Lighthouse run represents every page using the same template.',
        doInstead:
          'No automated report can generalise one lab run to a whole template. Select representative URLs across device, traffic, content, and template states, run the audit for each, and compare available URL-level or origin-level CrUX coverage separately.',
      },
    ],
    seo: {
      primaryKeyword: 'core web vitals report',
      supportingKeywords: ['lighthouse audit', 'page speed audit'],
    },
  },
  'pseo-audit': {
    name: 'Audit programmatic SEO templates',
    summary:
      'Review repeated page families with search demand, limited crawl samples, and optional Google index evidence kept separate.',
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
    alternatives: [
      {
        when: 'You want a definitive quality verdict from word count or one sampled URL.',
        doInstead:
          'No report should condemn a template from word count or one sampled URL. Use the pSEO audit to select representative pages and compare template, crawl, Search Console, and optional URL Inspection evidence. Then manually review whether those pages satisfy their search intent, provide distinct value, and deserve to exist.',
      },
      {
        when: 'You need Google’s current indexed verdict for one representative template URL.',
        reportId: 'index-watch',
        doInstead:
          'Run index watch for the selected URL. It adds a direct URL Inspection result and any compatible local history, while keeping that single-page evidence separate from claims about the full template.',
      },
    ],
    seo: {
      primaryKeyword: 'programmatic SEO',
      supportingKeywords: ['pseo', 'programmatic seo tools'],
    },
  },
  'query-clusters': {
    name: 'Group related search queries',
    summary:
      'Turn a large returned Search Console query set into reproducible groups that are easier to review for shared demand.',
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
    alternatives: [
      {
        when: 'You need to understand the opportunities and live content for one page rather than group query wording.',
        reportId: 'page-opportunities',
        doInstead:
          'Run page opportunities for the URL. It adds exact-page Search Console rows and optional live-page verification instead of grouping property-wide query text.',
      },
      {
        when: 'You need a final information architecture or a definitive judgment that grouped queries share the same search intent.',
        doInstead:
          'No automated report can settle intent from token overlap alone. Review the cluster members, current search results, existing pages, and user task manually; use these repeatable groups to reduce the query set you need to inspect.',
      },
    ],
    seo: {
      primaryKeyword: 'search query clustering',
      supportingKeywords: ['google search console keywords', 'query clusters'],
    },
  },
}
