import type { ReportGuidance } from './report-guidance.js'

export const REPORT_GUIDANCE_PSEO = {
  'pseo-audit': {
    name: 'Programmatic SEO audit',
    description:
      'Review repeated page templates using search demand, crawl evidence, and optional Google index checks.',
    useWhen: [
      'A site publishes many pages from repeatable templates.',
      'You need to compare template groups before expanding or pruning them.',
    ],
    avoidWhen: [
      'You want every repeated path labelled as spam or thin content.',
      'There are too few pages to compare as a template group.',
    ],
    outcome:
      'Template-level demand, quality, and index evidence with representative URLs.',
  },
  'pseo-patterns': {
    name: 'Programmatic SEO patterns',
    description:
      'Find repeatable search patterns in Search Console, then review bounded term, pair, or matrix sets supplied as product strategy.',
    useWhen: [
      'You want to see which repeatable query patterns already appear in first-party search data.',
      'You have a known comparison, utility, location, integration, template, or other structured set to check.',
      'You need strategic coverage gaps kept separate from observed search demand.',
    ],
    avoidWhen: [
      'You only need to audit the quality and index state of pages that already exist.',
      'You want generated copy, automatic page creation, deployment, or traffic forecasts.',
    ],
    outcome:
      'Observed query-pattern evidence and a bounded review queue for declared programmatic topics, with coverage, overlap, inventory, and optional provider evidence kept separate.',
  },
  'pseo-opportunities': {
    name: 'Programmatic SEO opportunities',
    description:
      'Combine repeated template and query-cluster evidence with optional keyword discovery, live results, competitor URL patterns, and data-source research briefs.',
    useWhen: [
      'You want to expand a template that already earns impressions without treating every related keyword as a new page.',
      'You need to separate extensions of an observed template from research for a possible new template.',
      'Current result pages and repeated competitor URL patterns would change the programmatic SEO decision.',
    ],
    avoidWhen: [
      'You only need to audit the current technical and index state of existing templates.',
      'You want external provider calls made without explicit market, cost, and result limits.',
    ],
    outcome:
      'A bounded research queue that keeps first-party templates, provider estimates, live results, competitor patterns, costs, and data-source checks separate.',
  },
} as const satisfies Record<string, ReportGuidance>
