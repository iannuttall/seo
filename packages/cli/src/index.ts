import {
  detectTelemetryAgent,
  initializeTelemetry,
  SEO_VERSION,
  seoErrorEnvelope,
  toSeoError,
  trackTelemetryCommandFailed,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
  trackTelemetrySetupComplete,
} from '@seo/core'
import {
  COMMANDS,
  type CommandId,
  telemetryReportFor,
} from '@seo/core/commands'
import { listReports } from '@seo/mcp'
import { defineCommand, runCommand, runMain } from 'citty'
import { agentReadinessCommand } from './commands/agent-readiness.js'
import { analyticsCommand } from './commands/analytics/index.js'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
import { clientCommand, projectCommand } from './commands/clients/index.js'
import { contentCommand } from './commands/content.js'
import {
  compareCommand,
  dataCommand,
  indexCommand,
  pageCommand,
  reportCommand,
  researchCommand,
} from './commands/core-commands.js'
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
  mainReportCommand,
  refreshPrioritiesCommand,
  technicalWatchCommand,
  updatePostmortemCommand,
} from './commands/workflows/index.js'
import { buildErrorFeedbackUrl, telemetryOperation } from './error-feedback.js'
import { removedNotice, renamedNotice } from './renames.js'
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
      ['seo start', 'Connect Search Console and save a project profile'],
      ['seo report', 'The main report: overview and every section'],
      [
        'seo report --section quick-wins',
        'One section of the report, with live page checks',
      ],
    ],
  },
  {
    title: 'Commands',
    commands: [
      ['seo page --url <url>', 'One page: live facts, index status, queries'],
      ['seo compare --date <date>', 'Before and after a date'],
      ['seo index', 'Pages that lost most of their clicks'],
      [
        'seo research <action>',
        'Keyword, SERP, competitor and backlink data from your key',
      ],
      ['seo data', 'Raw Search Console rows'],
      ['seo crawl', 'Crawl a site and list technical issues'],
      ['seo internal-links', 'Pages that could link to a target page'],
    ],
  },
  {
    title: 'Setup',
    commands: [
      ['seo projects list', 'List saved project profiles'],
      ['seo sites', 'List Search Console properties'],
      ['seo mcp install', 'Add the local MCP server to your agents'],
      ['seo providers', 'Connect DataForSEO or Ahrefs'],
      ['seo doctor', 'Check local auth and config'],
    ],
  },
]

const allHelpSections: HelpSection[] = [
  ...helpSections,
  {
    title: 'More commands',
    commands: [
      ['seo crawl-reports', 'List saved crawl reports'],
      ['seo crawl-diff', 'Compare crawl changes'],
      ['seo crawl-queue', 'Run a crawl and rank the fix queue'],
      ['seo rules', 'List crawler rule ids'],
      ['seo explain --rule missing_title', 'Explain a crawler rule'],
      ['seo redirect-trace', 'Trace redirects'],
      ['seo perf audit', 'Run a page performance audit'],
      ['seo index-coverage', 'Choose pages for URL Inspection'],
      ['seo index-watch', 'Check saved URL Inspection snapshots'],
      ['seo indexnow submit', 'Notify IndexNow about changed URLs'],
      ['seo ai-referrals', 'AI referral traffic in Google Analytics'],
      ['seo analytics google report', 'Run a Google Analytics report'],
      ['seo updates', 'List official Google ranking updates'],
      ['seo change-log', 'Track SEO changes'],
      ['seo tests', 'Create and report local SEO tests'],
      ['seo content-groups', 'Manage reusable page and query groups'],
      ['seo monitoring', 'Run and review monitoring'],
      ['seo schedule cron', 'Print cron entries'],
      ['seo export', 'Export report data to CSV'],
      ['seo reports list', 'List every structured report'],
      ['seo skill list', 'Show the packaged SEO skill'],
      ['seo auth', 'Manage Google auth'],
      ['seo cache', 'Manage local cache'],
      ['seo privacy', 'Show local storage paths'],
      ['seo telemetry status', 'Check anonymous usage telemetry'],
      ['seo reset', 'Delete saved credentials and all local data'],
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
    // The 0.2 main report, kept under its old name for one release.
    'diagnose-property': mainReportCommand,
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
    report: reportCommand,
    page: pageCommand,
    compare: compareCommand,
    index: indexCommand,
    data: dataCommand,
    research: researchCommand,
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

function flagValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag)
  if (at >= 0) return args[at + 1]
  return args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1)
}

function telemetryReportId(args: string[]): string | undefined {
  const [command, subcommand, id] = args
  if (!command) return undefined
  if (command in COMMANDS) {
    return (
      telemetryReportFor(command as CommandId, {
        section: flagValue(args, '--section'),
        action: subcommand,
      }) ?? undefined
    )
  }
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
const removed = removedNotice(argv[0] ?? '')
if (removed) {
  process.stderr.write(`${removed}\n`)
  process.exit(2)
}
const renamed = renamedNotice(argv[0] ?? '')
if (renamed && !argv.some((arg) => ['--help', '-h'].includes(arg))) {
  process.stderr.write(`${renamed}\n`)
}
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
      trackTelemetryReportFailed(trackedReport, error, telemetryOptions)
    } else if (!isTelemetryControl) {
      const operation = telemetryOperation(commandArgs)
      if (operation) {
        trackTelemetryCommandFailed(operation, error, telemetryOptions)
      }
    }
    const normalized = toSeoError(error)
    if (argv.includes('--json')) {
      process.stdout.write(
        `${JSON.stringify(seoErrorEnvelope(normalized), null, 2)}\n`,
      )
    } else {
      process.stderr.write(`Error: ${normalized.message}\n`)
      const feedbackUrl = buildErrorFeedbackUrl({
        args: commandArgs,
        error,
        report: trackedReport,
      })
      if (feedbackUrl) {
        process.stderr.write(`Report this bug: ${feedbackUrl}\n`)
      }
    }
    process.exitCode = normalized.exitCode
  }
}
