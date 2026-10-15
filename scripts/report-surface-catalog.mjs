const opt = (name, cli, mcp, core = name) => ({ name, cli, mcp, core })

const common = {
  site: opt('site', 'site:', 'site: z.string()'),
  days: opt('days', 'days:', 'days: z.number().optional()'),
  recentDays: opt('recentDays', 'recent:', 'recentDays: z.number().optional()'),
  limit: opt('limit', 'limit:', 'limit: z.number().optional()'),
  checkLimit: opt(
    'checkLimit',
    "'check-limit':",
    'checkLimit: z.number().optional()',
  ),
  includeBrand: opt(
    'includeBrand',
    "'include-brand':",
    'includeBrand: z.boolean().optional()',
  ),
  refresh: opt('refresh', 'refresh:', 'refresh: z.boolean().optional()'),
  js: opt('js', 'js:', 'js: z.boolean().optional()'),
  verifyContent: opt(
    'verifyContent',
    "'verify-content':",
    'verifyContent: z.boolean().optional()',
  ),
  verifyLimit: opt(
    'verifyLimit',
    "'verify-limit':",
    'verifyLimit: z.number().optional()',
  ),
  minImpressions: opt(
    'minImpressions',
    "'min-impressions':",
    'minImpressions: z.number().optional()',
  ),
  brandTerms: opt('brandTerms', "'brand-terms':", 'brandTerms: z'),
  fetchConcurrency: opt(
    'fetchConcurrency',
    "'fetch-concurrency':",
    'fetchConcurrency: z.number().optional()',
    false,
  ),
  fetchIntervalCap: opt(
    'fetchIntervalCap',
    "'fetch-interval-cap':",
    'fetchIntervalCap: z.number().optional()',
    false,
  ),
  fetchIntervalMs: opt(
    'fetchIntervalMs',
    "'fetch-interval-ms':",
    'fetchIntervalMs: z.number().optional()',
    false,
  ),
  sitemaps: opt('sitemaps', 'sitemaps:', 'sitemaps: z.array(z.string().url())'),
  properties: opt(
    'properties',
    'properties:',
    'properties: z.array(z.string())',
  ),
  dailyLimit: opt('dailyLimit', "'daily-limit':", 'dailyLimit: z.number()'),
  inspectLimit: opt(
    'inspectLimit',
    "'inspect-limit':",
    'inspectLimit: z.number()',
  ),
  maxUrls: opt('maxUrls', "'max-urls':", 'maxUrls: z.number()'),
  languageCode: opt('languageCode', 'language:', 'languageCode: z.string()'),
}

const fetchOptions = [
  common.verifyContent,
  common.verifyLimit,
  common.includeBrand,
  common.js,
  common.fetchConcurrency,
  common.fetchIntervalCap,
  common.fetchIntervalMs,
  common.refresh,
]

