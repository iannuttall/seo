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
  updateNotice,
} from '@seo/core'
import {
  COMMANDS,
  type CommandId,
  telemetryReportFor,
} from '@seo/core/commands'
import { listReports } from '@seo/mcp'
import { defineCommand, runCommand, runMain } from 'citty'
import { analyticsCommand } from './commands/analytics/index.js'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
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
import { gscQueryCommand, urlInspectCommand } from './commands/data.js'
import {
  trafficAnomalyCommand,
  updateCorrelateCommand,
} from './commands/diagnosis-reports.js'
import { exportCommand } from './commands/export/index.js'
import { initCommand } from './commands/init.js'
import { loginCommand, logoutCommand } from './commands/login.js'
import { logsCommand } from './commands/logs.js'
import { mcpCommand } from './commands/mcp.js'
import {
  indexCoverageCommand,
  linkRecoverCommand,
  redirectTraceCommand,
} from './commands/monitoring.js'
import {
  aiReferralsCommand,
  cannibalCommand,
  ctrUnderperformersCommand,
  decayingCommand,
  internalLinksCommand,
  pageOpportunitiesCommand,
  queryClusterCommand,
  quickWinsCommand,
  secondPageCommand,
} from './commands/opportunities/index.js'
import { auditPageCommand } from './commands/page-audit.js'
import { performanceCommand } from './commands/performance.js'
import {
  doctorCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product/index.js'
import { providersCommand } from './commands/providers/index.js'
import { reportCatalogCommand } from './commands/report-catalog.js'
import { explainCommand, rulesCommand } from './commands/rules.js'
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
  refreshPrioritiesCommand,
  updatePostmortemCommand,
} from './commands/workflows/index.js'
import { buildErrorFeedbackUrl, telemetryOperation } from './error-feedback.js'
import { removedFlagNotice, removedNotice, renamedNotice } from './renames.js'
import { maybeOfferSelfUpdate } from './self-update.js'
import { showUpgradeNotice } from './upgrade-notice.js'
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
      ['seo start', 'Sign in with Google, then add the MCP server and skill'],
      [
        'seo report',
        'Last week across your audited sites (beta, after seo login)',
      ],
      ['seo report --site <site>', 'One site: overview and every section'],
      [
        'seo report --site <site> --section quick-wins',
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
      ['seo data', 'Raw Search Console, Bing or Clicky rows'],
      ['seo crawl', 'Crawl a site and list technical issues'],
      ['seo internal-links', 'Pages that could link to a target page'],
    ],
  },
  {
    title: 'Setup',
    commands: [
      ['seo login', 'Use your seoskill.dev account on this machine'],
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
      ['seo crawl-queue', 'Run a crawl and rank the fix queue'],
      ['seo rules', 'List crawler rule ids'],
      ['seo explain --rule missing_title', 'Explain a crawler rule'],
      ['seo redirect-trace', 'Trace redirects'],
      ['seo perf audit', 'Run a page performance audit'],
      ['seo index-coverage', 'Choose pages for URL Inspection'],
      ['seo ai-referrals', 'AI referral traffic in Google Analytics'],
      [
        'seo analytics google report',
        'Google Analytics landing pages for visits from search',
      ],
      ['seo updates', 'List official Google ranking updates'],
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
    'Your own Search Console, Google Analytics and Bing data, as facts for your agent.',
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
    analytics: analyticsCommand,
    auth: authCommand,
    mcp: mcpCommand,
    doctor: doctorCommand,
    privacy: privacyCommand,
    telemetry: telemetryCommand,
    reset: resetCommand,
    cache: cacheCommand,
    logs: logsCommand,
    crawl: crawlCommand,
    'crawl-queue': crawlQueueCommand,
    content: contentCommand,
    providers: providersCommand,
    export: exportCommand,
    'index-coverage': indexCoverageCommand,
    'link-recover': linkRecoverCommand,
    rules: rulesCommand,
    explain: explainCommand,
    'refresh-priorities': refreshPrioritiesCommand,
    'redirect-trace': redirectTraceCommand,
    skill: skillsCommand,
    start: startCommand,
    setup: setupCommand,
    login: loginCommand,
    logout: logoutCommand,
    report: reportCommand,
    page: pageCommand,
    compare: compareCommand,
    index: indexCommand,
    data: dataCommand,
    research: researchCommand,
    reports: reportCatalogCommand,
    'segment-impact': segmentImpactCommand,
    'striking-distance': strikingDistanceCommand,
    'update-postmortem': updatePostmortemCommand,
    sites: sitesCommand,
    'gsc-query': gscQueryCommand,
    'url-inspect': urlInspectCommand,
    updates: updatesCommand,
    'traffic-anomaly': trafficAnomalyCommand,
    'update-correlate': updateCorrelateCommand,
    'ai-referrals': aiReferralsCommand,
    'audit-page': auditPageCommand,
    'second-page': secondPageCommand,
    cannibal: cannibalCommand,
    decaying: decayingCommand,
    'quick-wins': quickWinsCommand,
    'page-opportunities': pageOpportunitiesCommand,
    perf: performanceCommand,
    'internal-links': internalLinksCommand,
    'ctr-underperformers': ctrUnderperformersCommand,
    'query-cluster': queryClusterCommand,
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
  doctor: 'setup-check',
  explain: 'explain-crawl-issue',
  'link-recover': 'link-recovery',
  'query-cluster': 'query-clusters',
  report: 'search-performance-overview',
  rules: 'crawler-rules',
  'update-correlate': 'update-correlation',
}

const directReportIds = new Set([
  'ai-referrals',
  'audit-page',
  'ctr-underperformers',
  'index-coverage',
  'internal-links',
  'page-opportunities',
  'quick-wins',
  'redirect-trace',
  'refresh-priorities',
  'second-page',
  'segment-impact',
  'striking-distance',
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
  if (command === 'perf' && subcommand === 'audit') return 'performance-audit'
  return (
    reportAliases[command] ??
    (directReportIds.has(command) ? command : undefined)
  )
}

const argv = process.argv.slice(2)
showUpgradeNotice(argv)
const removed = removedNotice(argv) ?? removedFlagNotice(argv)
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
// Starts the background version check early, so a run can show its result.
if (!isMcpServer) updateNotice()
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
  const json = argv.includes('--json')
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
    if (json) {
      const notice = updateNotice()
      process.stdout.write(
        `${JSON.stringify({ ...seoErrorEnvelope(normalized), ...(notice ? { updateNotice: notice } : {}) }, null, 2)}\n`,
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
  // JSON output carries the notice as a field (printJson).
  const notice = json || isMcpServer ? undefined : updateNotice()
  if (notice) process.stderr.write(`\n${notice}\n`)
}
