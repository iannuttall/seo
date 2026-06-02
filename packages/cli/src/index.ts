import { defineCommand, runMain } from 'citty'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
import { clientCommand } from './commands/clients.js'
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
} from './commands/experiments.js'
import { initCommand } from './commands/init.js'
import { mcpCommand } from './commands/mcp.js'
import { crawlDiffCommand, indexWatchCommand } from './commands/monitoring.js'
import {
  cannibalCommand,
  ctrUnderperformersCommand,
  decayingCommand,
  internalLinksCommand,
  queryClusterCommand,
  quickWinsCommand,
  secondPageCommand,
} from './commands/opportunities.js'
import { auditPageCommand } from './commands/page-audit.js'
import {
  diagnoseCommand,
  doctorCommand,
  ga4PropertiesCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product.js'
import {
  monthlyReportCommand,
  reportNarrativeCommand,
} from './commands/reports.js'
import { scheduleCommand } from './commands/schedule.js'
import { setupCommand } from './commands/setup.js'
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
} from './commands/workflows.js'
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
    'index-watch': indexWatchCommand,
    'monthly-report': monthlyReportCommand,
    'report-narrative': reportNarrativeCommand,
    'refresh-priorities': refreshPrioritiesCommand,
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
    'audit-page': auditPageCommand,
    'second-page': secondPageCommand,
    cannibal: cannibalCommand,
    decaying: decayingCommand,
    'quick-wins': quickWinsCommand,
    'internal-links': internalLinksCommand,
    'ctr-underperformers': ctrUnderperformersCommand,
    'query-cluster': queryClusterCommand,
  },
  run: async () => {
    if (process.argv.slice(2).length === 0) {
      process.stdout.write('Use `seo init` to get started.\n')
    }
  },
})

maybeCheckForUpdates(pkg)
await runMain(main)
