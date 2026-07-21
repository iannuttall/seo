import {
  detectTelemetryAgent,
  initializeTelemetry,
  SEO_VERSION,
  seoErrorEnvelope,
  telemetryErrorCategory,
  toSeoError,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
  trackTelemetrySetupComplete,
} from '@seo/core'
import { listReports } from '@seo/mcp'
import { defineCommand, runCommand, runMain } from 'citty'
import { agentReadinessCommand } from './commands/agent-readiness.js'
import { analyticsCommand } from './commands/analytics/index.js'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
import { clientCommand, projectCommand } from './commands/clients/index.js'
import { contentCommand } from './commands/content.js'
import { crawlCommand } from './commands/crawl.js'
import { crawlReportsCommand } from './commands/crawl-reports.js'
import { gscQueryCommand, urlInspectCommand } from './commands/data.js'
import {
  trafficAnomalyCommand,
  updateCorrelateCommand,
} from './commands/diagnosis-reports.js'
import { entityReadinessCommand } from './commands/entity-readiness.js'
import {
  changeLogCommand,
  contentGroupsCommand,
  testsCommand,
} from './commands/experiments/index.js'
import { exportCommand } from './commands/export/index.js'
import { indexNowCommand } from './commands/indexnow.js'
import { initCommand } from './commands/init.js'
import { linksCommand } from './commands/links.js'
import { llmsCommand } from './commands/llms.js'
import { logsCommand } from './commands/logs.js'
import { mcpCommand } from './commands/mcp.js'
import {
  crawlDiffCommand,
  indexCoverageCommand,
  indexWatchCommand,
  linkRecoverCommand,
  monitoringCommand,
  redirectTraceCommand,
} from './commands/monitoring.js'
import { okfCommand } from './commands/okf.js'
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
import { performanceCommand } from './commands/performance.js'
import {
  diagnoseCommand,
  doctorCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product/index.js'
import { providersCommand } from './commands/providers/index.js'
import { pseoCommand } from './commands/pseo/index.js'
import { aiReadinessCommand } from './commands/readiness.js'
import { reportCatalogCommand } from './commands/report-catalog.js'
import {
  monthlyReportCommand,
  reportNarrativeCommand,
} from './commands/reports.js'
import { explainCommand, rulesCommand } from './commands/rules.js'
import { scheduleCommand } from './commands/schedule.js'
import { serverLogsCommand } from './commands/server-logs.js'
import { setupCommand, startCommand } from './commands/setup/index.js'
import { skillsCommand } from './commands/skills.js'
import {
  privacyCommand,
  resetCommand,
  sitesCommand,
  updatesCommand,
} from './commands/system.js'
import { telemetryCommand } from './commands/telemetry.js'
import {
  crawlQueueCommand,
  diagnosePropertyWorkflowCommand,
  mainReportCommand,
  refreshPrioritiesCommand,
  technicalWatchCommand,
  updatePostmortemCommand,
} from './commands/workflows/index.js'
import { maybeOfferSelfUpdate } from './self-update.js'
import { printCatalog, printHeading, printSection } from './utils.js'

const pkg = {
  name: 'seo',
  version: SEO_VERSION,
}

type HelpSection = {
  title: string
  commands: Array<[command: string, description: string]>
}

const helpSections: HelpSection[] = [
  {
    title: 'Start here',
    commands: [
      ['seo start', 'Connect Google and save a project profile'],
      ['seo report', 'Run the main SEO report for the default project'],
      ['seo report --site sc-domain:example.com', 'Run without a profile'],
      [
        'seo report --url https://example.com',
        'Start with a local technical report',
      ],
    ],
  },
  {
    title: 'Projects',
    commands: [
      ['seo projects list', 'List saved project profiles'],
      ['seo projects add', 'Create or update a project profile'],
      ['seo sites', 'List Search Console properties'],
      ['seo doctor', 'Check local auth and config'],
    ],
  },
  {
    title: 'Act on a report',
    commands: [
      ['seo refresh-priorities', 'Rank the next best SEO actions'],
      ['seo quick-wins', 'Find ranking 4-10 low-CTR wins'],
      ['seo second-page', 'Investigate URLs averaging positions 10-20'],
      ['seo technical-watch', 'Crawl and index-monitor a site'],
    ],
  },
  {
    title: 'Agent and power tools',
    commands: [
      ['seo report --json', 'Run the main report as structured JSON'],
      ['seo export diagnose', 'Export report data to CSV'],
      ['seo mcp install', 'Install SEO tools into MCP clients'],
      ['seo skill list', 'Show the packaged SEO skill'],
      ['seo reports list', 'Discover every structured report'],
    ],
  },
]

const allHelpSections: HelpSection[] = [
  ...helpSections,
  {
    title: 'Deeper analysis',
    commands: [
      ['seo decaying', 'Find pages and queries losing clicks'],
      ['seo cannibal', 'Review queries exposed across multiple URLs'],
      ['seo ctr-underperformers', 'Find weak CTR by ranking position'],
      ['seo query-cluster', 'Cluster repeated demand themes'],
      ['seo page-opportunities', 'Analyze one URL for growth ideas'],
      ['seo content optimize', 'Build a content optimization report'],
      ['seo perf audit', 'Run a page performance audit'],
      ['seo internal-links', 'Find internal link opportunities'],
      ['seo community-intent', 'Find forum, review, and comparison intent'],
      ['seo ai-referrals', 'Find AI referral traffic in Google Analytics'],
      ['seo seo-to-ai-query', 'Convert searches into AI-monitor prompts'],
    ],
  },
  {
    title: 'Technical and data',
    commands: [
      ['seo audit-page', 'Audit one page'],
      [
        'seo crawl --sitemap-url <url> --health',
        'Run the fast sitemap gate before a full crawl',
      ],
      ['seo crawl', 'Run a full crawl for page and content evidence'],
      ['seo agent-readiness', 'Check content-site readiness for AI agents'],
      ['seo ai-readiness', 'Review AI-search technical evidence'],
      ['seo llms audit', 'Inspect optional llms.txt presence'],
      ['seo entity-readiness', 'Check brand/entity signals from a saved crawl'],
      ['seo okf export', 'Export a saved crawl as an OKF knowledge bundle'],
      ['seo crawl-queue', 'Run a crawl and rank the implementation queue'],
      ['seo crawl-reports', 'List saved crawl reports'],
      ['seo rules', 'List crawler rule ids'],
      ['seo explain --rule missing_title', 'Explain a crawler rule'],
      ['seo crawl-diff', 'Compare crawl changes'],
      ['seo index-coverage', 'Choose pages for URL Inspection'],
      ['seo index-watch', 'Check URL Inspection status'],
      ['seo indexnow submit', 'Notify IndexNow about changed URLs'],
      ['seo link-recover', 'Find broken search-value URLs'],
      ['seo links', 'Review bounded referring-link evidence'],
      ['seo server-logs analyze', 'Review crawler requests in an access log'],
      ['seo redirect-trace', 'Trace redirects'],
      ['seo gsc-query', 'Run a raw GSC query'],
      ['seo url-inspect', 'Run URL Inspection'],
      ['seo analytics google properties', 'List Google Analytics properties'],
      ['seo analytics google report', 'Run a Google Analytics report'],
      ['seo updates', 'List official Google ranking updates'],
    ],
  },
  {
    title: 'Reports and ops',
    commands: [
      ['seo monthly-report', 'Generate a monthly narrative'],
      ['seo report-narrative', 'Generate a client-ready narrative'],
      ['seo update-postmortem', 'Analyze update winners and losers'],
      ['seo schedule cron', 'Print cron entries'],
      ['seo monitoring', 'Run and review monitoring'],
      ['seo change-log', 'Track SEO changes'],
      ['seo tests', 'Create and report local SEO tests'],
      ['seo content-groups', 'Manage reusable page/query groups'],
      ['seo pseo', 'Audit programmatic SEO templates'],
      ['seo auth', 'Manage Google auth'],
      ['seo providers bing', 'Connect and report on Bing Webmaster'],
      ['seo providers dataforseo', 'Connect optional search data'],
      ['seo cache', 'Manage local cache'],
      ['seo privacy', 'Show local storage paths'],
      ['seo telemetry status', 'Check anonymous usage telemetry'],
      ['seo reset', 'Delete local SEO data'],
    ],
  },
]

function printHelpSections(sections: HelpSection[]): void {
  printHeading(
    `seo v${pkg.version}`,
    'Run SEO audits, find what needs fixing, and ship the changes with your agent.',
  )
  process.stdout.write('\n')
  printCatalog(
    sections.flatMap((section) =>
      section.commands.map(([command, description]) => ({
        category: section.title,
        id: command,
        name: description,
      })),
    ),
    {
      noun: 'command',
      categoryLabels: Object.fromEntries(
        sections.map((section) => [section.title, section.title]),
      ),
    },
  )
  process.stdout.write('\n')
  printSection(
    'More help',
    'Use `seo help <command>` or `seo <command> --help` for command help.',
    'Use `seo help all` for the longer command list.',
  )
}

const main = defineCommand({
  meta: {
    name: 'seo',
    version: pkg.version,
    description: 'Local-first SEO CLI and MCP server',
  },
  subCommands: {
    init: initCommand,
    indexnow: indexNowCommand,
    analytics: analyticsCommand,
    llms: llmsCommand,
    auth: authCommand,
    mcp: mcpCommand,
    okf: okfCommand,
    doctor: doctorCommand,
    privacy: privacyCommand,
    telemetry: telemetryCommand,
    reset: resetCommand,
    cache: cacheCommand,
    logs: logsCommand,
    crawl: crawlCommand,
    'crawl-queue': crawlQueueCommand,
    'crawl-reports': crawlReportsCommand,
    client: clientCommand,
    content: contentCommand,
    project: projectCommand,
    projects: projectCommand,
    providers: providersCommand,
    'change-log': changeLogCommand,
    tests: testsCommand,
    'content-groups': contentGroupsCommand,
    'crawl-diff': crawlDiffCommand,
    diagnose: diagnoseCommand,
    'diagnose-property': diagnosePropertyWorkflowCommand,
    export: exportCommand,
    'index-coverage': indexCoverageCommand,
    'index-watch': indexWatchCommand,
    'link-recover': linkRecoverCommand,
    links: linksCommand,
    'monthly-report': monthlyReportCommand,
    monitoring: monitoringCommand,
    'report-narrative': reportNarrativeCommand,
    rules: rulesCommand,
    explain: explainCommand,
    'refresh-priorities': refreshPrioritiesCommand,
    'redirect-trace': redirectTraceCommand,
    schedule: scheduleCommand,
    'server-logs': serverLogsCommand,
    skill: skillsCommand,
    start: startCommand,
    setup: setupCommand,
    report: mainReportCommand,
    reports: reportCatalogCommand,
    'segment-impact': segmentImpactCommand,
    'striking-distance': strikingDistanceCommand,
    'technical-watch': technicalWatchCommand,
    'update-postmortem': updatePostmortemCommand,
    sites: sitesCommand,
    'gsc-query': gscQueryCommand,
    'url-inspect': urlInspectCommand,
    updates: updatesCommand,
    'traffic-anomaly': trafficAnomalyCommand,
    'update-correlate': updateCorrelateCommand,
    'ai-referrals': aiReferralsCommand,
    'agent-readiness': agentReadinessCommand,
    'ai-readiness': aiReadinessCommand,
    'entity-readiness': entityReadinessCommand,
    'audit-page': auditPageCommand,
    'second-page': secondPageCommand,
    cannibal: cannibalCommand,
    'community-intent': communityIntentCommand,
    decaying: decayingCommand,
    'quick-wins': quickWinsCommand,
    'page-opportunities': pageOpportunitiesCommand,
    perf: performanceCommand,
    'internal-links': internalLinksCommand,
    'ctr-underperformers': ctrUnderperformersCommand,
    'query-cluster': queryClusterCommand,
    'seo-to-ai-query': seoToAiQueryCommand,
    pseo: pseoCommand,
  },
  run: async () => {
    if (process.argv.slice(2).length === 0) {
      process.stdout.write(
        'Use `seo start` to set up, then `seo report` for the main report.\n',
      )
    }
  },
})

const reportAliases: Record<string, string> = {
  cannibal: 'cannibalisation',
  crawl: 'site-crawl',
  'crawl-queue': 'top-fixes',
  decaying: 'decaying-pages',
  'diagnose-property': 'search-performance-overview',
  doctor: 'setup-check',
  explain: 'explain-crawl-issue',
  'link-recover': 'link-recovery',
  'monthly-report': 'monthly-report',
  'query-cluster': 'query-clusters',
  report: 'search-performance-overview',
  'report-narrative': 'narrative-report',
  rules: 'crawler-rules',
  'update-correlate': 'update-correlation',
}

const directReportIds = new Set([
  'agent-readiness',
  'ai-readiness',
  'ai-referrals',
  'audit-page',
  'community-intent',
  'crawl-diff',
  'ctr-underperformers',
  'entity-readiness',
  'index-coverage',
  'index-watch',
  'internal-links',
  'link-evidence',
  'page-opportunities',
  'quick-wins',
  'redirect-trace',
  'refresh-priorities',
  'second-page',
  'segment-impact',
  'seo-to-ai-query',
  'striking-distance',
  'technical-watch',
  'traffic-anomaly',
  'update-postmortem',
])
const knownReportIds = new Set(listReports().map((report) => report.id))

function telemetryReportId(args: string[]): string | undefined {
  const [command, subcommand, id] = args
  if (!command) return undefined
  if (command === 'reports' && subcommand === 'run') {
    return id && knownReportIds.has(id) ? id : undefined
  }
  if (command === 'content' && subcommand === 'optimize') {
    return 'content-optimization'
  }
  if (command === 'change-log' && subcommand === 'measure') {
    return 'measure-change'
  }
  if (command === 'llms' && subcommand === 'audit') return 'llms-txt-audit'
  if (command === 'links') return 'link-evidence'
  if (command === 'llms' && subcommand === 'generate') {
    return 'generate-llms-txt'
  }
  if (command === 'okf' && subcommand === 'export') return 'okf-build'
  if (command === 'okf' && subcommand === 'validate') return 'okf-validate'
  if (command === 'monitoring' && subcommand === 'run') {
    return 'technical-watch'
  }
  if (command === 'perf' && subcommand === 'audit') return 'performance-audit'
  if (command === 'pseo' && subcommand === 'audit') return 'pseo-audit'
  if (command === 'tests' && subcommand === 'report') return 'measure-change'
  return (
    reportAliases[command] ??
    (directReportIds.has(command) ? command : undefined)
  )
}

const argv = process.argv.slice(2)
const telemetryOptions = { agent: detectTelemetryAgent() }
const isTelemetryControl = argv[0] === 'telemetry'
const isMcpServer = argv[0] === 'mcp' && argv[1] === 'serve'
if (!isTelemetryControl && !isMcpServer) {
  initializeTelemetry(telemetryOptions)
}
const updateExitCode = await maybeOfferSelfUpdate(pkg, { argv })
if (updateExitCode !== undefined) {
  process.exit(updateExitCode)
}
if (
  argv.length === 0 ||
  (argv.length === 1 && ['help', '--help', '-h'].includes(argv[0] ?? ''))
) {
  printHelpSections(helpSections)
  process.exit(0)
}
if (argv[0] === 'help' && argv[1] === 'all') {
  printHelpSections(allHelpSections)
  process.exit(0)
}
const commandArgs =
  argv[0] === 'help' && argv.length > 1 ? [...argv.slice(1), '--help'] : argv
if (commandArgs !== argv) {
  process.argv = [
    process.argv[0] ?? 'node',
    process.argv[1] ?? 'seo',
    ...commandArgs,
  ]
}
const helpRequested = commandArgs.some((arg) => ['--help', '-h'].includes(arg))
const versionRequested =
  argv.length === 1 && ['--version', '-v'].includes(argv[0] ?? '')
const trackedReport =
  helpRequested || versionRequested ? undefined : telemetryReportId(commandArgs)

if (helpRequested || versionRequested) {
  await runMain(main)
} else {
  if (trackedReport) {
    trackTelemetryReportStart(trackedReport, telemetryOptions)
  }
  try {
    await runCommand(main, { rawArgs: commandArgs })
    if (trackedReport) {
      trackTelemetryReportComplete(trackedReport, telemetryOptions)
    }
    if (
      ['init', 'setup', 'start'].includes(commandArgs[0] ?? '') &&
      !commandArgs.includes('--dry-run')
    ) {
      trackTelemetrySetupComplete(telemetryOptions)
    }
  } catch (error) {
    if (trackedReport) {
      trackTelemetryReportFailed(
        trackedReport,
        telemetryErrorCategory(error),
        telemetryOptions,
      )
    }
    const normalized = toSeoError(error)
    if (argv.includes('--json')) {
      process.stdout.write(
        `${JSON.stringify(seoErrorEnvelope(normalized), null, 2)}\n`,
      )
    } else {
      process.stderr.write(`Error: ${normalized.message}\n`)
    }
    process.exitCode = normalized.exitCode
  }
}
