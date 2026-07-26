import type { ReportGuideOverride } from './guide-types'

export const reportGuideOverridesPseo: Partial<
  Record<string, ReportGuideOverride>
> = {
  'pseo-patterns': {
    name: 'Find programmatic SEO patterns',
    summary:
      'See which repeatable searches already show your site in Google, then check a planned list of topics without assuming every idea needs a page.',
    inputs: [
      {
        label: 'Search Console searches and pages',
        source: 'search-analytics',
        role: 'Shows the searches where your site appeared, the pages Google returned, and their clicks, impressions, and average position.',
      },
      {
        label: 'Sitemap and existing pages',
        source: 'sitemaps',
        role: 'Checks which suggested pages already exist and finds repeated sections of the site. A URL missing from the sitemap is treated as a clue, not proof that the page does not exist.',
      },
      {
        label: 'Optional list of topics to check',
        role: 'You can provide a list, pairs such as Product A versus Product B, or combinations such as one tool for several file types. The report checks only the topics you supply.',
      },
      {
        label: 'Optional search estimates and current results',
        source: 'keyword-provider-metrics',
        role: 'Adds search volume estimates and up to three current result checks when you ask for them. These provider calls are off by default.',
      },
    ],
    checks: [
      'Groups searches into useful types such as alternatives, comparisons, conversions, lists, examples, integrations, pricing, reviews, templates, calculators, and how-to pages.',
      'Counts every topic in a large planned list before returning a manageable review sample from each group.',
      'Treats Product A versus Product B and Product B versus Product A as the same comparison unless you explicitly make the direction matter.',
      'Separates pages that exist, ideas that may be covered elsewhere, missing topics found in Search Console, and topics missing only from the plan you supplied.',
      'Keeps optional search estimates and current result checks separate from your Search Console data.',
    ],
    returns: [
      'The repeated search types found, the real searches behind them, the planned topics checked, and a review list showing what exists, overlaps, or may be missing.',
      'Clear notes when Search Console or provider data is missing or limited, plus the cost of any optional provider checks.',
    ],
    alternatives: [
      {
        when: 'A repeated group of pages already performs in search and you want deeper keyword and competitor research.',
        reportId: 'pseo-opportunities',
        doInstead:
          'Use the opportunity report to research related keywords, current results, competitor pages, and the data needed to build more useful pages.',
      },
      {
        when: 'You need to check the technical health, content, search performance, or Google index status of pages that already exist.',
        reportId: 'pseo-audit',
        doInstead:
          'Run the programmatic SEO audit on a representative sample before changing the page template.',
      },
      {
        when: 'You want the report to write and publish every possible page.',
        doInstead:
          'Use this report to decide what deserves a page. Start with a small sample and check the source data, usefulness, duplicate risk, internal links, and crawl setup before publishing more.',
      },
    ],
    seo: {
      primaryKeyword: 'programmatic SEO patterns',
      supportingKeywords: [
        'programmatic SEO ideas',
        'programmatic keyword patterns',
      ],
    },
  },
  'pseo-opportunities': {
    name: 'Research programmatic SEO opportunities',
    summary:
      'Research ways to expand an existing page pattern using Search Console, keyword ideas, current results and competitor pages.',
    inputs: [
      {
        label: 'Existing page patterns',
        source: 'sitemaps',
        role: 'Uses the programmatic SEO audit to show repeated sections of the site and example pages from each one.',
      },
      {
        label: 'Search Console searches and pages',
        source: 'search-analytics',
        role: 'Shows the searches already associated with those pages, including clicks, impressions and average position.',
      },
      {
        label: 'Optional keyword research',
        source: 'keyword-provider-discovery',
        role: 'Finds related searches for a country and language when you connect a research provider and ask for them.',
      },
      {
        label: 'Optional current search results',
        source: 'serp-provider-results',
        role: 'Checks up to three searches in the chosen market and device so you can review the pages that currently rank.',
      },
    ],
    checks: [
      'Starts with no more than five useful searches from existing page groups and Search Console.',
      'Separates searches the site already appears for from related ideas that need more research.',
      'Finds domains and page patterns that recur in the current results.',
      'Lists the information a useful page would need without pretending that the data is available or reusable.',
    ],
    returns: [
      'Existing page groups, related searches, optional current results and recurring competitor page patterns.',
      'Up to three short checks covering the information each possible page would need.',
    ],
    alternatives: [
      {
        when: 'You need to check the technical health or Google index status of pages that already exist.',
        reportId: 'pseo-audit',
        doInstead:
          'Run the programmatic SEO audit on a representative set of pages before changing the template.',
      },
      {
        when: 'You want to generate every keyword combination from the research.',
        doInstead:
          'Review a small sample first. Check that each page would answer a useful search, add something distinct, use reliable data and fit the site structure.',
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
