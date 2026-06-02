import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname

function readTree(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return readTree(path)
      return path.endsWith('.ts') ? [readFileSync(path, 'utf8')] : []
    })
    .join('\n')
}

const surfaces = [
  {
    id: 'ai-referrals',
    core: 'aiReferralsReport',
    cli: "'ai-referrals': aiReferralsCommand",
    mcp: "'seo_ai_referrals'",
  },
  {
    id: 'audit-page',
    core: 'auditPage',
    cli: "'audit-page': auditPageCommand",
    mcp: "'seo_audit_page'",
  },
  {
    id: 'cannibal',
    core: 'cannibalReport',
    cli: 'cannibal: cannibalCommand',
    mcp: "'seo_cannibal'",
  },
  {
    id: 'community-intent',
    core: 'communityIntentReport',
    cli: "'community-intent': communityIntentCommand",
    mcp: "'seo_community_intent'",
  },
  {
    id: 'crawl-diff',
    core: 'crawlDiff',
    cli: "'crawl-diff': crawlDiffCommand",
    mcp: "'seo_crawl_diff'",
  },
  {
    id: 'ctr-underperformers',
    core: 'ctrUnderperformersReport',
    cli: "'ctr-underperformers': ctrUnderperformersCommand",
    mcp: "'seo_ctr_underperformers'",
  },
  {
    id: 'decaying',
    core: 'decayingReport',
    cli: 'decaying: decayingCommand',
    mcp: "'seo_decaying'",
  },
  {
    id: 'diagnose',
    core: 'diagnoseProperty',
    cli: 'diagnose: diagnoseCommand',
    mcp: "'seo_diagnose_property'",
  },
  {
    id: 'diagnose-property',
    core: 'diagnosePropertyWorkflow',
    cli: "'diagnose-property': diagnosePropertyWorkflowCommand",
    mcp: "'seo_workflow_diagnose_property'",
  },
  {
    id: 'index-coverage-plan',
    core: 'indexCoveragePlan',
    cli: 'indexCoveragePlan',
    mcp: "'seo_index_coverage_plan'",
  },
  {
    id: 'index-monitor',
    core: 'indexMonitor',
    cli: 'indexMonitor',
    mcp: "'seo_index_monitor'",
  },
  {
    id: 'index-watch',
    core: 'indexWatch',
    cli: "'index-watch': indexWatchCommand",
    mcp: "'seo_index_watch'",
  },
  {
    id: 'internal-links',
    core: 'internalLinksReport',
    cli: "'internal-links': internalLinksCommand",
    mcp: "'seo_internal_links'",
  },
  {
    id: 'link-recover',
    core: 'linkRecover',
    cli: "'link-recover': linkRecoverCommand",
    mcp: "'seo_link_recover'",
  },
  {
    id: 'monthly-report',
    core: 'monthlyReport',
    cli: "'monthly-report': monthlyReportCommand",
    mcp: "'seo_monthly_report'",
  },
  {
    id: 'page-opportunities',
    core: 'pageOpportunitiesReport',
    cli: "'page-opportunities': pageOpportunitiesCommand",
    mcp: "'seo_page_opportunities'",
  },
  {
    id: 'pseo-audit',
    core: 'pseoAuditReport',
    cli: 'pseoCommand',
    mcp: "'seo_pseo_audit'",
  },
  {
    id: 'query-cluster',
    core: 'queryClusterReport',
    cli: "'query-cluster': queryClusterCommand",
    mcp: "'seo_query_cluster'",
  },
  {
    id: 'quick-wins',
    core: 'quickWinsReport',
    cli: "'quick-wins': quickWinsCommand",
    mcp: "'seo_quick_wins'",
  },
  {
    id: 'redirect-trace',
    core: 'redirectTrace',
    cli: "'redirect-trace': redirectTraceCommand",
    mcp: "'seo_redirect_trace'",
  },
  {
    id: 'refresh-priorities',
    core: 'refreshPrioritiesWorkflow',
    cli: "'refresh-priorities': refreshPrioritiesCommand",
    mcp: "'seo_workflow_refresh_priorities'",
  },
  {
    id: 'report-narrative',
    core: 'reportNarrative',
    cli: "'report-narrative': reportNarrativeCommand",
    mcp: "'seo_report_narrative'",
  },
  {
    id: 'second-page',
    core: 'secondPage',
    cli: "'second-page': secondPageCommand",
    mcp: "'seo_second_page'",
  },
  {
    id: 'segment-impact',
    core: 'segmentImpact',
    cli: "'segment-impact': segmentImpactCommand",
    mcp: "'seo_segment_impact'",
  },
  {
    id: 'seo-to-ai-query',
    core: 'seoToAiQueryReport',
    cli: "'seo-to-ai-query': seoToAiQueryCommand",
    mcp: "'seo_to_ai_query'",
  },
  {
    id: 'striking-distance',
    core: 'strikingDistance',
    cli: "'striking-distance': strikingDistanceCommand",
    mcp: "'seo_striking_distance'",
  },
  {
    id: 'technical-watch',
    core: 'technicalWatchWorkflow',
    cli: "'technical-watch': technicalWatchCommand",
    mcp: "'seo_workflow_technical_watch'",
  },
  {
    id: 'traffic-anomaly',
    core: 'trafficAnomaly',
    cli: "'traffic-anomaly': trafficAnomalyCommand",
    mcp: "'seo_traffic_anomaly'",
  },
  {
    id: 'update-correlate',
    core: 'updateCorrelation',
    cli: "'update-correlate': updateCorrelateCommand",
    mcp: "'seo_update_correlate'",
  },
  {
    id: 'update-postmortem',
    core: 'updatePostmortemWorkflow',
    cli: "'update-postmortem': updatePostmortemCommand",
    mcp: "'seo_workflow_update_postmortem'",
  },
]

const files = {
  core: readTree(join(root, 'packages/core/src')),
  cli: readTree(join(root, 'packages/cli/src')),
  mcp: [
    'packages/mcp/src/ai-opportunity-tools.ts',
    'packages/mcp/src/diagnosis-tools.ts',
    'packages/mcp/src/monitoring-tools.ts',
    'packages/mcp/src/opportunity-tools.ts',
    'packages/mcp/src/pseo-tools.ts',
    'packages/mcp/src/report-tools.ts',
    'packages/mcp/src/report-tools/audit-page.ts',
    'packages/mcp/src/report-tools/monthly.ts',
    'packages/mcp/src/report-tools/narrative.ts',
    'packages/mcp/src/report-tools/second-page.ts',
    'packages/mcp/src/workflow-tools.ts',
  ]
    .map((file) => readFileSync(join(root, file), 'utf8'))
    .join('\n'),
}

const failures = []
for (const surface of surfaces) {
  for (const area of ['core', 'cli', 'mcp']) {
    if (!files[area].includes(surface[area])) {
      failures.push(`${surface.id}: missing ${area} marker ${surface[area]}`)
    }
  }
}

if (failures.length) {
  process.stderr.write(`Report parity check failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `Report parity check passed for ${surfaces.length} report surfaces.\n`,
)
