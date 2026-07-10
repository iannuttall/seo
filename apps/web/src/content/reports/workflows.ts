import type { ReportEditorial } from './types'

export const workflowReports = [
  {
    id: 'workflow-diagnose-property',
    name: 'Property diagnosis workflow',
    category: 'workflows',
    summary:
      'Run the broad property diagnosis and return a short sequence of evidence-backed follow-up actions for an agent.',
    question:
      'What should an agent investigate first across this Search Console property?',
    useWhen: [
      'An agent is starting with little context.',
      'You want discovery, diagnosis, and next actions in one bounded workflow.',
    ],
    avoidWhen: [
      'A known page or rule already defines the job. A focused report will use less data.',
    ],
    evidence: [
      'The property diagnosis sections, source coverage, skipped reasons, ranked findings, and generated follow-up commands.',
    ],
    methodology: [
      'Runs the shared diagnosis, then selects a small number of follow-ups from supported structured findings.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      limit: 10,
      includeBrand: false,
    },
    interpretation: [
      'Check source completeness, then follow the first command whose evidence is strong enough to change the decision.',
    ],
    caveats: [
      'The workflow cannot recover unavailable provider data or explain a movement without supporting evidence.',
    ],
    nextSteps: [
      'Run one recommended focused report.',
      'Use a crawl when live technical verification is required.',
    ],
    related: ['diagnose-property', 'crawl-site', 'workflow-refresh-priorities'],
    sources: ['search-analytics'],
  },
  {
    id: 'workflow-monthly-report',
    name: 'Monthly reporting workflow',
    category: 'workflows',
    summary:
      'Produce the monthly report and a bounded action list so an agent can move from reporting to useful follow-up work.',
    question:
      'What happened this month and which supported actions should follow?',
    useWhen: [
      'A repeatable monthly review should end with a small action queue.',
      'The requested month has finalised data.',
    ],
    avoidWhen: [
      'You need a real-time dashboard or a custom attribution analysis.',
    ],
    evidence: [
      'The shared monthly report, comparison periods, opportunities, caveats, and generated next commands.',
    ],
    methodology: [
      'Runs the monthly report contract and chooses follow-ups only from returned evidence.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      month: '2026-05',
      limit: 10,
      includeBrand: false,
    },
    interpretation: [
      'Read coverage before the narrative. Treat follow-ups as an ordered investigation plan rather than automatic fixes.',
    ],
    caveats: [
      'A calendar summary can hide daily volatility and does not establish why metrics changed.',
    ],
    nextSteps: [
      'Run the leading focused report.',
      'Store the output for a consistent comparison next month.',
    ],
    related: ['monthly-report', 'report-narrative', 'measure-change'],
    sources: ['search-analytics'],
  },
  {
    id: 'workflow-refresh-priorities',
    name: 'Refresh priorities workflow',
    category: 'workflows',
    summary:
      'Combine supported decay, visibility, CTR, query-overlap, and diagnosis signals into one practical review queue.',
    question:
      'Which existing pages deserve refresh or investigation attention first?',
    useWhen: [
      'A content team needs one queue assembled from several first-party evidence types.',
      'You can inspect the live pages before deciding to edit.',
    ],
    avoidWhen: [
      'You want publication age or word count to decide which pages get rewritten.',
    ],
    evidence: [
      'Decay, striking-distance, quick-win, query-overlap, and property-diagnosis results with their individual provenance.',
    ],
    methodology: [
      'Normalizes supported candidates, preserves their source report and caveats, then ranks a bounded queue deterministically.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      limit: 10,
      includeBrand: false,
      verifyContent: true,
      verifyLimit: 5,
    },
    interpretation: [
      'Open the source evidence for each item. A page appearing in several reports can deserve review, but the signals may share the same underlying rows.',
    ],
    caveats: [
      'Combined signals are prioritisation evidence, not additive traffic forecasts or proof that a rewrite is needed.',
    ],
    nextSteps: [
      'Audit the highest-supported page.',
      'Record and measure any material change.',
    ],
    related: ['audit-page', 'content-optimization', 'measure-change'],
    sources: ['search-analytics'],
  },
  {
    id: 'workflow-technical-watch',
    name: 'Technical watch workflow',
    category: 'workflows',
    summary:
      'Run crawl-change and index-state monitoring together so an agent can separate live regressions from Google snapshot changes.',
    question:
      'Did important technical or indexed-state evidence regress since the last monitoring run?',
    useWhen: [
      'A scheduled technical check needs crawl and URL Inspection evidence in one workflow.',
      'The crawl scope, sitemap, and quota are intentionally bounded.',
    ],
    avoidWhen: [
      'You do not have a comparable crawl baseline or enough URL Inspection quota for the selected sample.',
    ],
    evidence: [
      'Crawl diff results, bounded URL Inspection monitoring, prior snapshots, optional link-recovery evidence, and operational failures.',
    ],
    methodology: [
      'Runs the shared monitoring reports independently, then merges supported regressions and follow-ups without turning one missing section into a failure.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      startUrl: 'https://example.com/',
      sitemaps: ['https://example.com/sitemap.xml'],
      limit: 250,
      dailyLimit: 200,
      inspectLimit: 25,
      recoverLinks: true,
    },
    interpretation: [
      'Start with operational failures, then distinguish live crawl changes from indexed-snapshot changes. Verify intent before fixing directives or canonicals.',
    ],
    caveats: [
      'Neither a bounded crawl nor sampled URL Inspection provides complete site coverage.',
    ],
    nextSteps: [
      'Audit representative regressions directly.',
      'Compare the next run with the same scope.',
    ],
    related: ['crawl-diff', 'index-watch', 'link-recover'],
    sources: ['url-inspection', 'sitemaps', 'robots'],
  },
  {
    id: 'workflow-update-postmortem',
    name: 'Google update postmortem',
    category: 'workflows',
    summary:
      'Inspect winners, losers, page evidence, and known confounders around a confirmed Google ranking update window.',
    question:
      'What changed across this property during the update window, and what can the evidence support?',
    useWhen: [
      'Property movement overlaps a confirmed update and needs a careful segment review.',
      'Known launches, migrations, or tracking changes can be recorded as confounders.',
    ],
    avoidWhen: [
      'You need proof that the update caused a particular page movement or a generic recovery checklist.',
    ],
    evidence: [
      'Official update dates, property anomaly evidence, segment winners and losers, optional change log, page checks, and supplied confounders.',
    ],
    methodology: [
      'Anchors analysis to the confirmed window, compares supported segments, keeps coincident site changes visible, and returns bounded investigation actions.',
    ],
    exampleParams: {
      site: 'sc-domain:example.com',
      days: 90,
      recentDays: 7,
      limit: 10,
      includeBrand: false,
      knownConfounders: ['Site migration on 2026-05-12'],
      includeChangeLog: true,
    },
    interpretation: [
      'Look for repeated page or intent patterns across winners and losers, then verify representative pages. Timing overlap is context, not causation.',
    ],
    caveats: [
      'Update rollouts, seasonality, demand, competitors, and site releases overlap. Search Console evidence cannot isolate them perfectly.',
    ],
    nextSteps: [
      'Audit representative winner and loser pages.',
      'Record any deliberate response and measure it over a complete later window.',
    ],
    related: ['update-correlate', 'segment-impact', 'measure-change'],
    sources: ['google-updates', 'search-analytics'],
  },
] as const satisfies readonly ReportEditorial[]
