import type { ReportEditorial } from './types'

export const diagnosisReports = [
  {
    id: 'segment-impact',
    name: 'Segment impact',
    category: 'diagnosis',
    summary:
      'See which returned pages or queries moved across two matched periods while keeping missing rows honest.',
    question:
      'Which part of the property accounts for the observed search-performance change?',
    useWhen: [
      'A property-level rise or fall needs to be broken down by page or query.',
      'You need winners, losers, and unmatched rows in one comparison.',
    ],
    avoidWhen: [
      'You need real-time data or a causal verdict about a deployment.',
    ],
    evidence: [
      'Returned Search Console rows for the chosen dimension across adjacent equal-length periods.',
      'Matched, current-only, previous-only, invalid, and capped row states.',
    ],
    methodology: [
      'Aggregates duplicate rows consistently, compares like-for-like returned segments, and does not treat a missing segment as zero.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      dimension: 'page',
      days: 28,
      compareDays: 28,
      limit: 20,
      maxRows: 50000,
      unmatchedLimit: 10,
    },
    interpretation: [
      'Separate matched changes from rows seen in only one window. Large unmatched sets or capped sources weaken property-wide conclusions.',
    ],
    caveats: [
      'Search Console row retention and anonymised queries mean the returned dimensions may not reconcile to property totals.',
    ],
    nextSteps: [
      'Audit the pages behind the largest supported changes.',
      'Run traffic anomaly or update correlation when timing still needs context.',
    ],
    related: ['traffic-anomaly', 'audit-page', 'update-correlation'],
    sources: ['search-analytics'],
  },
  {
    id: 'striking-distance',
    name: 'Striking distance',
    category: 'diagnosis',
    summary:
      'Find returned query and page combinations averaging positions 11 to 20 so you can review plausible next-page opportunities.',
    question:
      'Which visible pages may deserve a closer look just beyond the first results page?',
    useWhen: [
      'You want a limited review queue based on existing search visibility.',
      'You can inspect intent and the live result before changing a page.',
    ],
    avoidWhen: [
      'You want a promise of rankings or traffic. Average position is an aggregate, not a fixed rank.',
    ],
    evidence: [
      'Returned Search Console query and page rows with impressions, clicks, CTR, and average position.',
      'Optional fetched-page checks when content verification is requested.',
    ],
    methodology: [
      'Filters eligible rows by the documented position and impression bounds, ranks them consistently, then returns a limited review set.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 28,
      minImpressions: 50,
      limit: 10,
      includeBrand: false,
      verifyContent: true,
      verifyLimit: 5,
    },
    interpretation: [
      'Treat each row as an investigation lead. Check the query meaning, competing result types, page fit, and technical state before proposing work.',
    ],
    caveats: [
      'Position 11 to 20 is a prioritisation filter, not evidence that a small edit will move the page to page one.',
    ],
    nextSteps: [
      'Run page opportunities or audit page for the best-supported URL.',
      'Use internal links when the target is sound and needs relevant discovery paths.',
    ],
    related: ['page-opportunities', 'audit-page', 'internal-links'],
    sources: ['search-analytics'],
  },
  {
    id: 'traffic-anomaly',
    name: 'Traffic anomaly',
    category: 'diagnosis',
    summary:
      'Flag unusual recent Search Console movement against the property’s own history so you know where to investigate first.',
    question: 'Is the recent search movement unusual for this property?',
    useWhen: [
      'Clicks or impressions appear to have changed and you need a repeatable first check.',
      'A scheduled review needs to separate routine variation from stronger signals.',
    ],
    avoidWhen: [
      'The recent window is incomplete or the property has too little history for a useful baseline.',
    ],
    evidence: [
      'Finalised daily Search Console metrics over the requested baseline and recent windows.',
    ],
    methodology: [
      'Compares the recent window with the returned historical distribution and reports the threshold, direction, and data sufficiency used.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      refresh: false,
    },
    interpretation: [
      'An anomaly says the movement is unusual under this method. It does not identify the cause. Break it down before reaching for a fix.',
    ],
    caveats: [
      'Seasonality, launches, tracking changes, news, and demand can all create genuine anomalies unrelated to technical SEO.',
    ],
    nextSteps: [
      'Run segment impact to locate the pages or queries behind the movement.',
      'Check update correlation when the dates overlap a confirmed Google update.',
    ],
    related: [
      'segment-impact',
      'update-correlation',
      'search-performance-overview',
    ],
    sources: ['search-analytics'],
  },
  {
    id: 'update-correlation',
    name: 'Google update correlation',
    category: 'diagnosis',
    summary:
      'Put unusual search movement beside official Google ranking update windows without claiming the update caused it.',
    question:
      'Did this property’s unusual movement overlap a confirmed Google ranking update?',
    useWhen: [
      'A traffic anomaly falls near dates listed on Google’s Search Status Dashboard.',
      'You need timing context before a deeper winner and loser review.',
    ],
    avoidWhen: [
      'You need proof of causation or a generic explanation for every decline.',
    ],
    evidence: [
      'The property anomaly result and official Google ranking update windows.',
    ],
    methodology: [
      'Overlays the observed anomaly window with confirmed update dates and an explicit padding window.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      paddingDays: 2,
      refresh: false,
    },
    interpretation: [
      'Overlap is a reason to inspect affected segments and page types. It is not a diagnosis by itself.',
    ],
    caveats: [
      'Sites change while updates roll out, and unrelated demand or technical events can share the same dates.',
    ],
    nextSteps: [
      'Use the update postmortem workflow to inspect winners, losers, and known confounders.',
      'Audit representative pages before making template-wide changes.',
    ],
    related: ['update-postmortem', 'segment-impact', 'audit-page'],
    sources: ['search-analytics', 'google-updates'],
  },
] as const satisfies readonly ReportEditorial[]