export const reportSurfaces = [
  {
    id: 'ai-referrals',
    core: 'aiReferralsReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/ai-referrals.ts',
      marker: "'ai-referrals': aiReferralsCommand",
    },
    mcp: {
      file: 'packages/mcp/src/ai-opportunity-tools.ts',
      marker: "'seo_ai_referrals'",
    },
    options: [
      opt('property', 'property:', 'property: z.string()'),
      opt(
        'startDate',
        "'start-date':",
        'startDate: googleAnalyticsDateSchema.optional()',
      ),
      opt(
        'endDate',
        "'end-date':",
        'endDate: googleAnalyticsDateSchema.optional()',
      ),
      opt('maxRows', "'max-rows':", 'maxRows: z\n', 'maxRows?: number'),
      common.limit,
      common.refresh,
    ],
  },
  {
    id: 'audit-page',
    core: 'auditPage',
    cli: {
      file: 'packages/cli/src/commands/page-audit.ts',
      marker: "'audit-page': auditPageCommand",
    },
    mcp: {
      file: 'packages/mcp/src/report-tools/audit-page.ts',
      marker: "'seo_audit_page'",
    },
    options: [
      opt('url', 'url:', 'url: z.string().url()'),
      common.site,
      common.js,
      common.refresh,
    ],
  },
  {
    id: 'cannibal',
    core: 'cannibalReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/cannibal.ts',
      marker: 'cannibal: cannibalCommand',
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_cannibal'",
    },
    options: [
      common.site,
      common.days,
      common.limit,
      common.includeBrand,
      common.minImpressions,
      common.brandTerms,
      common.refresh,
    ],
  },
  {
    id: 'ctr-underperformers',
    core: 'ctrUnderperformersReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/ctr.ts',
      marker: "'ctr-underperformers': ctrUnderperformersCommand",
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_ctr_underperformers'",
    },
    options: [common.site, common.minImpressions, common.includeBrand],
  },
  {
    id: 'decaying',
    core: 'decayingReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/decaying.ts',
      marker: 'decaying: decayingCommand',
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_decaying'",
    },
    options: [
      common.site,
      common.days,
      common.limit,
      opt(
        'comparison',
        'comparison:',
        "comparison: z.enum(['previous-period', 'year-over-year']).optional()",
      ),
      opt('minDropPct', "'min-drop-pct':", 'minDropPct:'),
      opt('minPreviousClicks', "'min-previous-clicks':", 'minPreviousClicks:'),
      opt('minClickLoss', "'min-click-loss':", 'minClickLoss:'),
      common.includeBrand,
      common.brandTerms,
      common.refresh,
    ],
  },
  {
    id: 'internal-links',
    core: 'internalLinksReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/internal-links.ts',
      marker: "'internal-links': internalLinksCommand",
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_internal_links'",
    },
    options: [
      common.site,
      opt('targetUrl', 'url:', 'targetUrl: z'),
      common.days,
      common.limit,
      common.checkLimit,
      common.minImpressions,
      common.brandTerms,
      common.includeBrand,
      common.js,
      common.fetchConcurrency,
      common.fetchIntervalCap,
      common.fetchIntervalMs,
      common.refresh,
    ],
  },
  {
    id: 'link-recover',
    core: 'linkRecover',
    cli: {
      file: 'packages/cli/src/commands/monitoring/link-recover.ts',
      marker: "'link-recover': linkRecoverCommand",
    },
    mcp: {
      file: 'packages/mcp/src/monitoring-tools.ts',
      marker: "'seo_link_recover'",
    },
    options: [
      common.site,
      common.days,
      common.limit,
      opt('minClicks', "'min-clicks':", 'minClicks: z.number().optional()'),
      common.minImpressions,
      common.refresh,
      common.js,
    ],
  },
  {
    id: 'page-opportunities',
    core: 'pageOpportunitiesReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/page-opportunities.ts',
      marker: "'page-opportunities': pageOpportunitiesCommand",
    },
    mcp: {
      file: 'packages/mcp/src/ai-opportunity-tools.ts',
      marker: "'seo_page_opportunities'",
    },
    options: [
      common.site,
      opt('url', 'url:', 'url: z.string().url()'),
      common.days,
      common.limit,
      common.includeBrand,
      common.refresh,
      common.js,
    ],
  },
  {
    id: 'performance',
    core: 'performanceAudit',
    cli: {
      file: 'packages/cli/src/commands/performance.ts',
      marker: 'perf: performanceCommand',
    },
    mcp: {
      file: 'packages/mcp/src/ai-opportunity-tools.ts',
      marker: "'seo_performance_audit'",
    },
    options: [
      opt('url', 'url:', 'url: z.string().url()'),
      opt(
        'strategy',
        'strategy:',
        "strategy: z.enum(['mobile', 'desktop']).optional()",
      ),
      common.refresh,
    ],
  },
  {
    id: 'query-cluster',
    core: 'queryClusterReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/query-cluster.ts',
      marker: "'query-cluster': queryClusterCommand",
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_query_cluster'",
    },
    options: [
      common.site,
      opt('scope', 'scope:', 'scope: z.string()'),
      common.includeBrand,
      common.minImpressions,
      common.limit,
    ],
  },
  {
    id: 'quick-wins',
    core: 'quickWinsReport',
    cli: {
      file: 'packages/cli/src/commands/opportunities/quick-wins.ts',
      marker: "'quick-wins': quickWinsCommand",
    },
    mcp: {
      file: 'packages/mcp/src/opportunity-tools.ts',
      marker: "'seo_quick_wins'",
    },
    options: [
      common.site,
      common.days,
      common.limit,
      common.minImpressions,
      common.brandTerms,
      ...fetchOptions,
    ],
  },
  {
    id: 'redirect-trace',
    core: 'redirectTrace',
    cli: {
      file: 'packages/cli/src/commands/monitoring/redirect-trace.ts',
      marker: "'redirect-trace': redirectTraceCommand",
    },
    mcp: {
      file: 'packages/mcp/src/monitoring-tools.ts',
      marker: "'seo_redirect_trace'",
    },
    options: [
      opt('url', 'url:', 'url: z.string().url()'),
      opt('maxHops', "'max-hops':", 'maxHops: z.number().optional()'),
      common.refresh,
      common.js,
    ],
  },
  {
    id: 'refresh-priorities',
    core: 'refreshPrioritiesWorkflow',
    cli: {
      file: 'packages/cli/src/commands/workflows/refresh-priorities.ts',
      sharedFiles: ['packages/cli/src/commands/analytics/connection.ts'],
      marker: "'refresh-priorities': refreshPrioritiesCommand",
    },
    mcp: {
      file: 'packages/mcp/src/workflow-tools.ts',
      marker: "'seo_workflow_refresh_priorities'",
    },
    options: [
      common.site,
      common.days,
      common.recentDays,
      common.limit,
      common.includeBrand,
      opt(
        'googleAnalyticsPropertyId',
        "'google-analytics-property':",
        'googleAnalyticsPropertyId: z.string().optional()',
      ),
      common.verifyContent,
      common.verifyLimit,
      common.refresh,
    ],
  },
  {
    id: 'second-page',
    core: 'secondPage',
    cli: {
      file: 'packages/cli/src/commands/opportunities/second-page.ts',
      marker: "'second-page': secondPageCommand",
    },
    mcp: {
      file: 'packages/mcp/src/report-tools/second-page.ts',
      sharedFiles: ['packages/mcp/src/report-tools/input.ts'],
      marker: "'seo_second_page'",
    },
    options: [
      common.site,
      opt('range', 'days:', 'range: z.number().optional()'),
      common.minImpressions,
      common.limit,
      ...fetchOptions,
    ],
  },
  {
    id: 'segment-impact',
    core: 'segmentImpact',
    cli: {
      file: 'packages/cli/src/commands/product/segment-impact.ts',
      marker: "'segment-impact': segmentImpactCommand",
    },
    mcp: {
      file: 'packages/mcp/src/diagnosis-tools.ts',
      marker: "'seo_segment_impact'",
    },
    options: [
      opt('site', 'site:', 'site: z.string().trim().min(1)'),
      opt(
        'dimension',
        'dimension:',
        "dimension: z.enum(['page', 'query', 'country', 'device']).optional()",
      ),
      opt('days', 'days:', 'days: z.number().int()'),
      opt('compareDays', 'compare:', 'compareDays: z.number().int()'),
      opt(
        'startDate',
        "'start-date':",
        'startDate: calendarDateSchema.optional()',
      ),
      opt('endDate', "'end-date':", 'endDate: calendarDateSchema.optional()'),
      opt('limit', 'limit:', 'limit: z.number().int()'),
      opt('maxRows', "'max-rows':", 'maxRows: z.number().int()'),
      opt(
        'unmatchedLimit',
        "'unmatched-limit':",
        'unmatchedLimit: z.number().int()',
      ),
      common.refresh,
    ],
  },
  {
    id: 'striking-distance',
    core: 'strikingDistance',
    cli: {
      file: 'packages/cli/src/commands/product/striking-distance.ts',
      marker: "'striking-distance': strikingDistanceCommand",
    },
    mcp: {
      file: 'packages/mcp/src/diagnosis-tools.ts',
      marker: "'seo_striking_distance'",
    },
    options: [
      common.site,
      common.days,
      common.minImpressions,
      common.limit,
      ...fetchOptions,
    ],
  },
  {
    id: 'traffic-anomaly',
    core: 'trafficAnomaly',
    cli: {
      file: 'packages/cli/src/commands/diagnosis-reports.ts',
      marker: "'traffic-anomaly': trafficAnomalyCommand",
    },
    mcp: {
      file: 'packages/mcp/src/diagnosis-tools.ts',
      marker: "'seo_traffic_anomaly'",
    },
    options: [common.site, common.days, common.recentDays, common.refresh],
  },
  {
    id: 'update-correlate',
    core: 'updateCorrelation',
    cli: {
      file: 'packages/cli/src/commands/diagnosis-reports.ts',
      marker: "'update-correlate': updateCorrelateCommand",
    },
    mcp: {
      file: 'packages/mcp/src/diagnosis-tools.ts',
      marker: "'seo_update_correlate'",
    },
    options: [
      common.site,
      common.days,
      common.recentDays,
      opt(
        'paddingDays',
        "'padding-days':",
        'paddingDays: z.number().optional()',
      ),
      common.refresh,
    ],
  },
  {
    id: 'update-postmortem',
    core: 'updatePostmortemWorkflow',
    cli: {
      file: 'packages/cli/src/commands/workflows/update-postmortem.ts',
      marker: "'update-postmortem': updatePostmortemCommand",
    },
    mcp: {
      file: 'packages/mcp/src/workflow-tools.ts',
      marker: "'seo_workflow_update_postmortem'",
    },
    options: [
      common.site,
      common.days,
      common.recentDays,
      common.limit,
      common.includeBrand,
      common.refresh,
    ],
  },
]
