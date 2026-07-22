import type { ReportEditorial } from './types'

export const aiSearchReports = [
  {
    id: 'ai-mention-research',
    name: 'AI mention research',
    category: 'ai-search',
    summary:
      'Compare provider-indexed mentions, cited domains, and bounded question samples for one AI surface and market, with optional Search Console overlap.',
    question:
      'Where does a named target appear in provider-indexed AI answers, and which observed questions overlap with existing search demand?',
    useWhen: [
      'You need mention and citation evidence beyond referral traffic or technical eligibility.',
      'You want one target and a small named competitor set measured in the same provider dataset.',
      'You want to compare bounded AI question samples with retained Search Console queries before planning content or a programmatic template.',
    ],
    avoidWhen: [
      'You need the answer returned by a fixed prompt right now. Use ai-prompt-observations with the exact surface, model, market label, time, answer, and citations instead.',
      'You need a complete census, a universal visibility score, sentiment, or proof that an AI product never mentions a target.',
    ],
    evidence: [
      'DataForSEO LLM Mentions metrics, cited source domains, and bounded question samples for the exact surface, location, and language.',
      'Optional retained Search Console query and landing-page rows for a property you own.',
    ],
    methodology: [
      'Makes one metrics request and, by default, one sample request. It keeps provider values, source coverage, cache state, cost, and warnings intact.',
      'Calculates comparison share only within the supplied targets, marks citations from an optional owned domain, and applies a bounded lexical overlap heuristic to optional Search Console rows.',
      'Turns repeated sample terms into research briefs with data rights, field quality, page value, and scale checks instead of recommending pages automatically.',
    ],
    exampleParams: {
      target: { label: 'Example Analytics', aliases: ['Example'] },
      competitors: [{ label: 'Competitor Cloud' }],
      domain: 'example.com',
      surface: 'google-ai-overview',
      countryCode: 'GB',
      languageCode: 'en',
      location: { code: 2826 },
      site: 'sc-domain:example.com',
      sampleLimit: 10,
    },
    interpretation: [
      'Read source status, coverage, observation time, cache, cost, and warnings first. Then compare target metrics, retained questions, citations, and first-party overlap without blending them into one score.',
    ],
    caveats: [
      'Provider-indexed records are not live prompt observations or a complete census. Search Console overlap is lexical and bounded, so a match does not prove shared intent and no match does not prove a gap.',
    ],
    nextSteps: [
      'Inspect cited pages and current results for the questions that would change a decision.',
      'Use ai-prompt-observations for a small stable question set before making claims about current answers.',
      'Check existing pages, source rights, useful variation, and representative records before expanding a programmatic template.',
    ],
    related: [
      'seo-to-ai-query',
      'ai-prompt-observations',
      'ai-referrals',
      'pseo-opportunities',
      'content-optimization',
    ],
    sources: ['ai-mention-provider', 'search-analytics'],
  },
  {
    id: 'ai-prompt-observations',
    name: 'AI prompt observations',
    category: 'ai-search',
    summary:
      'Run a small fixed set of prompts against exact current AI models, retain answers and citations locally, and compare only like-for-like observations.',
    question:
      'What did these exact AI models return for a fixed prompt set now, and what changed under the same collection settings?',
    useWhen: [
      'You need the current answer, mentions, or citations for a small decision-critical prompt set.',
      'You want repeatable observations across ChatGPT, Claude, Gemini, or Perplexity with exact model versions and costs.',
      'You want to compare the supporting searches reported for an answer with retained Search Console demand before investigating content or programmatic templates.',
    ],
    avoidWhen: [
      'You need a universal visibility score, an assistant ranking, or proof that a target never appears.',
      'You need broad provider-indexed mention research rather than a maximum of 20 live answer requests.',
    ],
    evidence: [
      'DataForSEO response evidence for each exact prompt, surface, chosen model, model the provider actually ran, market label, web-search setting, and collection time.',
      'Optional retained Search Console query and landing-page rows for a property you own.',
      'Earlier local observations with the same comparison key.',
    ],
    methodology: [
      'Checks the free current model catalog before paid work, then runs no more than five prompts across four explicit models with concurrency capped at four.',
      'Stores bounded answers, citations, supporting searches returned as fan-out queries, provider task ids, cache state, token use, base-price estimates, and exact returned task costs locally.',
      'Compares only fresh, complete, untruncated observations with the same provider, prompt, requested and effective model, market label, web-search setting, and output-token limit.',
      'Matches named targets and domains, then applies bounded word and phrase matching to supporting-search themes and optional Search Console rows without turning them into demand or page recommendations.',
    ],
    exampleParams: {
      prompts: [
        {
          id: 'analytics-tools',
          group: 'commercial',
          prompt:
            'Which privacy-friendly analytics tools suit a small publisher?',
        },
      ],
      models: [{ surface: 'chatgpt', model: 'current-model-name' }],
      target: {
        label: 'Example Analytics',
        aliases: ['Example'],
        domains: ['example.com'],
      },
      competitors: [{ label: 'Competitor Cloud' }],
      countryCode: 'GB',
      languageCode: 'en',
      site: 'sc-domain:example.com',
    },
    interpretation: [
      'Read data status, source coverage, warnings, cache state, effective model, citations, exact returned cost, and first-party status before reading target matches or change findings.',
      'Treat every answer as one observation under its recorded configuration. A missing mention applies only to that retained sample.',
    ],
    caveats: [
      'The market and language label separates each fixed prompt set, but the provider does not expose the same location or language controls on every AI surface. Prompt wording remains the direct language instruction.',
      'Supporting-search themes and Search Console word matches are bounded research leads. They do not prove shared intent, independent demand, a content gap, or the value of a programmatic template.',
    ],
    nextSteps: [
      'Inspect the full answer, citations, effective model, cache state, and cost before acting on a target match.',
      'Validate repeated themes with keyword metrics, current search results, and existing page evidence.',
      'Check source rights, stable identifiers, field coverage, missing values, useful variation, and representative output before scaling a programmatic template.',
      'Repeat only prompts that matter, using the same exact configuration. Start a new baseline when the effective model changes.',
    ],
    related: [
      'ai-mention-research',
      'seo-to-ai-query',
      'keyword-metrics',
      'serp-results',
      'pseo-opportunities',
      'ai-referrals',
    ],
    sources: ['ai-prompt-provider', 'search-analytics'],
  },
  {
    id: 'ai-referrals',
    name: 'AI referral traffic',
    category: 'ai-search',
    summary:
      'Find sessions that Google Analytics attributed to known AI referral sources, with the source and date scope kept visible.',
    question:
      'Which AI products sent referral sessions recorded by this Google Analytics property?',
    useWhen: [
      'You need observed referral evidence rather than an AI visibility estimate.',
      'The Google Analytics property and date range are known.',
    ],
    avoidWhen: [
      'You need every AI mention or citation. Many products and journeys do not pass a usable referrer.',
    ],
    evidence: [
      'Google Analytics session-scoped traffic source dimensions and metrics matched to documented AI referral source definitions.',
    ],
    methodology: [
      'Filters returned acquisition rows by explicit source rules, aggregates matches, and keeps unclassified traffic out of the AI total.',
    ],
    exampleParams: {
      property: '123456789',
      startDate: '28daysAgo',
      endDate: 'yesterday',
      resultLimit: 25,
    },
    interpretation: [
      'Treat returned sessions as attributed referrals from the matched sources. Check the landing-page selection before treating the ranked output as the full retained breakdown, then review those pages and engagement in the same scope.',
    ],
    caveats: [
      'Missing referrers, consent, redirects, attribution settings, and source changes can hide or reclassify visits.',
    ],
    nextSteps: [
      'Inspect the landing pages receiving useful referral traffic.',
      'Use a stable prompt corpus if you separately monitor citations or answers.',
    ],
    related: ['page-opportunities', 'seo-to-ai-query', 'ai-readiness'],
    sources: ['google-analytics-acquisition'],
  },
  {
    id: 'ai-search-scorecard',
    name: 'AI search scorecard',
    category: 'ai-search',
    summary:
      "Turn one crawl into a 0-100 heuristic score over this tool's own AI-search checks, with observed evidence, unknown states, and a partial flag kept separate.",
    question:
      "How do this tool's own AI-search technical checks summarise into a single scored read of one crawl?",
    useWhen: [
      'You want a compact scored summary of the AI-search evidence the crawler already collects.',
      'You need per-check pass, warn, fail, or unknown states with the exact weights and formula.',
    ],
    avoidWhen: [
      'You want a Google or AI-engine eligibility verdict, a ranking prediction, or proof of citations.',
      'You need per-page fixes rather than a scored overview.',
    ],
    evidence: [
      'Crawl responses, start-URL robots policy for AI crawler tokens, indexability, HTTPS, structured data and JSON-LD validity, entity and sameAs signals, and opening-content structure.',
    ],
    methodology: [
      'Scores only the checks with known evidence, weights them, and normalises to 0-100, so unknown checks are excluded rather than counted as failures, and a partial or incomplete crawl cannot reach a clean 100.',
    ],
    exampleParams: { reportId: 'crawl_example_20260710' },
    interpretation: [
      "Read the partial flag, the excluded list, and each check before the number. The score is this tool's own heuristic summary, not a search-engine requirement or a visibility verdict.",
    ],
    caveats: [
      'A blocked AI crawler token can be an intentional publisher choice, and the score never proves indexing, selection, citation, ranking, or traffic.',
    ],
    nextSteps: [
      'Open AI search readiness for the underlying access and structure evidence.',
      'Use entity readiness or Google AI search controls for focused follow-up.',
    ],
    related: ['ai-readiness', 'geo-gaps', 'entity-readiness'],
    sources: ['ai-features', 'robots', 'robots-meta', 'structured-data'],
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
      'Use AI referrals separately for observed Google Analytics referral evidence.',
    ],
    related: ['ai-referrals', 'community-intent', 'ai-readiness'],
    sources: ['search-analytics', 'ai-features'],
  },
] as const satisfies readonly ReportEditorial[]
