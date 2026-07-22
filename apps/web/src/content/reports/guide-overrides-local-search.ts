import type { ReportGuideOverride } from './guide-types'

export const localSearchGuideOverrides: Partial<
  Record<string, ReportGuideOverride>
> = {
  'local-search-demand': {
    inputs: [
      {
        label: 'Connected Search Console property',
        source: 'search-analytics',
        role: 'Provides finalized query and landing-page rows for the selected dates, up to one explicit row limit.',
      },
      {
        label: 'Location terms and evidence thresholds',
        role: 'Add the place names and aliases that matter to the site while bounding the minimum impressions and returned opportunities.',
      },
      {
        label: 'Optional exact search market',
        source: 'serp-provider-results',
        role: 'Adds up to three paid live result snapshots for one canonical location, device, language, and search engine.',
      },
      {
        label: 'Optional Google Analytics property',
        source: 'google-analytics-geography',
        role: 'Adds bounded country, region, city, and session context only for exact retained local landing-page paths.',
      },
    ],
    checks: [
      'Filters malformed, conflicting, duplicate, low-actionability, non-local, brand, and below-threshold rows with separate counts.',
      'Classifies explicit named locations, nearby phrases, UK postcodes, and US ZIP codes with supporting local wording through a documented heuristic.',
      'Aggregates retained queries and pages deterministically, then finds repeated URL shapes for programmatic template review.',
      'Keeps exact local snapshots optional and bounded, with their market, timestamp, features, cache, coverage, task state, and cost attached.',
      'Retains bounded local-pack listings and aggregates recurring organic domains without guessing their business type.',
      'Joins optional Analytics geography by exact landing-page path while keeping query intent and visitor location separate.',
    ],
    returns: [
      'A limited local query queue with clicks, impressions, CTR, Search Console average position, matched local wording, action, and landing-page coverage.',
      'Repeated local page patterns, source completeness, filtered-row counts, omitted-result counts, warnings, caveats, and precise next steps.',
      'When requested, up to three complete or partial live result snapshots plus bounded competitor and listing summaries, without blending exact rank into Search Console averages.',
      'When requested, matched Analytics sessions by location and repeated local template, with source limits and quality states visible.',
    ],
    alternatives: [
      {
        when: 'You need all first-party keyword opportunities, including searches without explicit local wording.',
        reportId: 'keyword-opportunities',
        doInstead:
          'Run keyword opportunities first, then use this report to isolate the retained searches whose wording supports local intent.',
      },
      {
        when: 'You need one exact result page for a query you already chose.',
        reportId: 'serp-results',
        doInstead:
          'Run SERP results directly with the required canonical location and device instead of scanning Search Console demand first.',
      },
      {
        when: 'You need listing performance, review data, calls, directions, or complete Maps results.',
        doInstead:
          'Use the relevant business-profile or maps-listing source. This report does not connect to those datasets.',
      },
    ],
    seo: {
      primaryKeyword: 'local SEO keyword research',
      supportingKeywords: [
        'local search demand',
        'local SEO Search Console report',
      ],
    },
  },
}
