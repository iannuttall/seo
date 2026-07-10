import type { ReportEditorial } from './types'

export const experimentReports = [
  {
    id: 'measure-change',
    name: 'Measure an SEO change',
    category: 'experiments',
    summary:
      'Compare equal, finalised Search Console windows around a recorded change without pretending that timing proves causation.',
    question:
      'What changed in the measured search evidence after this specific site change?',
    useWhen: [
      'A title, template, internal-link, migration, or content change has a clear deployment date.',
      'You can wait for a complete after-window that matches the before-window.',
    ],
    avoidWhen: [
      'The after period is incomplete or major unrelated events make the comparison meaningless.',
      'You need a causal experiment. This is an observational before-and-after measurement.',
    ],
    evidence: [
      'Matched Search Console windows for the selected page, query, or site scope.',
      'Optional GA4 and saved control-group evidence when those inputs exist.',
    ],
    methodology: [
      'Uses adjacent equal-length finalised windows, preserves missing and partial states, and keeps control evidence separate from the measured target.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      scope: 'page',
      target: 'https://example.com/page',
      title: 'Updated page title',
      changedAt: '2026-05-01',
      beforeDays: 28,
      afterDays: 28,
    },
    interpretation: [
      'Read coverage and confounders before percentage changes. A movement is evidence to investigate, not proof that the recorded change caused it.',
    ],
    caveats: [
      'Seasonality, ranking updates, releases, demand shifts, and attribution changes can all move the same metrics.',
      'Rows absent from one returned window are not silently converted to zero.',
    ],
    nextSteps: [
      'Keep the change if the evidence and page quality support it, or plan a measured reversal.',
      'Use segment impact when you need to locate which pages or queries moved.',
    ],
    related: ['segment-impact', 'traffic-anomaly', 'narrative-report'],
    sources: ['search-analytics'],
  },
] as const satisfies readonly ReportEditorial[]
