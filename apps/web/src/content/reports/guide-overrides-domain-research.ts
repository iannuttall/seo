import type { ReportGuideOverride } from './guide-types'

export const domainResearchGuideOverrides: Partial<
  Record<string, ReportGuideOverride>
> = {
  'domain-overview': {
    inputs: [
      {
        label: 'Domain and country market',
        source: 'domain-provider-overview',
        role: 'Define the domain and country-level provider database used for the independent search footprint.',
      },
      {
        label: 'Optional matching Search Console property',
        source: 'search-analytics',
        role: 'Adds owner-verified clicks, impressions, click-through rate, and average position for a finalised date range.',
      },
    ],
    checks: [
      'Collects estimated organic traffic, ranked keywords, traffic cost, ranking buckets, and movement counts from one provider capability.',
      'Keeps provider estimates and matching Search Console totals separate so an estimate is never presented as measured traffic.',
      'Preserves request filters, source coverage, invalid rows, cache state, observation time, warnings, and local request cost.',
    ],
    returns: [
      'A country-level domain footprint with estimated traffic, keyword counts, ranking distribution, movement, and provider provenance.',
      'Optional owner-verified Search Console totals beside the estimate, with separate dates, semantics, coverage, and caveats.',
    ],
    alternatives: [
      {
        when: 'You need the individual terms or pages behind the footprint.',
        reportId: 'ranked-keywords',
        doInstead:
          'Run ranked keywords for a bounded term-level view, or ranking pages when page families and representative URLs matter more.',
      },
      {
        when: 'You need a current result for one query, location, and device.',
        reportId: 'serp-results',
        doInstead:
          'Run SERP results. A country-level provider database cannot replace a live result snapshot with explicit location and device settings.',
      },
    ],
    seo: {
      primaryKeyword: 'domain SEO analysis',
      supportingKeywords: [
        'organic search competitor analysis',
        'domain keyword research',
      ],
    },
  },
  'ranked-keywords': {
    inputs: [
      {
        label: 'Domain or page target and market filters',
        source: 'domain-provider-keywords',
        role: 'Provide a bounded set of estimated keyword, rank, result type, ranking URL, demand, difficulty, intent, and traffic rows.',
      },
      {
        label: 'Optional matching Search Console property',
        source: 'search-analytics',
        role: 'Adds retained owner-verified query and page evidence for the same site without changing provider metrics.',
      },
    ],
    checks: [
      'Applies rank, demand, wording, result-type, and row limits before acquisition, then validates and deduplicates returned rows deterministically.',
      'Labels each first-party comparison as observed, not in retained rows, or not requested.',
      'Keeps provider totals, pagination, invalid rows, cache state, warnings, and request cost beside the visible subset.',
    ],
    returns: [
      'A bounded ranked-keyword list with ranking URLs, ranks, result types, provider metrics, source state, and stable ordering.',
      'Optional Search Console query and page matches, including conflicts where provider demand is zero but retained first-party impressions exist.',
    ],
    alternatives: [
      {
        when: 'You need owner-verified opportunities for a connected site rather than independent market estimates.',
        reportId: 'keyword-opportunities',
        doInstead:
          'Run keyword opportunities first. It prioritises actual Search Console evidence, then use provider rows as additional market context.',
      },
      {
        when: 'A current result page would change your decision about intent or competition.',
        reportId: 'serp-results',
        doInstead:
          'Run SERP results for the shortlisted terms with explicit location and device settings before planning content or tracking rank.',
      },
    ],
    seo: {
      primaryKeyword: 'ranked keywords',
      supportingKeywords: [
        'competitor keyword research',
        'domain keyword rankings',
      ],
    },
  },
  'ranking-pages': {
    inputs: [
      {
        label: 'Domain and provider row filters',
        source: 'domain-provider-pages',
        role: 'Provide a bounded page-level footprint with estimated traffic, keyword counts, ranking distribution, and movement.',
      },
      {
        label: 'Optional matching Search Console property',
        source: 'search-analytics',
        role: 'Adds retained owner-verified page metrics for exact matching URLs.',
      },
    ],
    checks: [
      'Validates and deduplicates provider page rows while preserving filters, pagination, totals, invalid rows, warnings, and cost.',
      'Groups repeated path shapes into deterministic structural patterns with counts and representative URLs.',
      'Keeps the path-pattern heuristic separate from claims about page quality, intent, demand, or how a site creates its pages.',
    ],
    returns: [
      'A bounded list of ranking pages with provider estimates, movement, ranking distribution, and optional exact Search Console matches.',
      'Repeated path patterns, representative URLs, evidence references, source coverage, and caveats for programmatic SEO review.',
    ],
    alternatives: [
      {
        when: 'You need the queries behind one domain or page.',
        reportId: 'ranked-keywords',
        doInstead:
          'Run ranked keywords with the domain or page target and the filters needed for the decision.',
      },
      {
        when: 'You need to assess a programmatic template family on a site you own.',
        reportId: 'pseo-audit',
        doInstead:
          'Run the pSEO audit to add first-party performance, template, overlap, and page-quality evidence before changing a working page family.',
      },
    ],
    seo: {
      primaryKeyword: 'competitor top pages',
      supportingKeywords: [
        'organic search competitor pages',
        'programmatic SEO competitor research',
      ],
    },
  },
  'serp-competitors': {
    inputs: [
      {
        label: 'Explicit keyword set and country market',
        source: 'domain-provider-competitors',
        role: 'Define the bounded query set used to find domains that repeatedly appear in the same search market.',
      },
      {
        label: 'Target domain and optional site classifications',
        role: 'Separate the target and user-declared business competitors from publishers, directories, communities, marketplaces, and unknown sites.',
      },
    ],
    checks: [
      'Normalizes and deduplicates 2 to 200 keywords before acquisition and validates the provider response against the requested query count.',
      'Measures recurring domains by matched keywords, query-set coverage, average position, visibility estimate, and sample positions.',
      'Keeps every undeclared site type unknown instead of guessing whether a search competitor is a business competitor.',
    ],
    returns: [
      'A bounded competitor set with relationship, declared site type, matched keyword count, query-set coverage, position evidence, and provider estimates.',
      'Request limits, source coverage, pagination, invalid rows, warnings, cache state, observation time, and local request cost.',
    ],
    alternatives: [
      {
        when: 'You need a current view of one query or a city-level and device-specific result.',
        reportId: 'serp-results',
        doInstead:
          'Run SERP results. This report compares recurring domains across a country-level query set rather than capturing one live result page.',
      },
      {
        when: 'You have not reviewed and classified the returned domains.',
        doInstead:
          'Inspect representative pages and classify the relevant sites before running a keyword gap. Recurring search visibility alone does not make a domain a business competitor.',
      },
    ],
    seo: {
      primaryKeyword: 'SEO competitor analysis',
      supportingKeywords: [
        'search competitors',
        'organic search competitor research',
      ],
    },
  },
  'competitor-keyword-gap': {
    inputs: [
      {
        label: 'Connected Search Console property',
        source: 'search-analytics',
        role: 'Provides retained owner-verified query and page evidence used to find existing topic coverage.',
      },
      {
        label: 'Site and classified competitor domains',
        source: 'domain-provider-keywords',
        role: 'Provide bounded estimated keyword footprints for the site and up to three explicitly relevant competitors.',
      },
      {
        label: 'Competitor ranking pages',
        source: 'domain-provider-pages',
        role: 'Add repeated path-pattern evidence and representative pages for programmatic SEO research.',
      },
    ],
    checks: [
      'Separates terms already observed in retained first-party rows, terms where the site already has a provider-observed rank, plausible gap candidates, and unverified competitor terms.',
      'Requires retained first-party theme overlap plus either several compared domains or a top-10 competitor rank before promoting a term to a relevant candidate.',
      'Builds bounded token indexes for large Search Console datasets and applies deterministic limits, ordering, and one structured-output budget.',
      'Creates a data-source research brief only when repeated page patterns support a possible new template family.',
    ],
    returns: [
      'A bounded candidate list with competitor evidence, own-site coverage state, provider metrics, theme matches, classifications, and verification prompts.',
      'Repeated competitor page patterns and programmatic SEO briefs covering source rights, identifiers, fields, coverage, freshness, missing values, and distinct page value.',
      'Per-source status, row caps, failed sources, invalid rows, cache state, request cost, processing counts, warnings, and caveats.',
    ],
    alternatives: [
      {
        when: 'You have not identified and classified relevant competitors yet.',
        reportId: 'serp-competitors',
        doInstead:
          'Run search competitors on a representative keyword set, inspect the returned domains, and classify only the sites that compete for the same audience or outcome.',
      },
      {
        when: 'You want to expand an existing first-party page family rather than research competitor terms.',
        reportId: 'pseo-opportunities',
        doInstead:
          'Run pSEO opportunities to find expansion evidence in owner-verified performance and working templates before introducing an independent competitor dataset.',
      },
    ],
    seo: {
      primaryKeyword: 'competitor keyword gap analysis',
      supportingKeywords: [
        'SEO content gap analysis',
        'programmatic SEO keyword research',
      ],
    },
  },
}
