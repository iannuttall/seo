import type { ReportEditorial } from './types'

export const localSearchReports = [
  {
    id: 'local-search-demand',
    name: 'Local search demand',
    category: 'opportunities',
    summary:
      'Find location-specific Search Console demand, landing pages, and repeated local page patterns, with optional Analytics geography and live results for one exact search market.',
    question:
      'Which retained searches show local intent, which pages answer them, and where would landing-page geography or an exact local result snapshot change the decision?',
    useWhen: [
      'You want owner-verified evidence for place names, nearby wording, or postal-code searches.',
      'You need to review repeated location pages before expanding or changing a programmatic template.',
      'You want a small number of current, location-specific result snapshots alongside first-party evidence.',
      'You want to see measured location context for retained local landing pages without assigning that geography to a query.',
    ],
    avoidWhen: [
      'You need Google Business Profile performance, Maps listing details, reviews, calls, or directions.',
      "You plan to infer a searcher's physical location from query wording alone.",
    ],
    evidence: [
      'Finalized Search Console query and page rows from one bounded request.',
      'Explicit location terms plus conservative nearby and postal-code heuristics, with every match retained.',
      'Optional provider SERP snapshots for up to three retained queries in one canonical location and device.',
      'Optional Google Analytics sessions by country, region, and city, joined only to retained local landing-page paths.',
    ],
    methodology: [
      'Validates, deduplicates, and aggregates query-page rows before applying minimum evidence and output limits.',
      'Classifies only explicit local wording and labels the classification as a heuristic.',
      'Groups repeated URL shapes for template review without claiming that each page is useful, unique, or worth creating.',
      'Keeps Search Console average position separate from an exact live rank and keeps provider cost, cache, coverage, and result features visible.',
      'Aggregates recurring organic domains as unclassified search competitors and local-pack rows as observed listings, with evidence references and fixed output limits.',
      'Keeps Analytics geography separate from query wording and reports unmatched, missing, invalid, duplicate, capped, and quality-warning states.',
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
      'Add Analytics geography only when measured location context would change how you review a landing page or repeated local template.',
    ],
    caveats: [
      "A place in the query does not prove the searcher's location, and a query without local wording can still have local intent.",
      'Search Console position is averaged across impressions. A live result is one query, location, device, language, and observation time.',
      'A retained local-pack listing is an observed result row. It does not prove ownership, complete Maps coverage, or Google Business Profile performance.',
      'Analytics geography describes measured sessions for matched landing pages. It does not prove which query produced a session.',
    ],
    nextSteps: [
      'Inspect the leading query-page pairs and representative pages from repeated templates.',
      'Add the real place names and aliases used in the market when the automatic patterns are too narrow.',
      'Run exact local results for no more than three decision-critical queries when live context is needed.',
      'Classify recurring result domains before treating them as comparable businesses or using them in a competitor plan.',
    ],
    related: [
      'keyword-opportunities',
      'pseo-opportunities',
      'serp-results',
      'rank-tracking',
    ],
    sources: [
      'search-analytics',
      'google-analytics-geography',
      'serp-provider-results',
    ],
  },
] as const satisfies readonly ReportEditorial[]
