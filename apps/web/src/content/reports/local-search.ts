import type { ReportEditorial } from './types'

export const localSearchReports = [
  {
    id: 'local-search-demand',
    name: 'Local search demand',
    category: 'opportunities',
    summary:
      'Find location-specific Search Console demand, landing pages, and repeated local page patterns, with optional live results for one exact search market.',
    question:
      'Which retained searches show local intent, which pages answer them, and where would an exact local result snapshot change the decision?',
    useWhen: [
      'You want owner-verified evidence for place names, nearby wording, or postal-code searches.',
      'You need to review repeated location pages before expanding or changing a programmatic template.',
      'You want a small number of current, location-specific result snapshots alongside first-party evidence.',
    ],
    avoidWhen: [
      'You need Google Business Profile performance, Maps listing details, reviews, calls, or directions.',
      "You plan to infer a searcher's physical location from query wording alone.",
    ],
    evidence: [
      'Finalized Search Console query and page rows from one bounded request.',
      'Explicit location terms plus conservative nearby and postal-code heuristics, with every match retained.',
      'Optional provider SERP snapshots for up to three retained queries in one canonical location and device.',
    ],
    methodology: [
      'Validates, deduplicates, and aggregates query-page rows before applying minimum evidence and output limits.',
      'Classifies only explicit local wording and labels the classification as a heuristic.',
      'Groups repeated URL shapes for template review without claiming that each page is useful, unique, or worth creating.',
      'Keeps Search Console average position separate from an exact live rank and keeps provider cost, cache, coverage, and result features visible.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      locationTerms: ['london', 'manchester'],
      days: 90,
      minImpressions: 10,
      limit: 25,
    },
    interpretation: [
      'Start with the first-party queries and pages. Use their action labels to protect existing visibility, improve a relevant page, investigate fit, or review page overlap.',
      'Request paid snapshots only for a shortlist where current result format, intent, competitors, or exact rank would alter the next step.',
    ],
    caveats: [
      "A place in the query does not prove the searcher's location, and a query without local wording can still have local intent.",
      'Search Console position is averaged across impressions. A live result is one query, location, device, language, and observation time.',
      'An observed local pack does not show whether the site or a particular business listing appeared in it.',
    ],
    nextSteps: [
      'Inspect the leading query-page pairs and representative pages from repeated templates.',
      'Add the real place names and aliases used in the market when the automatic patterns are too narrow.',
      'Run exact local results for no more than three decision-critical queries when live context is needed.',
    ],
    related: [
      'keyword-opportunities',
      'pseo-opportunities',
      'serp-results',
      'rank-tracking',
    ],
    sources: ['search-analytics', 'serp-provider-results'],
  },
] as const satisfies readonly ReportEditorial[]
