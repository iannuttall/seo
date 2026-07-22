import type { ReportGuidance } from './report-guidance.js'

export const REPORT_GUIDANCE_DOMAIN_RESEARCH = {
  'competitor-keyword-gap': {
    name: 'Competitor keyword gaps',
    description:
      "Compare a small explicit competitor set with Search Console themes, the site's provider footprint, and repeated ranking-page patterns.",
    useWhen: [
      'You have already identified relevant competitors and want a bounded opportunity review.',
      'You want to separate existing coverage from plausible new keyword or programmatic template research.',
      'You have one ranked-keyword export containing the site and compared competitor domains but no connected provider API.',
    ],
    avoidWhen: [
      'You have not classified whether the compared domains are relevant to the business and search intent.',
      'You want every competitor keyword treated as a content gap.',
    ],
    outcome:
      'A classified keyword set with first-party overlap, provider coverage, pSEO patterns, and bounded data-source briefs.',
  },
  'domain-overview': {
    name: 'Domain search footprint',
    description:
      "Review a country-level estimate of a domain's organic footprint beside optional owner-verified Search Console totals.",
    useWhen: [
      'You need a quick independent footprint before deeper competitor or page research.',
      'You want provider estimates and matching first-party performance shown with clear boundaries.',
    ],
    avoidWhen: [
      'You need live rankings for a particular place or device.',
      'You want estimated traffic presented as measured site traffic.',
    ],
    outcome:
      'A bounded domain estimate with ranking distribution, source coverage, cost, and an optional Search Console comparison.',
  },
  'ranked-keywords': {
    name: 'Ranked keyword footprint',
    description:
      'Review a bounded set of provider-observed keywords, ranking pages, result types, and optional matching Search Console evidence.',
    useWhen: [
      'You need the keyword rows behind a site, competitor, or page footprint.',
      'You want to check provider-only rows against retained first-party query evidence for a site you own.',
      'You have a DataForSEO, Semrush or Ahrefs ranked-keyword export instead of API access.',
    ],
    avoidWhen: [
      'You need a current exact rank for one query, place, and device.',
      'You want an absent Search Console row treated as proof of no impressions.',
    ],
    outcome:
      'Bounded keyword and ranking-page rows with filters, pagination, estimates, and first-party match states.',
  },
  'ranking-pages': {
    name: 'Ranking pages and patterns',
    description:
      "Find a domain's bounded ranking-page footprint and repeated URL patterns, with optional matching Search Console page evidence.",
    useWhen: [
      "You want to see which pages account for a domain's estimated organic footprint.",
      'You are researching competitor or first-party programmatic page families.',
      'You want to group a local ranked-keyword export into pages and repeated URL patterns.',
    ],
    avoidWhen: [
      'You plan to infer page quality or intent from URL structure alone.',
      'You need a complete inventory beyond the provider page cap.',
    ],
    outcome:
      'Ranking-page estimates, repeated path patterns, representative URLs, and first-party page matches.',
  },
  'serp-competitors': {
    name: 'Search competitors',
    description:
      'Identify domains that repeatedly appear across an explicit keyword set while keeping unknown site types unclassified.',
    useWhen: [
      'You want to discover search competitors before selecting domains for deeper research.',
      'You need to separate a target, declared competitors, and other recurring result domains.',
      'You have a multi-domain ranked-keyword export covering the supplied keyword set.',
    ],
    avoidWhen: [
      'You have only one query or need a local, device-specific live snapshot.',
      'You want recurring publishers or directories assumed to be business competitors.',
    ],
    outcome:
      'A bounded competitor set with query coverage, visibility estimates, declared classifications, and unknowns left explicit.',
  },
} as const satisfies Record<string, ReportGuidance>
