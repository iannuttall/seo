import type { ReportEditorial } from './types'

export const aiSearchReports = [
  {
    id: 'ai-referrals',
    name: 'AI referral traffic',
    category: 'ai-search',
    summary:
      'Find sessions that GA4 attributed to known AI referral sources, with the source and date scope kept visible.',
    question:
      'Which AI products sent referral sessions recorded by this GA4 property?',
    useWhen: [
      'You need observed referral evidence rather than an AI visibility estimate.',
      'The GA4 property and date range are known.',
    ],
    avoidWhen: [
      'You need every AI mention or citation. Many products and journeys do not pass a usable referrer.',
    ],
    evidence: [
      'GA4 session-scoped traffic source dimensions and metrics matched to documented AI referral source definitions.',
    ],
    methodology: [
      'Filters returned acquisition rows by explicit source rules, aggregates matches, and keeps unclassified traffic out of the AI total.',
    ],
    exampleParams: {
      property: '123456789',
      startDate: '28daysAgo',
      endDate: 'yesterday',
      maxRows: 25,
    },
    interpretation: [
      'Treat returned sessions as attributed referrals from the matched sources. Review landing pages and engagement in the same scope.',
    ],
    caveats: [
      'Missing referrers, consent, redirects, attribution settings, and source changes can hide or reclassify visits.',
    ],
    nextSteps: [
      'Inspect the landing pages receiving useful referral traffic.',
      'Use a stable prompt corpus if you separately monitor citations or answers.',
    ],
    related: ['page-opportunities', 'seo-to-ai-query', 'ai-readiness'],
    sources: ['ga4-acquisition'],
  },
  {
    id: 'community-intent',
    name: 'Community-intent queries',
    category: 'ai-search',
    summary:
      'Surface returned searches containing explicit review, comparison, forum, recommendation, or experience wording.',
    question:
      'Which observed search queries suggest that people want opinions, comparisons, or lived experience?',
    useWhen: [
      'You need first-party wording to review community or evidence-led content opportunities.',
      'A repeatable phrase classifier is useful as a starting filter.',
    ],
    avoidWhen: [
      'You need proof of intent from every query or evidence of demand inside an AI product.',
    ],
    evidence: [
      'Returned Search Console queries and metrics that match the report’s explicit phrase categories.',
    ],
    methodology: [
      'Classifies query text with documented rules, preserves unmatched rows outside the result, and ranks eligible evidence consistently.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      minImpressions: 20,
      limit: 25,
    },
    interpretation: [
      'Read the actual query and current results. The category is a review hypothesis, not a complete intent model.',
    ],
    caveats: [
      'Query wording can be ambiguous, lower-volume queries may be anonymised, and phrase lists cannot capture every expression.',
    ],
    nextSteps: [
      'Decide whether an existing page already answers the need with credible first-hand evidence.',
      'Use content optimization for a supported page brief.',
    ],
    related: ['content-optimization', 'query-clusters', 'page-opportunities'],
    sources: ['search-analytics'],
  },
  {
    id: 'content-optimization',
    name: 'Content optimization brief',
    category: 'ai-search',
    summary:
      'Build a focused edit brief for one URL from its own search visibility and the content observed on the live page.',
    question:
      'What evidence-backed improvements should this existing page be reviewed for?',
    useWhen: [
      'One page has Search Console visibility and needs a careful content or snippet review.',
      'You want technical conflicts separated from content ideas.',
    ],
    avoidWhen: [
      'You plan to force every query phrase onto the page or expand content to satisfy a score.',
    ],
    evidence: [
      'Exact-URL Search Console query rows, fetched metadata and headings, page text, links, and technical observations.',
    ],
    methodology: [
      'Classifies returned query wording with broad heuristics, verifies the live page when requested, and turns supported gaps into limited review actions.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      url: 'https://example.com/guides/seo',
      days: 90,
      limit: 20,
      minImpressions: 50,
      verifyContent: true,
    },
    interpretation: [
      'Resolve contradictory technical evidence first. Treat content gaps, intent labels, scores, and estimated lift as review heuristics rather than mandates or forecasts.',
    ],
    caveats: [
      'Search queries do not prove why a page ranks, and a fetch may differ from the version Google indexed or a user saw.',
    ],
    nextSteps: [
      'Make one clear, user-serving change and record it.',
      'Measure the result after a complete comparison window.',
    ],
    related: ['audit-page', 'page-opportunities', 'measure-change'],
    sources: ['search-analytics', 'javascript', 'canonical'],
  },
  {
    id: 'page-opportunities',
    name: 'Page opportunities',
    category: 'ai-search',
    summary:
      'Show the first-party search opportunities attached to one URL, then verify the page before recommending work.',
    question:
      'Which returned query opportunities are associated with this page?',
    useWhen: [
      'A specific URL needs a compact opportunity view before deeper editing.',
      'You need the query evidence and page verification state together.',
    ],
    avoidWhen: [
      'The URL has no meaningful Search Console history or belongs outside the selected property.',
    ],
    evidence: [
      'Exact-page Search Console rows with optional fetched content and technical checks.',
    ],
    methodology: [
      'Filters and ranks returned query rows for the target URL, records source completeness, and keeps unverified content conclusions out of the result.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      url: 'https://example.com/pricing',
      days: 90,
      limit: 15,
      minImpressions: 40,
      verifyContent: true,
    },
    interpretation: [
      'Read query metrics alongside verification and technical state. A high-impression row can still be the wrong intent for the page.',
    ],
    caveats: [
      'The report only sees returned Search Console rows for the exact page scope and selected dates.',
    ],
    nextSteps: [
      'Use content optimization when the page needs a fuller brief.',
      'Use internal link candidates when discovery paths are the clearest supported gap.',
    ],
    related: ['content-optimization', 'internal-links', 'audit-page'],
    sources: ['search-analytics'],
  },
  {
    id: 'performance-audit',
    name: 'Performance audit',
    category: 'ai-search',
    summary:
      'Combine one local Lighthouse lab run with optional device-specific CrUX field evidence without mixing the two.',
    question:
      'What does lab diagnosis and available field data say about this URL’s performance?',
    useWhen: [
      'A page needs LCP, INP, CLS, TBT, or loading diagnostics.',
      'You can reproduce the tested URL and device strategy.',
    ],
    avoidWhen: [
      'You want to infer sitewide user experience from one URL or rename lab TBT as field INP.',
    ],
    evidence: [
      'A controlled local Lighthouse navigation and optional CrUX p75 field metrics for the URL or origin.',
    ],
    methodology: [
      'Keeps lab, field, unavailable, and fetch-fallback states separate and reports the device, collection scope, and thresholds used.',
    ],
    exampleParams: {
      url: 'https://example.com/',
      strategy: 'mobile',
      refresh: true,
    },
    interpretation: [
      'Prefer applicable field evidence for real-user experience. Use lab insights to reproduce and diagnose, then verify changes in both contexts.',
    ],
    caveats: [
      'CrUX may have no coverage. A Lighthouse run varies with the machine, network, page state, and loaded third parties.',
    ],
    nextSteps: [
      'Fix the returned bottleneck with the strongest evidence and rerun under the same conditions.',
      'Check representative templates rather than assuming one page describes the whole site.',
    ],
    related: ['audit-page', 'site-crawl', 'measure-change'],
    sources: ['core-web-vitals'],
  },
  {
    id: 'seo-to-ai-query',
    name: 'Search queries to AI prompts',
    category: 'ai-search',
    summary:
      'Turn observed Search Console query wording into a stable prompt seed set for separate AI-answer monitoring.',
    question:
      'Which reproducible prompts can be derived from the searches already associated with this site?',
    useWhen: [
      'You need a limited prompt corpus whose source queries and dates remain attached.',
      'Repeatable templates matter more than creative prompt generation.',
    ],
    avoidWhen: [
      'You need evidence that people use those prompts in AI products or that the site appears in answers.',
    ],
    evidence: [
      'Returned Search Console query wording and metrics from the selected property and date range.',
    ],
    methodology: [
      'Applies stable prompt templates to eligible source queries, preserves source completeness, and bounds both retrieval and output.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      limit: 20,
      minImpressions: 100,
      maxRows: 10000,
    },
    interpretation: [
      'Use the prompts as monitoring inputs. Store each source query and date range beside later observations so the corpus remains auditable.',
    ],
    caveats: [
      'Generated prompts are not observed AI demand, citation evidence, or traffic estimates.',
    ],
    nextSteps: [
      'Choose representative variants and monitor them on a controlled schedule.',
      'Use AI referrals separately for observed GA4 referral evidence.',
    ],
    related: ['ai-referrals', 'community-intent', 'ai-readiness'],
    sources: ['search-analytics', 'ai-features'],
  },
] as const satisfies readonly ReportEditorial[]
