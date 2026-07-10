import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesQZ: Partial<
  Record<string, ReportGuideOverride>
> = {
  'quick-wins': {
    name: 'Find quick-win opportunities',
    summary:
      'Find visible queries and pages whose CTR trails a site-aware target, then verify the result before changing titles or snippets.',
    lead: 'This report narrows a large Search Console export to plausible CTR opportunities. It gives you a review queue, not a promise that a title edit will create more clicks.',
    inputs: [
      {
        label: 'Returned Search Console query and page rows',
        source: 'search-analytics',
        role: 'Provides impressions, clicks, CTR, and average position for the selected finalised window.',
      },
      {
        label: 'Optional live-page checks',
        role: 'Fetches a limited number of candidate pages for title, snippet, content, and technical context.',
      },
    ],
    checks: [
      'Finds eligible rows in the documented position range and compares CTR with the site-aware heuristic target.',
      'Applies brand filters, stable ranking, row limits, and optional page verification before suggesting an investigation.',
    ],
    returns: [
      'A ranked review queue with query, page, impressions, clicks, CTR, average position, target, and estimated shortfall.',
      'Optional page observations plus caveats that keep the CTR target and click shortfall labelled as prioritisation heuristics.',
    ],
    seo: {
      title:
        'SEO Quick Wins: Find Page-One CTR Opportunities in Search Console',
      description:
        'Find page-one Search Console queries with weak CTR evidence, review the live page, and investigate titles or snippets without promising extra clicks.',
      heading: 'Find page-one searches that deserve a closer CTR review',
    },
  },
  'redirect-trace': {
    name: 'Trace a redirect chain',
    summary:
      'Follow every hop from one URL to its final page and catch loops, long chains, broken destinations, or conflicting index signals.',
    lead: 'Use this before changing an old URL, debugging a migration, or checking where an important link lands. The report follows the chain and then inspects the final page it can reach.',
    inputs: [
      {
        label: 'Live URL responses',
        source: 'redirects',
        role: 'Provides each status, location header, hop, final URL, and transport failure.',
      },
      {
        label: 'Final page evidence',
        source: 'canonical',
        role: 'Adds the final response, canonical, robots directives, title, and content type.',
      },
    ],
    checks: [
      'Follows redirects up to the explicit hop limit and records loops, invalid locations, failures, and the final destination.',
      'Checks whether the final page is successful, indexable, and canonical to the intended URL based on observed evidence.',
    ],
    returns: [
      'A hop-by-hop redirect chain with status codes, destinations, timing, and failure details.',
      'Final-page extraction and focused findings for long chains, loops, broken endpoints, directives, and canonicals.',
    ],
    seo: {
      title: 'Redirect Trace: Follow Every Hop and Check the Final Page',
      description:
        'Trace every redirect hop, find loops and broken destinations, then check the final page status, canonical, robots directives, and indexability.',
      heading: 'Follow a redirect chain and inspect where it ends',
    },
  },
  'narrative-report': {
    name: 'Create a client-ready SEO narrative',
    summary:
      'Turn structured diagnosis, change, and monitoring results into a clear stakeholder report without dropping data gaps or caveats.',
    lead: 'Use this after the underlying reports have done the analysis. It gives clients and teammates a readable explanation while the structured JSON remains the evidence contract.',
    inputs: [
      {
        label: 'Property diagnosis results',
        source: 'search-analytics',
        role: 'Provides supported movement, segments, decay, overlap, and opportunity evidence.',
      },
      {
        label: 'Saved change and monitoring results',
        role: 'Adds measured changes, technical monitoring, skipped sections, and source caveats when available.',
      },
    ],
    checks: [
      'Assembles structured findings in a stable order without generating explanations that are absent from the source reports.',
      'Carries source status, skipped work, failed measurements, warnings, and caveats into the narrative.',
    ],
    returns: [
      'A client-ready Markdown narrative with a headline, supported findings, priorities, and next actions.',
      'Structured sections and source details that let an agent trace every statement back to the underlying report evidence.',
    ],
    seo: {
      title: 'SEO Narrative Report: Turn Evidence Into Client Updates',
      description:
        'Create a client-ready SEO narrative from diagnosis, measured changes, and monitoring evidence while preserving skipped work, warnings, and caveats.',
      heading: 'Turn structured SEO evidence into a report people can read',
    },
  },
  'second-page': {
    name: 'Find second-page opportunities',
    summary:
      'Find visible URLs averaging positions above 10 through 20 and build a compact page-level queue for closer review.',
    lead: 'Use this when you want page-oriented opportunities just beyond the first results page. Average position is an aggregate filter, so each URL still needs intent, SERP, content, link, and technical review.',
    inputs: [
      {
        label: 'Returned Search Console page and query rows',
        source: 'search-analytics',
        role: 'Provides impressions, clicks, CTR, and average position for the selected finalised window.',
      },
      {
        label: 'Optional live-page verification',
        role: 'Checks a limited number of candidate pages before returning investigation prompts.',
      },
    ],
    checks: [
      'Filters the documented average-position range and applies minimum evidence, brand, and output limits.',
      'Ranks URLs consistently and keeps failed or skipped page verification visible.',
    ],
    returns: [
      'A page-oriented opportunity list with the supporting queries, metrics, position range, and source status.',
      'Evidence-grounded prompts for SERP, intent, content, internal-link, and technical review, with no ranking forecast.',
    ],
    seo: {
      title: 'Second-Page SEO Opportunities: Find URLs Worth Reviewing',
      description:
        'Find Search Console URLs averaging positions 11 to 20, inspect their supporting queries and metrics, and build a grounded page review queue.',
      heading: 'Find pages sitting just beyond the first search results',
    },
  },
  'segment-impact': {
    name: 'Find which search segments moved',
    summary:
      'Compare matched periods by page, query, country, or device and see where returned Search Console evidence changed.',
    lead: 'Use segment impact after a property-level movement needs narrowing down. It keeps unmatched rows separate, so a missing returned row is never silently counted as zero.',
    inputs: [
      {
        label: 'Matched Search Console periods',
        source: 'search-analytics',
        role: 'Provides returned rows for the chosen page, query, country, or device dimension.',
      },
      {
        label: 'Dimension and row limits',
        role: 'Define which segment to compare and how many matched or unmatched rows to retain.',
      },
    ],
    checks: [
      'Builds adjacent equal-length finalised periods for the selected dimension.',
      'Aggregates duplicates consistently and separates matched, new-only, missing-only, partial, and truncated rows.',
    ],
    returns: [
      'Largest supported gains and declines with clicks, impressions, CTR, position, and absolute movement.',
      'Separate unmatched-row evidence, source completeness, limits, warnings, and a verdict for the selected segment.',
    ],
    seo: {
      title: 'SEO Segment Impact: Find Which Pages and Queries Moved in GSC',
      description:
        'Compare Search Console movement by page, query, country, or device across matched periods while keeping missing, unmatched, and partial rows honest.',
      heading: 'Find the pages, queries, countries, or devices that moved',
    },
  },
  'striking-distance': {
    name: 'Find striking-distance opportunities',
    summary:
      'Find returned query and page combinations averaging positions 11 to 20 and group them into a limited investigation queue.',
    lead: 'This report keeps the query and page pairing intact, which helps when several searches point to the same template or topic. Position 11 to 20 is a filter, not a promise that a small edit will reach page one.',
    inputs: [
      {
        label: 'Returned Search Console query and page rows',
        source: 'search-analytics',
        role: 'Provides impressions, clicks, CTR, and average position for exact query and URL pairs.',
      },
      {
        label: 'Optional page content verification',
        role: 'Checks a limited number of candidate pages for technical conflicts and query coverage evidence.',
      },
    ],
    checks: [
      'Filters query and page pairs by the documented position, impression, brand, and output bounds.',
      'Ranks rows consistently, groups repeated URL patterns, and records each verification outcome separately.',
    ],
    returns: [
      'A query-level opportunity list with metrics, recommendations, verification state, and selection source details.',
      'Pattern groups and sample URLs that help spot repeated opportunities without assuming one fix suits every page.',
    ],
    seo: {
      title: 'Striking-Distance SEO: Find Queries Near Page One in GSC Data',
      description:
        'Find Search Console query and page pairs averaging positions 11 to 20, verify selected pages, and group repeated opportunities for review with full evidence.',
      heading: 'Find query and page pairs sitting just beyond page one',
    },
  },
  'seo-to-ai-query': {
    name: 'Turn search queries into AI monitoring prompts',
    summary:
      'Create a stable prompt set from real Search Console query wording for separate, repeatable AI answer monitoring.',
    lead: 'Use this to seed an AI monitoring corpus from searches already associated with the site. The prompts are repeatable suggestions, not evidence that people ask them in AI products.',
    inputs: [
      {
        label: 'Returned Search Console queries',
        source: 'search-analytics',
        role: 'Provides the source wording, impressions, dates, and property scope behind each prompt.',
      },
      {
        label: 'Prompt and source row limits',
        role: 'Bound the eligible query set and final monitoring corpus.',
      },
    ],
    checks: [
      'Filters eligible source queries with explicit impression and row limits.',
      'Applies stable prompt templates and preserves the source query, metrics, date range, and completeness beside each result.',
    ],
    returns: [
      'A repeatable prompt seed set with its source queries, metrics, templates, and stable ordering.',
      'Selection source details and caveats that stop generated prompts being mistaken for AI demand, citations, or traffic forecasts.',
    ],
    seo: {
      title: 'AI Monitoring Prompts From Real Search Console Query Data',
      description:
        'Turn returned Search Console query wording into a repeatable AI monitoring prompt set while keeping every source query, date, limit, and caveat attached.',
      heading:
        'Build AI monitoring prompts from searches your site already sees',
    },
  },
  'top-fixes': {
    name: 'Prioritise technical SEO fixes',
    summary:
      'Reduce a large crawl to a short fix queue using severity, affected URLs, joined search evidence, analytics, and estimated effort.',
    lead: 'Use this after a crawl produces more findings than you can tackle at once. Every ranked item keeps its scoring factors, rule guidance, affected count, and verification step visible.',
    inputs: [
      {
        label: 'Saved or fresh crawl findings',
        role: 'Provides issue instances, affected pages, rule severity, and technical evidence.',
      },
      {
        label: 'Joined Search Console and GA4 page metrics',
        source: 'search-analytics',
        role: 'Adds available search visibility, sessions, users, and conversions for affected pages.',
      },
    ],
    checks: [
      'Groups eligible findings by rule and calculates a repeatable score from severity, affected count, available first-party value, and estimated effort.',
      'Attaches the exact score factors, rule explanation, fix guidance, and a repeatable verification command.',
    ],
    returns: [
      'A limited technical fix queue with score, severity, affected count, sample URLs, effort, and first-party evidence.',
      'Plain-language reasons for the order plus how to fix and verify each selected rule.',
    ],
    seo: {
      title: 'Technical SEO Priorities: Rank Crawl Fixes With Evidence',
      description:
        'Rank technical SEO fixes from a crawl using severity, affected URLs, available search and analytics evidence, effort, and clear verification steps.',
      heading: 'Turn a crawl into a technical fix queue you can act on',
    },
  },
  'traffic-anomaly': {
    name: 'Detect unusual search traffic changes',
    summary:
      'Compare recent Search Console movement with the property history and flag changes that deserve a closer investigation.',
    lead: 'Run this when clicks or impressions seem to have moved unexpectedly. It identifies statistically unusual changes, then leaves the cause open for segment, update, technical, and demand checks.',
    inputs: [
      {
        label: 'Finalised Search Console property totals',
        source: 'search-analytics',
        role: 'Provides the historical baseline and recent comparison window for clicks and impressions.',
      },
      {
        label: 'Official Google ranking update dates',
        source: 'google-updates',
        role: 'Adds confirmed update context without assigning causation.',
      },
    ],
    checks: [
      'Builds finalised baseline and recent windows from the shared Search Console date helper.',
      'Calculates unusual movement against the property history and records significance, direction, update overlap, and data status.',
    ],
    returns: [
      'Recent click and impression anomalies with baseline values, observed movement, significance, and date windows.',
      'Official update overlap, source source details, caveats, and focused investigations for significant changes.',
    ],
    seo: {
      title: 'SEO Traffic Anomaly Detection: Find Unusual Search Changes',
      description:
        'Detect unusual Search Console click and impression changes against the property history, then inspect dates, significance, and official update context.',
      heading: 'Find unusual changes in Search Console traffic',
    },
  },
  'update-correlation': {
    name: 'Compare traffic changes with Google updates',
    summary:
      'Place unusual Search Console movement beside confirmed Google ranking update windows without claiming the update caused it.',
    lead: 'Use this when a property movement overlaps talk of a Google update. The report checks official dates and the observed anomaly window, then points to the segments and pages that need real investigation.',
    inputs: [
      {
        label: 'Search Console traffic anomaly result',
        source: 'search-analytics',
        role: 'Provides the observed movement, baseline, recent window, and significance evidence.',
      },
      {
        label: 'Official Google ranking update windows',
        source: 'google-updates',
        role: 'Provides confirmed rollout dates from Google Search Status.',
      },
    ],
    checks: [
      'Matches the observed anomaly window against confirmed ranking update dates with an explicit padding period.',
      'Classifies the timing overlap while keeping unrelated releases, demand changes, and other confounders unresolved.',
    ],
    returns: [
      'A timing classification with the anomaly dates, matching official updates, padding, and source status.',
      'Caveats and next investigations for segments, templates, and representative pages, with no causal verdict.',
    ],
    seo: {
      title: 'Google Update Correlation: Compare Dates With SEO Traffic',
      description:
        'Compare unusual Search Console traffic dates with confirmed Google ranking update windows and investigate overlap without treating timing as causation.',
      heading: 'Check whether search changes overlap a confirmed Google update',
    },
  },
  'search-performance-overview': {
    name: 'Find what changed in Google Search',
    summary:
      'See where clicks and impressions changed, which pages or queries account for the movement, and what to inspect next.',
    lead: 'Use this first when clicks or impressions changed and you do not yet know where the movement came from. It shows which pages, queries, countries, and devices account for the change, then points you to the next focused report worth running.',
    inputs: [
      {
        label: 'Search Console performance data',
        source: 'search-analytics',
        role: 'Provides anomaly, segment, decay, overlap, visibility, and opportunity sections.',
      },
      {
        label: 'Official Google update windows',
        source: 'google-updates',
        role: 'Adds confirmed timing context when the provider data is available.',
      },
    ],
    checks: [
      'Compares recent search performance with earlier data and shows whether the movement is unusual for this site.',
      'Finds the pages, queries, countries, and devices behind the change, then checks for declines, overlap, weak CTR, and near-page-one visibility.',
    ],
    returns: [
      'A readable overview of the strongest search movements, affected segments, declines, overlap, and opportunities.',
      'A short list of the next reports worth running, with the evidence that made each one relevant.',
    ],
    seo: {
      title: 'Search Performance Overview: Find What Changed and Where',
      description:
        'Find where Google Search clicks and impressions changed, see which pages or queries explain the movement, and choose the next useful SEO report.',
      heading: 'Find what changed in Google Search and where to look next',
    },
  },
  'monthly-action-plan': {
    name: 'Create a monthly report and action plan',
    summary:
      'Produce the shared monthly SEO report and finish with a short list of evidence-backed follow-up work.',
    lead: 'Use this when an agent needs to move from monthly reporting into action. The workflow keeps the report intact, then chooses a limited set of next checks from its actual findings.',
    inputs: [
      {
        label: 'Finalised monthly Search Console evidence',
        source: 'search-analytics',
        role: 'Provides the calendar-month report, comparison evidence, opportunities, and caveats.',
      },
      {
        label: 'Workflow limits and brand settings',
        role: 'Bound the detail and keep branded searches included or excluded consistently.',
      },
    ],
    checks: [
      'Runs the same monthly report contract used by the direct report surface.',
      'Builds follow-up actions only from supported report sections and preserves partial or unavailable states.',
    ],
    returns: [
      'The complete monthly SEO report with dates, comparisons, source coverage, findings, and caveats.',
      'A short action list and next report commands selected from the month’s supported evidence.',
    ],
    seo: {
      title: 'Monthly SEO Workflow: Report Results and Plan Next Actions',
      description:
        'Create a monthly SEO report from finalised Search Console evidence, then give an AI agent a limited action plan based only on supported findings.',
      heading: 'Create a monthly SEO report with a practical action plan',
    },
  },
  'refresh-priorities': {
    name: 'Build a content refresh priority list',
    summary:
      'Combine decay, near-page-one visibility, CTR, query overlap, and diagnosis evidence into one review queue.',
    lead: 'Use this when a content team needs to decide which existing pages deserve attention first. The queue ranks supported signals, then leaves the final edit decision to a live-page review.',
    inputs: [
      {
        label: 'Search Console diagnosis and opportunity reports',
        source: 'search-analytics',
        role: 'Provides decay, position, CTR, query overlap, and property movement evidence with shared source details.',
      },
      {
        label: 'Optional live-page verification',
        role: 'Checks a limited number of candidates before the workflow recommends deeper investigation.',
      },
    ],
    checks: [
      'Normalises eligible candidates from each source report without counting shared underlying rows as independent proof.',
      'Ranks a limited queue consistently and keeps source report, verification, caveats, and score factors attached.',
    ],
    returns: [
      'A practical page review queue with the supporting signal, source report, confidence, and recommended investigation.',
      'Structured source details and caveats that stop priority scores becoming traffic forecasts or automatic rewrite orders.',
    ],
    seo: {
      title: 'SEO Content Refresh Priorities: Build an Evidence-Led Queue',
      description:
        'Combine decay, position, CTR, query overlap, and diagnosis evidence into a content refresh queue without relying on age, word count, or traffic forecasts.',
      heading: 'Choose which existing pages deserve a closer review first',
    },
  },
  'technical-watch': {
    name: 'Monitor technical and index changes',
    summary:
      'Run crawl-change and Google index monitoring together and separate live regressions from snapshot or provider changes.',
    lead: 'Use this for a repeatable technical check after the first baseline exists. It combines limited crawl evidence with sampled URL Inspection and keeps failures in either source visible.',
    inputs: [
      {
        label: 'Current and previous limited crawl evidence',
        role: 'Provides live technical and page changes for the selected same-origin scope.',
      },
      {
        label: 'Sitemap inventory and URL Inspection snapshots',
        source: 'url-inspection',
        role: 'Provides a quota-limited sample of Google indexed-state evidence and prior snapshots.',
      },
      {
        label: 'Optional link-recovery evidence',
        source: 'search-analytics',
        role: 'Adds broken or poorly redirected URLs that retain search value.',
      },
    ],
    checks: [
      'Runs crawl and index monitoring independently so one unavailable source does not erase valid evidence from the other.',
      'Separates live page regressions, indexed-snapshot changes, recoveries, quota blocks, fetch failures, and intentional controls.',
    ],
    returns: [
      'A combined technical monitoring report with crawl changes, index changes, operational failures, and source-specific caveats.',
      'A limited follow-up plan for representative regressions, link recovery, and the next comparable run.',
    ],
    seo: {
      title: 'Technical SEO Monitoring: Track Crawl and Index Changes',
      description:
        'Track technical crawl changes and sampled Google index snapshots together, while keeping live regressions, quota limits, and provider failures separate.',
      heading: 'Monitor technical regressions and Google index changes',
    },
  },
  'update-postmortem': {
    name: 'Review a Google update impact',
    summary:
      'Inspect winners, losers, page evidence, and known site changes around a confirmed Google ranking update window.',
    lead: 'Use this when meaningful property movement overlaps a confirmed Google update. It looks for repeated patterns and keeps migrations, releases, tracking changes, demand, and seasonality in the investigation.',
    inputs: [
      {
        label: 'Official Google ranking update dates',
        source: 'google-updates',
        role: 'Defines the confirmed rollout window used for the analysis.',
      },
      {
        label: 'Search Console winner and loser evidence',
        source: 'search-analytics',
        role: 'Provides matched movement by page, query, device, country, and repeated template patterns.',
      },
      {
        label: 'Known site changes and optional page checks',
        role: 'Keeps launches, migrations, change-log entries, and representative live-page evidence visible as confounders.',
      },
    ],
    checks: [
      'Anchors matched comparisons to the confirmed update window and identifies supported winner and loser patterns.',
      'Preserves supplied and observed confounders, page verification, source limits, and incomplete segments before suggesting action.',
    ],
    returns: [
      'A postmortem with confirmed dates, property movement, segment winners and losers, template patterns, and representative pages.',
      'Known confounders, source caveats, and limited investigations with no claim that the update caused a specific movement.',
    ],
    seo: {
      title:
        'Google Update Impact: Find SEO Winners and Losers in Search Console',
      description:
        'Review SEO winners and losers around a confirmed Google update, inspect page and segment evidence, and keep migrations, releases, and other causes visible.',
      heading: 'Review SEO winners and losers around a confirmed Google update',
    },
  },
}
