import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesQZ: Partial<
  Record<string, ReportGuideOverride>
> = {
  'quick-wins': {
    name: 'Find SEO quick wins',
    summary:
      'Find page-one rankings with weak CTR where title or snippet work may earn more clicks.',
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
      'Finds query and page rows with strong average positions and enough impressions to review.',
      "Compares CTR with the site's own position-aware heuristic benchmark.",
      'Filters branded searches by default, ranks rows consistently, and verifies selected pages when requested.',
    ],
    returns: [
      'A ranked query and page list with impressions, clicks, CTR, average position, benchmark, and estimated click shortfall.',
      'Page evidence and practical title, snippet, or SERP framing checks for selected rows.',
      'Clear caveats that label the CTR benchmark and click shortfall as prioritisation heuristics.',
    ],
    alternatives: [
      {
        when: 'You want pages averaging positions 11 to 20 rather than page-one rows with weak CTR.',
        reportId: 'second-page',
        doInstead:
          'Run second page. It returns a page-oriented queue with the queries, impressions, clicks, CTR, and average position behind each candidate, while keeping the position range as a review filter rather than a ranking forecast.',
      },
      {
        when: 'You need to know whether changing a title or snippet will definitely increase clicks.',
        doInstead:
          'No automated report can decide that in advance. Review the live result page, query intent, competing snippets, and the page itself, then record the change and measure a complete later period. Quick wins can still select the strongest rows for that review.',
      },
    ],
    seo: {
      primaryKeyword: 'seo quick wins',
      supportingKeywords: ['ctr optimization', 'google search console seo'],
    },
  },
  'redirect-trace': {
    name: 'Trace a redirect chain',
    summary:
      'Follow every hop from one URL to its final page and catch loops, long chains, broken destinations, or conflicting index signals.',
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
    alternatives: [
      {
        when: 'You need to find broken or unsuitable destinations across search-visible URLs, not trace one known URL.',
        reportId: 'link-recovery',
        doInstead:
          'Run link recovery. It joins returned Search Console page metrics to fresh response and redirect evidence, then prioritises broken or poorly redirected URLs that still show search value.',
      },
      {
        when: 'You need to decide which destination is genuinely equivalent to the old page.',
        doInstead:
          'No automated report can make that content and business decision. Compare the old purpose, user intent, content, and destination manually. Redirect trace can confirm how each candidate currently resolves, but it cannot prove topical equivalence.',
      },
    ],
    seo: {
      primaryKeyword: 'redirect trace',
      supportingKeywords: ['seo audit', 'technical SEO audit'],
    },
  },
  'narrative-report': {
    name: 'Explain crawl findings clearly',
    summary:
      'Turn crawl and search evidence into a short report that explains what matters and what to do next.',
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
    alternatives: [
      {
        when: 'You need to discover what changed in Search Console rather than explain reports that already exist.',
        reportId: 'search-performance-overview',
        doInstead:
          'Run the search performance overview first. It compares recent and earlier evidence, narrows movement by page, query, country, and device, and recommends focused follow-ups. Narrative report cannot create source evidence that was never collected.',
      },
      {
        when: 'You need a factual explanation for why traffic or rankings changed.',
        doInstead:
          'No automated report can prove the cause from a narrative. Review the underlying reports, known releases, tracking changes, demand, seasonality, and representative pages. Use the narrative only to communicate the conclusions that evidence supports.',
      },
    ],
    seo: {
      primaryKeyword: 'seo report',
      supportingKeywords: ['seo audit report', 'technical SEO audit'],
    },
  },
  'second-page': {
    name: 'Find pages close to page one',
    summary:
      'Find URLs ranking around positions 11 to 20 and decide which pages deserve closer review.',
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
      'Finds primary query and page combinations in the documented position range.',
      'Compares impressions, clicks, CTR, average position, and supporting queries for each URL.',
      'Ranks URLs consistently and keeps failed or skipped page verification visible.',
    ],
    returns: [
      'A page-oriented opportunity list with the supporting queries, metrics, position range, and source status.',
      'Evidence-grounded prompts for SERP, intent, content, internal-link, and technical review, with no ranking forecast.',
    ],
    alternatives: [
      {
        when: 'You want repeated query and URL patterns grouped into shared actions rather than a flat page list.',
        reportId: 'striking-distance',
        doInstead:
          'Run striking distance. It keeps query and page pairs together, groups repeated patterns, and separates content, snippet, internal-link, and technical investigations across the selected rows.',
      },
      {
        when: 'You need to know whether a specific page should be rewritten.',
        reportId: 'audit-page',
        doInstead:
          'Audit that page first. It adds a fresh fetch, technical controls, metadata, headings, schema, links, and available Search Console query evidence. The second-page position filter alone cannot justify a rewrite.',
      },
    ],
    seo: {
      primaryKeyword: 'second page SEO',
      supportingKeywords: ['striking distance SEO', 'search console queries'],
    },
  },
  'segment-impact': {
    name: 'Find which search segments moved',
    summary:
      'Compare Search Console movement by page, query, country, or device.',
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
      'Compares clicks, impressions, CTR, and average position for the chosen segment.',
      'Aggregates duplicates consistently and separates matched, new-only, missing-only, partial, and truncated rows.',
    ],
    returns: [
      'Largest supported gains and declines with clicks, impressions, CTR, position, and absolute movement.',
      'Separate unmatched-row evidence, source completeness, limits, warnings, and a verdict for the selected segment.',
    ],
    alternatives: [
      {
        when: 'You do not yet know which dimension or focused investigation to start with.',
        reportId: 'search-performance-overview',
        doInstead:
          'Run the search performance overview. It checks the strongest available movements across pages, queries, countries, and devices, then points to the focused report supported by the returned evidence.',
      },
      {
        when: 'You need to prove why one segment gained or lost traffic.',
        doInstead:
          'No automated report can isolate the cause from Search Console movement alone. Check releases, tracking, seasonality, demand, search-result changes, and representative pages. Segment impact can identify where to investigate and provide the matched dates and rows.',
      },
    ],
    seo: {
      primaryKeyword: 'google search console seo',
      supportingKeywords: ['seo report', 'search console queries'],
    },
  },
  'striking-distance': {
    name: 'Find striking-distance opportunities',
    summary:
      'Group position 11 to 20 Search Console queries into practical actions.',
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
      'Finds query and page pairs in the documented position range with enough impressions to review.',
      'Checks CTR, query themes, URL templates, and repeated patterns across the selected rows.',
      'Ranks rows consistently and records each optional page verification outcome separately.',
    ],
    returns: [
      'Grouped actions with representative query and page rows, metrics, and verification state.',
      'The evidence behind each content, snippet, internal-link, or technical investigation.',
      'Pattern groups and sample URLs without assuming one fix suits every page.',
    ],
    alternatives: [
      {
        when: 'You want a compact list of individual URLs rather than grouped query and template patterns.',
        reportId: 'second-page',
        doInstead:
          'Run second page. It assigns supporting query evidence to a page-oriented queue, which is easier when each URL needs its own owner or review rather than one shared template action.',
      },
      {
        when: 'You need to decide the exact edit for one candidate page.',
        reportId: 'content-optimization',
        doInstead:
          'Run content optimization for that URL. It adds the live page structure and its returned Search Console query evidence to build a focused brief. Striking distance only identifies and groups plausible opportunities.',
      },
    ],
    seo: {
      primaryKeyword: 'striking distance SEO',
      supportingKeywords: ['second page SEO', 'search console queries'],
    },
  },
  'seo-to-ai-query': {
    name: 'Turn SEO queries into AI prompts',
    summary:
      'Turn real Search Console queries into prompts for repeatable AI answer monitoring.',
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
      'Finds source queries with enough impressions to meet the configured threshold.',
      'Identifies question, comparison, local, and decision-making intent where the wording supports it.',
      'Applies stable prompt templates and preserves the source query, metrics, date range, and completeness beside each result.',
    ],
    returns: [
      'A repeatable prompt seed set with its source queries, metrics, templates, and stable ordering.',
      'Selection source details and caveats that stop generated prompts being mistaken for AI demand, citations, or traffic forecasts.',
    ],
    alternatives: [
      {
        when: 'You want to know whether AI assistants already send visits recorded by your analytics property.',
        reportId: 'ai-referrals',
        doInstead:
          'Run AI referrals. It reads captured Google Analytics referral traffic and reports the sources, landing pages, sessions, and available engagement evidence. Generated monitoring prompts contain no referral or visit data.',
      },
      {
        when: 'You need to know whether an assistant currently mentions, cites, or recommends the site for a prompt.',
        doInstead:
          'No automated report in this package tests live assistant answers. Run the generated prompt set against the chosen assistants under a documented location, account, model, and date, then save the responses for comparison. This report supplies repeatable prompts and their Search Console source evidence.',
      },
    ],
    seo: {
      primaryKeyword: 'ai search optimization',
      supportingKeywords: ['search console queries', 'ai search readiness'],
    },
  },
  'top-fixes': {
    name: 'Fix the most important technical SEO issues',
    summary:
      'Turn a long crawl report into a short list of technical SEO fixes ranked by evidence, reach, and effort.',
    inputs: [
      {
        label: 'Saved or fresh crawl findings',
        role: 'Provides issue instances, affected pages, rule severity, and technical evidence.',
      },
      {
        label: 'Joined Search Console and Google Analytics page metrics',
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
    alternatives: [
      {
        when: 'You need every URL affected by one known crawl rule rather than a ranked list of issue groups.',
        reportId: 'affected-urls',
        doInstead:
          'Run affected URLs with the saved crawl and rule id. It returns the matching URL inventory and issue evidence for that rule, which is the right input for estimating scope and planning a template-level fix.',
      },
      {
        when: 'You need to confirm that a release fixed the selected technical issue.',
        reportId: 'crawl-diff',
        doInstead:
          'Run a comparable crawl diff after the release. It separates new, resolved, and persistent findings while keeping fetch and scope changes visible. A priority score cannot verify implementation.',
      },
    ],
    seo: {
      primaryKeyword: 'technical SEO issues',
      supportingKeywords: ['technical SEO fixes'],
    },
  },
  'traffic-anomaly': {
    name: 'Investigate an organic traffic drop',
    summary:
      'Compare recent Search Console clicks and impressions with the site history to find unusual changes.',
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
      'Official update overlap, source details, caveats, and focused investigations for significant changes.',
    ],
    alternatives: [
      {
        when: 'You already know there was a change and need to find which pages, queries, countries, or devices account for it.',
        reportId: 'segment-impact',
        doInstead:
          'Run segment impact for the relevant dimension. It compares matched periods and returns supported gains, declines, and unmatched rows, so the investigation moves from a property total to the affected segment.',
      },
      {
        when: 'You need to prove what caused the organic traffic drop.',
        doInstead:
          'No automated report can isolate causation from Search Console history. Review tracking changes, releases, crawl evidence, demand, seasonality, and search-result changes across the same dates. Traffic anomaly can establish whether and when the movement was unusual.',
      },
    ],
    seo: {
      primaryKeyword: 'organic traffic drop',
    },
  },
  'update-correlation': {
    name: 'Check traffic changes against Google updates',
    summary:
      'Place unusual Search Console movement beside confirmed Google ranking update windows without claiming the update caused it.',
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
    alternatives: [
      {
        when: 'You need winners, losers, page patterns, and known site changes around a confirmed update window.',
        reportId: 'update-postmortem',
        doInstead:
          'Run the update postmortem. It anchors matched Search Console comparisons to the official window, inspects segment and page patterns, and keeps migrations, releases, tracking changes, and other confounders visible.',
      },
      {
        when: 'You need proof that a Google update caused a traffic change.',
        doInstead:
          'No automated report can prove that from timing overlap. Compare affected and unaffected segments, representative pages, known site changes, demand, seasonality, and later recovery evidence. Update correlation only establishes whether the dates overlap.',
      },
    ],
    seo: {
      primaryKeyword: 'Google algorithm update checker',
      supportingKeywords: ['Google update checker'],
    },
  },
  'search-performance-overview': {
    name: 'Review SEO performance',
    summary:
      'See where clicks and impressions changed, which pages or queries account for the movement, and what to inspect next.',
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
    alternatives: [
      {
        when: 'Your question is about broken pages, redirects, canonicals, indexability controls, metadata, or internal links rather than Search Console movement.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl. It fetches the site and returns page-level technical evidence that Search Console cannot provide. The search performance overview can still help prioritise sections when search movement is also relevant.',
      },
      {
        when: 'You need a definitive explanation for why search performance changed.',
        doInstead:
          'No automated report can prove a cause from the available Search Console comparisons. Use the overview to locate the affected dates and segments, then review releases, tracking, demand, search-result changes, and representative live pages.',
      },
    ],
    seo: {
      primaryKeyword: 'SEO performance report',
      supportingKeywords: ['Search Console report'],
    },
  },
  'monthly-action-plan': {
    name: 'Create a monthly SEO action plan',
    summary:
      'Produce the shared monthly SEO report and finish with a short list of evidence-backed follow-up work.',
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
    alternatives: [
      {
        when: 'You only need a readable monthly status report and do not want a generated follow-up queue.',
        reportId: 'monthly-report',
        doInstead:
          'Run monthly report. It returns the calendar-month comparison, opportunity evidence, source coverage, and caveats without adding the workflow action list.',
      },
      {
        when: 'You need to measure the effect of one known implementation rather than review the whole month.',
        reportId: 'measure-change',
        doInstead:
          'Run measure change with the recorded implementation date and suitable before-and-after windows. It preserves coverage and comparison limits around that change. Neither report can prove causation when other changes overlap.',
      },
    ],
    seo: {
      primaryKeyword: 'SEO action plan',
      supportingKeywords: ['monthly SEO report'],
    },
  },
  'refresh-priorities': {
    name: 'Rank the next SEO fixes',
    summary:
      'Turn crawl and Search Console evidence into one ranked implementation list.',
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
      'Collects eligible quick wins, second-page opportunities, decaying pages, cannibalisation rows, and crawl findings.',
      'Normalises shared evidence without counting the same underlying rows as independent proof.',
      'Ranks a limited queue consistently and keeps the source report, verification, caveats, and score factors attached.',
    ],
    returns: [
      'A ranked priority list with the evidence, source report, confidence, and recommended investigation for each item.',
      'Follow-up commands for deeper page, crawl, or search opportunity evidence.',
      'Caveats that stop priority scores becoming traffic forecasts or automatic rewrite orders.',
    ],
    alternatives: [
      {
        when: 'You only want technical crawl fixes and do not want content or Search Console opportunities mixed into the queue.',
        reportId: 'top-fixes',
        doInstead:
          'Run top fixes against a saved crawl. It ranks crawl issue groups by rule evidence and affected scope, with sample URLs and verification guidance still attached.',
      },
      {
        when: 'You need an exact content brief for one page already selected for review.',
        reportId: 'content-optimization',
        doInstead:
          'Run content optimization for that URL. It adds the live page structure and returned query evidence needed for a focused brief. Refresh priorities orders candidates but cannot decide that a rewrite is required.',
      },
    ],
    seo: {
      primaryKeyword: 'seo priorities',
      supportingKeywords: ['seo audit report', 'technical SEO audit'],
    },
  },
  'technical-watch': {
    name: 'Monitor technical SEO changes',
    summary:
      'Run recurring crawl, index, and link-recovery checks after the first audit.',
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
      'Checks crawl movement, live page regressions, and changes to technical findings.',
      'Reviews representative URL Inspection snapshots and broken URLs that retain search value.',
      'Runs each source independently and separates recoveries, quota blocks, fetch failures, and intentional controls.',
    ],
    returns: [
      'A technical monitoring summary with crawl changes, sampled index changes, link recovery work, and operational failures.',
      'The highest-priority regressions to inspect next, with source-specific caveats.',
      'Follow-up commands for representative pages and the next comparable run.',
    ],
    alternatives: [
      {
        when: 'The site has no comparable crawl or URL Inspection baseline yet.',
        reportId: 'site-crawl',
        doInstead:
          'Run a site crawl first to capture current live technical evidence and save the baseline. Technical watch needs comparable prior evidence to call something a regression or recovery.',
      },
      {
        when: 'You need exact Google indexed-state evidence for a small list of important URLs rather than combined monitoring.',
        reportId: 'index-watch',
        doInstead:
          'Run index watch with the selected URLs. It compares exact URL Inspection snapshot fields and separates current issues, regressions, recoveries, unchanged results, and provider failures. The result remains a quota-limited Google snapshot rather than a live fetch.',
      },
    ],
    seo: {
      primaryKeyword: 'technical SEO monitoring',
      supportingKeywords: ['technical SEO audit', 'site audit'],
    },
  },
  'update-postmortem': {
    name: 'Review winners and losers around a Google update',
    summary:
      'Inspect winners, losers, page evidence, and known site changes around a confirmed Google ranking update window.',
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
    alternatives: [
      {
        when: 'You only need to check whether unusual traffic dates overlap a confirmed Google ranking update.',
        reportId: 'update-correlation',
        doInstead:
          'Run update correlation. It compares the anomaly window with official rollout dates and returns a timing classification without running the deeper winner, loser, page, and confounder analysis.',
      },
      {
        when: 'You need proof that the update caused a specific loss or that one proposed change will recover it.',
        doInstead:
          'No automated report can prove either conclusion. Review unaffected comparison groups, intent and result-page changes, site releases, tracking, demand, seasonality, and representative pages. The postmortem can organise the evidence and identify patterns, but timing remains context rather than causation.',
      },
    ],
    seo: {
      primaryKeyword: 'google update',
      supportingKeywords: ['google search updates', 'seo report'],
    },
  },
}
