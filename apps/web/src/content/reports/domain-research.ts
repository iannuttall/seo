import type { ReportEditorial } from './types'

export const domainResearchReports = [
  {
    id: 'domain-overview',
    name: 'Domain search footprint',
    category: 'opportunities',
    summary:
      "Review a country-level estimate of a domain's organic footprint beside optional owner-verified Search Console totals.",
    question:
      "How large is this domain's estimated organic footprint, and what does first-party evidence show for a matching site I own?",
    useWhen: [
      'You need a quick independent footprint before deeper competitor or page research.',
      'You want ranking distribution, movement, estimated traffic, and keyword count in one bounded result.',
      'You want provider estimates and matching Search Console performance shown without blending their meanings.',
    ],
    avoidWhen: [
      'You need a live rank for one query, place, and device.',
      'You want estimated traffic treated as measured visits or Search Console clicks.',
    ],
    evidence: [
      'Country-level provider estimates for organic traffic, ranked keywords, traffic cost, ranking buckets, and movement counts.',
      'Optional matching Search Console totals for a finalised date range, kept as a separate first-party source.',
      'Provider coverage, cache state, request filters, warnings, observation time, and local request cost.',
    ],
    methodology: [
      'Normalizes the requested domain and resolves one connected provider with an explicit domain-overview capability.',
      'Keeps provider estimates and Search Console totals side by side. It does not subtract them or calculate a percentage gap.',
      'Preserves observed zero, missing, unavailable, invalid, partial, and complete states in the structured result.',
    ],
    exampleParams: {
      domain: 'example.com',
      site: 'sc-domain:example.com',
      countryCode: 'GB',
      languageCode: 'en',
      days: 28,
    },
    interpretation: [
      'Use Search Console for actual performance on a site you own. Use the provider estimate to choose which domains, pages, and terms deserve independent research.',
      'Read coverage and warnings before reading an empty or small footprint as a real zero.',
    ],
    caveats: [
      'Provider estimates follow the provider database and update schedule. Search Console uses the selected finalised date range.',
      'Country-level domain research does not describe a specific city, postcode, or device.',
    ],
    nextSteps: [
      'Run ranking pages to find the URLs behind the footprint.',
      'Run ranked keywords to inspect a bounded set of terms and ranking pages.',
      'Start with Search Console opportunity reports before changing priorities for a site you own.',
    ],
    related: [
      'ranking-pages',
      'ranked-keywords',
      'search-performance-overview',
    ],
    sources: ['domain-provider-overview', 'search-analytics'],
  },
  {
    id: 'ranked-keywords',
    name: 'Ranked keyword footprint',
    category: 'opportunities',
    summary:
      'Review bounded provider keyword, ranking-page, result-type, and estimate rows with an optional matching Search Console comparison.',
    question:
      'Which keywords and pages appear in this provider footprint, and which rows have matching first-party evidence?',
    useWhen: [
      'You need the keyword rows behind a domain or page footprint.',
      'You want to filter by rank, demand, result type, or excluded wording before paying for rows.',
      'You want provider rows compared with retained Search Console query evidence for a matching site you own.',
      'You have a local ranked-keyword export but no provider API connection.',
    ],
    avoidWhen: [
      'You need a current exact result snapshot rather than a provider database row.',
      'You want a missing Search Console row treated as proof that the site had no impressions.',
    ],
    evidence: [
      'Provider keyword, ranking URL, grouped and absolute rank, result type, estimated traffic, volume, difficulty, intent, and cost fields.',
      'Optional Search Console query and page rows, aggregated deterministically and matched by normalized query.',
      'Request filters, pagination, provider totals, invalid rows, cache state, warnings, and local request cost.',
      'Optional local-file dates, hashes, included fields, row quality, duplicate counts, and caps.',
    ],
    methodology: [
      'Applies bounded filters before acquisition, rejects unsafe limits, validates each returned row, and collapses duplicates deterministically.',
      'Labels each first-party comparison as observed, not in retained rows, or not requested.',
      'Keeps provider zero-volume conflicts visible when retained Search Console impressions exist.',
    ],
    exampleParams: {
      target: 'example.com',
      site: 'sc-domain:example.com',
      countryCode: 'GB',
      languageCode: 'en',
      maxRank: 20,
      minSearchVolume: 10,
      limit: 50,
    },
    interpretation: [
      'Treat provider rows as a shortlist. Check the ranking page, current results, and first-party evidence before deciding that a term is a content opportunity.',
      'An unmatched row means only that the bounded retained Search Console data did not contain it.',
    ],
    caveats: [
      'Rank, volume, traffic, difficulty, and intent are provider estimates and may be older than the current result page.',
      'Pagination and filters change the visible subset. Anonymised Search Console queries can hide first-party matches.',
    ],
    nextSteps: [
      'Run SERP results for shortlisted terms whose current intent or rank would change the decision.',
      'Run ranking pages to inspect repeated page families.',
      'Use keyword opportunities for first-party prioritisation and programmatic clusters.',
    ],
    related: ['serp-results', 'ranking-pages', 'keyword-opportunities'],
    sources: [
      'domain-provider-keywords',
      'local-research-files',
      'search-analytics',
    ],
  },
  {
    id: 'ranking-pages',
    name: 'Ranking pages and patterns',
    category: 'opportunities',
    summary:
      "Find a domain's bounded ranking-page footprint and repeated URL patterns, with optional matching Search Console page evidence.",
    question:
      "Which pages account for this domain's estimated search footprint, and do their paths reveal page families worth reviewing?",
    useWhen: [
      "You want to see which pages carry a first-party or competitor domain's estimated organic footprint.",
      'You are researching programmatic page families and need representative URLs.',
      'You want matching Search Console page evidence for a site you own.',
      'You want to group a local ranked-keyword export into pages and URL patterns.',
    ],
    avoidWhen: [
      'You plan to infer quality, intent, or a content generator from path structure alone.',
      'You need a complete page inventory beyond the provider and output caps.',
    ],
    evidence: [
      'Provider page URLs with estimated organic traffic, keyword counts, traffic cost, ranking distribution, and movement fields.',
      'Deterministic repeated path patterns with counts, representative URLs, and evidence references.',
      'Optional matching Search Console page metrics from a bounded finalised date range.',
    ],
    methodology: [
      'Filters and limits provider work before acquisition, validates URLs, collapses duplicate rows, and keeps pagination visible.',
      'Clusters repeated path shapes as a structural pSEO heuristic without claiming shared intent or page quality.',
      'Matches exact first-party page URLs while keeping estimated and measured metrics separate.',
    ],
    exampleParams: {
      domain: 'example.com',
      site: 'sc-domain:example.com',
      countryCode: 'GB',
      languageCode: 'en',
      minRankedKeywords: 2,
      limit: 50,
    },
    interpretation: [
      'Open representative pages and compare their intent, useful fields, unique value, navigation, internal links, and source data.',
      'A repeated path is a prompt for review. It is not a recommendation to imitate the site or create more pages.',
    ],
    caveats: [
      'Patterns found in a filtered or paginated sample may not describe the whole domain.',
      'Estimated page traffic and keyword counts are not Search Console totals.',
    ],
    nextSteps: [
      'Run ranked keywords for a representative page.',
      'Run pSEO audit before changing a working first-party template family.',
      'Use a current result snapshot when live competitors or intent would change the decision.',
    ],
    related: ['ranked-keywords', 'pseo-audit', 'competitor-keyword-gap'],
    sources: [
      'domain-provider-pages',
      'local-research-files',
      'search-analytics',
    ],
  },
  {
    id: 'serp-competitors',
    name: 'Search competitors',
    category: 'opportunities',
    summary:
      'Identify domains that repeatedly appear across an explicit keyword set while keeping unknown site types unclassified.',
    question:
      'Which domains repeatedly compete in search for this keyword set, and which are relevant business competitors?',
    useWhen: [
      'You want to discover search competitors before choosing a small set for deeper research.',
      'You need to separate your target, declared competitors, and other recurring result domains.',
      'You want publishers, directories, communities, and marketplaces kept distinct from business competitors.',
      'Your ranked-keyword exports contain several domains across the requested terms.',
    ],
    avoidWhen: [
      'You have only one query or need a local, device-specific live result snapshot.',
      'You want the report to guess what kind of site an unknown domain is.',
    ],
    evidence: [
      'An explicit set of 2 to 200 keywords and a country-level provider competitor comparison.',
      'Matched keyword count, query-set coverage, average position, visibility estimate, and sample keyword positions.',
      'User-declared site types and relationship labels, with every undeclared type kept unknown.',
    ],
    methodology: [
      'Normalizes and deduplicates the keyword set before acquisition and keeps provider limits, pagination, cache, and cost visible.',
      'Labels the target as self and uses only supplied classifications for declared competitors.',
      'Treats recurring undeclared domains as search competitors, not automatic business competitors.',
    ],
    exampleParams: {
      keywords: ['blue widget', 'red widget', 'widget prices'],
      targetDomain: 'example.com',
      countryCode: 'GB',
      languageCode: 'en',
      limit: 25,
    },
    interpretation: [
      'Review unknown domains before selecting competitors. A publisher or directory may reveal search intent without competing for the same customer.',
      'Use matched keyword coverage to choose a small relevant set, not to claim complete market share.',
    ],
    caveats: [
      'The result describes the supplied country-level keyword set, not the whole market or a local pack.',
      'Visibility and traffic are provider calculations, not measured audience or sales.',
    ],
    nextSteps: [
      'Classify unknown domains as business, publisher, directory, community, or marketplace.',
      'Run ranking pages for relevant domains.',
      'Run competitor keyword gap only after excluding irrelevant site types.',
    ],
    related: ['ranking-pages', 'competitor-keyword-gap', 'serp-results'],
    sources: [
      'domain-provider-competitors',
      'local-research-files',
      'serp-provider-results',
    ],
  },
  {
    id: 'competitor-keyword-gap',
    name: 'Competitor keyword gaps',
    category: 'opportunities',
    summary:
      "Compare up to three explicit competitors with retained Search Console themes, the site's provider footprint, and repeated ranking-page patterns.",
    question:
      'Which competitor terms remain plausible opportunities after checking existing first-party and provider coverage?',
    useWhen: [
      'You have classified a small set of relevant competitors.',
      'You want existing Search Console coverage and provider-observed ranks removed from a possible gap list.',
      'You need pSEO pattern evidence and a bounded data-source research brief for plausible template ideas.',
      'You have separate local ranked-keyword exports for the site and up to three competitors.',
    ],
    avoidWhen: [
      'You want every competitor keyword presented as relevant or missing from the site.',
      'You have not checked whether the competitors and keyword market match the site purpose.',
    ],
    evidence: [
      'Bounded ranked-keyword rows for the site and up to three explicit competitor domains.',
      'Up to 100,000 Search Console query and page rows, aggregated and indexed for bounded lexical theme matching.',
      'Exact first-party coverage, own provider ranks, repeated competitor page patterns, provider costs, source failures, and row caps.',
    ],
    methodology: [
      'Classifies each term as already observed first party, already ranked by the provider, a relevant gap candidate, or an unverified competitor term.',
      'Requires retained first-party theme overlap plus either several compared domains or a top-10 competitor rank before calling a term a relevant candidate.',
      'Uses bounded token indexes and deterministic ordering instead of nested full-dataset scans.',
      'Suggests existing-template review or new-template research only when structural evidence supports it. Each new-template idea includes a data-source brief.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      competitors: [
        { domain: 'competitor-one.example', siteType: 'business' },
        { domain: 'competitor-two.example', siteType: 'business' },
      ],
      countryCode: 'GB',
      languageCode: 'en',
      maxRank: 20,
      limitPerDomain: 100,
      candidateLimit: 50,
    },
    interpretation: [
      'Review relevant candidates first, then reject terms whose intent, current results, or audience do not fit the site.',
      'Treat pSEO suggestions as research prompts. Confirm source rights, stable identifiers, fields, coverage, freshness, missing-value behavior, and distinct page value before building anything.',
    ],
    caveats: [
      'Search Console absence means not found in retained rows. It does not prove zero impressions, no ranking, or no page coverage.',
      'Lexical overlap and URL patterns do not prove demand, intent, page quality, or that a scalable template should exist.',
      'Provider ranks, volume, difficulty, intent, and traffic are country-level estimates that need a current result check.',
    ],
    nextSteps: [
      'Inspect current results for shortlisted terms.',
      'Compare representative competitor and first-party pages.',
      'Complete the returned data-source brief before approving a new programmatic template family.',
    ],
    related: ['serp-competitors', 'ranking-pages', 'keyword-opportunities'],
    sources: [
      'domain-provider-keywords',
      'domain-provider-pages',
      'local-research-files',
      'search-analytics',
    ],
  },
] as const satisfies readonly ReportEditorial[]
