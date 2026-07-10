import type { ReportEditorial } from './types'

export const reportingReports = [
  {
    id: 'audit-page',
    name: 'Audit one page',
    category: 'reporting',
    summary:
      'Inspect one live URL in depth before recommending a page-level technical or content change.',
    question:
      'What can be observed and safely concluded about this specific page?',
    useWhen: [
      'A search result, release, redirect, canonical, structured data, or content question points to one URL.',
      'You need fetched evidence rather than a sitewide assumption.',
    ],
    avoidWhen: [
      'You need sitewide coverage or proof of the version Google indexed.',
    ],
    evidence: [
      'Fetch diagnostics, final URL, response, metadata, headings, links, directives, structured data, page text, and optional Search Console context.',
    ],
    methodology: [
      'Fetches the page, keeps transport failures visible, extracts observed evidence, and applies page-level checks with heuristic labels where needed.',
    ],
    exampleParams: {
      url: 'https://example.com/product',
      site: 'sc-domain:example.com',
      refresh: true,
    },
    interpretation: [
      'Start with fetch diagnostics. Title width is an estimate, heading counts describe structure, and content length is evidence rather than a quality score.',
    ],
    caveats: [
      'One fetch cannot prove Google’s indexed version, rendered state for every crawler, or a sitewide pattern.',
    ],
    nextSteps: [
      'Fix concrete contradictions and refetch the URL.',
      'Run a site crawl when the same pattern may affect a template.',
    ],
    related: ['site-crawl', 'redirect-trace', 'content-optimization'],
    sources: ['canonical', 'robots-meta', 'structured-data', 'javascript'],
  },
  {
    id: 'monthly-report',
    name: 'Monthly SEO report',
    category: 'reporting',
    summary:
      'Turn one calendar month of search evidence into a readable report with gaps and follow-up work still visible.',
    question:
      'What happened in organic search this month and what should be investigated next?',
    useWhen: [
      'A monthly review needs consistent periods and repeatable narrative structure.',
      'The selected month has finalised provider data.',
    ],
    avoidWhen: [
      'You need a live dashboard or an explanation that goes beyond the available evidence.',
    ],
    evidence: [
      'Finalised Search Console metrics, comparison evidence, selected opportunities, optional page checks, and section caveats.',
    ],
    methodology: [
      'Builds the requested calendar month, compares compatible evidence, limits detail, and writes narrative from structured report results.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      month: '2026-05',
      limit: 10,
      includeBrand: false,
      verifyContent: true,
      verifyLimit: 5,
    },
    interpretation: [
      'Read data coverage before headline movements. Use the report to choose investigations, not to fill gaps with explanations.',
    ],
    caveats: [
      'Search Console totals and returned dimensional rows have different semantics and may not reconcile exactly.',
    ],
    nextSteps: [
      'Run the focused report attached to a leading item.',
      'Save the report as the baseline for the next monthly review.',
    ],
    related: [
      'narrative-report',
      'monthly-action-plan',
      'search-performance-overview',
    ],
    sources: ['search-analytics'],
  },
  {
    id: 'pseo-audit',
    name: 'Programmatic SEO audit',
    category: 'reporting',
    summary:
      'Review repeated URL templates with Search Console evidence and limited crawl or URL Inspection samples.',
    question:
      'Which programmatic page families show supported index, crawl, visibility, or page-quality review signals?',
    useWhen: [
      'A site publishes repeated URL templates at meaningful scale.',
      'You need sampled technical evidence alongside first-party search visibility.',
    ],
    avoidWhen: [
      'You plan to label pages thin from word count or condemn a whole template from one sampled URL.',
    ],
    evidence: [
      'Sitemap discovery, returned Search Console page and query rows, sampled crawls, optional exact URL Inspection verdicts, and template signatures.',
    ],
    methodology: [
      'Detects repeated URL patterns, ranks returned template evidence, then applies explicit limited technical samples and verdict rules.',
    ],
    exampleParams: { site: 'sc-domain:example.com', detail: 'summary' },
    interpretation: [
      'Separate population, returned search evidence, crawl samples, and inspection samples. A verdict applies to the evidence sampled, not every URL in the family.',
    ],
    caveats: [
      'A sitemap URL without a returned row does not prove zero demand. Literal query coverage and repeated text are review heuristics, not spam verdicts.',
    ],
    nextSteps: [
      'Sample representative URLs from the strongest risk or opportunity.',
      'Measure template changes after complete finalised windows.',
    ],
    related: ['audit-urls', 'index-watch', 'measure-change'],
    sources: ['search-analytics', 'sitemaps', 'url-inspection'],
  },
  {
    id: 'narrative-report',
    name: 'SEO narrative',
    category: 'reporting',
    summary:
      'Explain diagnosis, measured changes, and monitoring evidence in one client-ready narrative without hiding caveats.',
    question:
      'How can the current evidence be explained clearly to a stakeholder?',
    useWhen: [
      'Structured reports already exist and need a readable decision summary.',
      'You need evidence, interpretation, and next actions in one format.',
    ],
    avoidWhen: [
      'You need new source data that the underlying reports did not collect.',
    ],
    evidence: [
      'Property diagnosis sections, recorded change measurements, monitoring results, skipped reasons, and source details from each source report.',
    ],
    methodology: [
      'Assembles structured outputs into a stable narrative order and preserves caveats rather than generating unsupported explanations.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      limit: 10,
      includeBrand: false,
      changeLimit: 5,
    },
    interpretation: [
      'Use the narrative as a reading layer. The structured reports remain the evidence contract for agents, exports, and verification.',
    ],
    caveats: [
      'Clear writing cannot strengthen incomplete or partial source evidence.',
    ],
    nextSteps: [
      'Run the focused report behind any unresolved headline.',
      'Share the caveats with the actions so certainty is not overstated.',
    ],
    related: [
      'search-performance-overview',
      'monthly-report',
      'measure-change',
    ],
    sources: ['search-analytics'],
  },
  {
    id: 'second-page',
    name: 'Second-page opportunities',
    category: 'reporting',
    summary:
      'Find returned URL opportunities averaging positions above 10 through 20, with evidence-grounded prompts for review.',
    question:
      'Which visible pages just beyond the first results page deserve investigation?',
    useWhen: [
      'You need a compact page-oriented opportunity set.',
      'You can verify query intent and page quality before edits.',
    ],
    avoidWhen: [
      'You expect position thresholds to predict a ranking gain or define a universal priority.',
    ],
    evidence: [
      'Returned Search Console page and query rows with optional live-page verification.',
    ],
    methodology: [
      'Filters the documented average-position range, applies evidence thresholds, ranks consistently, and bounds fetched verification.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      range: 28,
      minImpressions: 50,
      limit: 10,
      includeBrand: false,
      verifyContent: true,
      verifyLimit: 5,
    },
    interpretation: [
      'Treat the result as a queue for SERP, intent, content, link, and technical review. Average position is not a fixed rank.',
    ],
    caveats: [
      'Search appearances vary by query, device, location, and feature. Returned rows can be capped or incomplete.',
    ],
    nextSteps: [
      'Audit the best-supported page.',
      'Use internal links or content optimization only when the evidence points there.',
    ],
    related: ['audit-page', 'content-optimization', 'internal-links'],
    sources: ['search-analytics'],
  },
] as const satisfies readonly ReportEditorial[]
