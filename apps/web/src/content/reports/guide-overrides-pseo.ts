import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesPseo: Partial<
  Record<string, ReportGuideOverride>
> = {
  'pseo-opportunities': {
    name: 'Research programmatic SEO opportunities',
    summary:
      'Extend observed template and query-cluster evidence with optional keyword discovery, live results, competitor patterns, costs, and data-source checks.',
    inputs: [
      {
        label: 'Programmatic template evidence',
        source: 'sitemaps',
        role: 'Provides bounded repeated URL families, populations, and representative pages through the existing programmatic SEO audit.',
      },
      {
        label: 'Search Console query evidence',
        source: 'search-analytics',
        role: 'Provides returned impressions, clicks, average position, template queries, and bounded query clusters.',
      },
      {
        label: 'Optional external research',
        source: 'keyword-provider-discovery',
        role: 'Adds market-specific candidate terms only when explicitly enabled with a country, language, and bounded acquisition limits.',
      },
      {
        label: 'Optional live result snapshots',
        source: 'serp-provider-results',
        role: 'Adds at most three exact market and device-specific result checks for selected candidates.',
      },
    ],
    checks: [
      'Selects no more than five research seeds from search-evidenced templates and retained query clusters.',
      'Separates existing first-party queries, observed-template extensions, and new-template research while preserving provider value states and cost.',
      'Groups repeated domains and URL shapes from bounded live snapshots without assigning authority or feasibility scores.',
      'Creates data-source research briefs that do not claim a suitable or reusable dataset exists.',
    ],
    returns: [
      'Observed templates, query clusters, linked discovery candidates, optional live result evidence, and repeated competitor patterns.',
      'Explicit selection limits, source coverage, cache state, warnings, known and unknown cost, caveats, findings, and up to three data-source briefs.',
    ],
    alternatives: [
      {
        when: 'You need to validate the technical and indexed state of existing template pages.',
        reportId: 'pseo-audit',
        doInstead:
          'Run the programmatic SEO audit with bounded crawl and URL Inspection samples. Opportunity research deliberately reuses its template contract without performing those deeper checks.',
      },
      {
        when: 'You want to generate every keyword combination returned by the provider.',
        doInstead:
          'Do not generate the combinations. Review shared intent, representative results, bounded inventory, differentiated value, data rights, missing-value rules, crawl controls, canonicals, and internal links before proposing any page system.',
      },
    ],
    seo: {
      primaryKeyword: 'programmatic SEO keyword research',
      supportingKeywords: [
        'programmatic SEO opportunities',
        'programmatic SEO tools',
      ],
    },
  },
}
