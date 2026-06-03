import { defineCommand, runMain } from 'citty'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
import { clientCommand } from './commands/clients/index.js'
import {
  ga4ReportCommand,
  gscQueryCommand,
  urlInspectCommand,
} from './commands/data.js'
import {
  trafficAnomalyCommand,
  updateCorrelateCommand,
} from './commands/diagnosis-reports.js'
import {
  changeLogCommand,
  contentGroupsCommand,
} from './commands/experiments/index.js'
import { exportCommand } from './commands/export/index.js'
import { initCommand } from './commands/init.js'
import { mcpCommand } from './commands/mcp.js'
import {
  crawlDiffCommand,
  indexWatchCommand,
  linkRecoverCommand,
  monitoringCommand,
  redirectTraceCommand,
} from './commands/monitoring.js'
import {
  aiReferralsCommand,
  cannibalCommand,
  communityIntentCommand,
  ctrUnderperformersCommand,
  decayingCommand,
  internalLinksCommand,
  pageOpportunitiesCommand,
  queryClusterCommand,
  quickWinsCommand,
  secondPageCommand,
  seoToAiQueryCommand,
} from './commands/opportunities/index.js'
import { auditPageCommand } from './commands/page-audit.js'
import {
  diagnoseCommand,
  doctorCommand,
  ga4PropertiesCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product/index.js'
import { pseoCommand } from './commands/pseo/index.js'
import {
  monthlyReportCommand,
  reportNarrativeCommand,
} from './commands/reports.js'
import { scheduleCommand } from './commands/schedule.js'
import { setupCommand } from './commands/setup/index.js'
import {
  privacyCommand,
  resetCommand,
  sitesCommand,
  updatesCommand,
} from './commands/system.js'
import {
  diagnosePropertyWorkflowCommand,
  refreshPrioritiesCommand,
  technicalWatchCommand,
  updatePostmortemCommand,
} from './commands/workflows/index.js'
import { maybeCheckForUpdates } from './utils.js'

const pkg = {
  name: '@seo/cli',
  version: '0.1.0',
}

const main = defineCommand({
  meta: {
    name: 'seo',
    version: pkg.version,
    description: 'Local-first SEO CLI and MCP server',
  },
  subCommands: {
    init: initCommand,
    auth: authCommand,
    mcp: mcpCommand,
    doctor: doctorCommand,
    'ga4-properties': ga4PropertiesCommand,
    privacy: privacyCommand,
    reset: resetCommand,
    cache: cacheCommand,
    client: clientCommand,
    'change-log': changeLogCommand,
    'content-groups': contentGroupsCommand,
    'crawl-diff': crawlDiffCommand,
    diagnose: diagnoseCommand,
    'diagnose-property': diagnosePropertyWorkflowCommand,
    export: exportCommand,
    'index-watch': indexWatchCommand,
    'link-recover': linkRecoverCommand,
    'monthly-report': monthlyReportCommand,
    monitoring: monitoringCommand,
    'report-narrative': reportNarrativeCommand,
    'refresh-priorities': refreshPrioritiesCommand,
    'redirect-trace': redirectTraceCommand,
    schedule: scheduleCommand,
    setup: setupCommand,
    'segment-impact': segmentImpactCommand,
    'striking-distance': strikingDistanceCommand,
    'technical-watch': technicalWatchCommand,
    'update-postmortem': updatePostmortemCommand,
    sites: sitesCommand,
    'gsc-query': gscQueryCommand,
    'url-inspect': urlInspectCommand,
    'ga4-report': ga4ReportCommand,
    updates: updatesCommand,
    'traffic-anomaly': trafficAnomalyCommand,
    'update-correlate': updateCorrelateCommand,
    'ai-referrals': aiReferralsCommand,
    'audit-page': auditPageCommand,
    'second-page': secondPageCommand,
    cannibal: cannibalCommand,
    'community-intent': communityIntentCommand,
    decaying: decayingCommand,
    'quick-wins': quickWinsCommand,
    'page-opportunities': pageOpportunitiesCommand,
    'internal-links': internalLinksCommand,
    'ctr-underperformers': ctrUnderperformersCommand,
    'query-cluster': queryClusterCommand,
    'seo-to-ai-query': seoToAiQueryCommand,
    pseo: pseoCommand,
  },
  run: async () => {
    if (process.argv.slice(2).length === 0) {
      process.stdout.write('Use `seo init` to get started.\n')
    }
  },
})

maybeCheckForUpdates(pkg)
await runMain(main)
