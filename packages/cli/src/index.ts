import { SEO_VERSION, seoErrorEnvelope, toSeoError } from '@seo/core'
import { defineCommand, runCommand, runMain } from 'citty'
import { authCommand } from './commands/auth.js'
import { cacheCommand } from './commands/cache.js'
import { clientCommand, projectCommand } from './commands/clients/index.js'
import { contentCommand } from './commands/content.js'
import { crawlCommand } from './commands/crawl.js'
import { crawlReportsCommand } from './commands/crawl-reports.js'
import {
  ga4ReportCommand,
  gscQueryCommand,
  urlInspectCommand,
} from './commands/data.js'
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
import { initCommand } from './commands/init.js'
import { llmsCommand } from './commands/llms.js'
import { mcpCommand } from './commands/mcp.js'
import {
  crawlDiffCommand,
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
  ga4PropertiesCommand,
  segmentImpactCommand,
  strikingDistanceCommand,
} from './commands/product/index.js'
import { pseoCommand } from './commands/pseo/index.js'
import { aiReadinessCommand } from './commands/readiness.js'
import {
  monthlyReportCommand,
  reportNarrativeCommand,
} from './commands/reports.js'
import { explainCommand, rulesCommand } from './commands/rules.js'
import { scheduleCommand } from './commands/schedule.js'
import { setupCommand, startCommand } from './commands/setup/index.js'
import { skillsCommand } from './commands/skills.js'
import {
  privacyCommand,
  resetCommand,
  sitesCommand,
  updatesCommand,
} from './commands/system.js'
import {
  crawlQueueCommand,
  diagnosePropertyWorkflowCommand,
  mainReportCommand,
  refreshPrioritiesCommand,
  technicalWatchCommand,
  updatePostmortemCommand,
} from './commands/workflows/index.js'
import { maybeCheckForUpdates } from './utils.js'

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
      ['seo diagnose-property --json', 'Full diagnosis for agents'],
      ['seo export diagnose', 'Export report data to CSV'],
      ['seo mcp install', 'Install SEO tools into MCP clients'],
      ['seo skills list', 'List packaged skills for agents'],
    ],
  },
]

const allHelpSections: HelpSection[] = [
  ...helpSections,
  {
    title: 'Deeper analysis',
    commands: [
      ['seo diagnose', 'Run raw end-to-end diagnosis'],
      ['seo decaying', 'Find pages and queries losing clicks'],
      ['seo cannibal', 'Review queries exposed across multiple URLs'],
      ['seo ctr-underperformers', 'Find weak CTR by ranking position'],
      ['seo query-cluster', 'Cluster repeated demand themes'],
      ['seo page-opportunities', 'Analyze one URL for growth ideas'],
      ['seo content optimize', 'Build a content optimization report'],
      ['seo perf audit', 'Run a page performance audit'],
      ['seo internal-links', 'Find internal link opportunities'],
      ['seo community-intent', 'Find forum, review, and comparison intent'],
      ['seo ai-referrals', 'Find AI referral traffic in GA4'],
      ['seo seo-to-ai-query', 'Convert searches into AI-monitor prompts'],
    ],
  },
  {
    title: 'Technical and data',
    commands: [
      ['seo audit-page', 'Audit one page'],
      ['seo crawl', 'Crawl a site for technical SEO issues'],
      ['seo ai-readiness', 'Review AI-search technical evidence'],
      ['seo llms audit', 'Inspect optional llms.txt presence'],
      ['seo entity-readiness', 'Check brand/entity signals from a saved crawl'],
      ['seo okf export', 'Export a saved crawl as an OKF knowledge bundle'],
      ['seo crawl-queue', 'Run a crawl and rank the implementation queue'],
      ['seo crawl-reports', 'List saved crawl reports'],
      ['seo rules', 'List crawler rule ids'],
      ['seo explain --rule missing_title', 'Explain a crawler rule'],
      ['seo crawl-diff', 'Compare crawl changes'],
      ['seo index-watch', 'Check URL Inspection status'],
      ['seo link-recover', 'Find broken search-value URLs'],
      ['seo redirect-trace', 'Trace redirects'],
      ['seo gsc-query', 'Run a raw GSC query'],
      ['seo url-inspect', 'Run URL Inspection'],
      ['seo ga4-report', 'Run a GA4 report'],
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
      ['seo cache', 'Manage local cache'],
      ['seo privacy', 'Show local storage paths'],
      ['seo reset', 'Delete local SEO data'],
    ],
  },
]

function printHelpSections(sections: HelpSection[]): void {
  process.stdout.write(`seo v${pkg.version}\n\n`)
  process.stdout.write(
    'Human-friendly SEO reports first, power tools when you need them.\n\n',
  )
  for (const section of sections) {
    process.stdout.write(`${section.title}\n`)
    const width = Math.max(
      ...section.commands.map(([command]) => command.length),
    )
    for (const [command, description] of section.commands) {
      process.stdout.write(`  ${command.padEnd(width)}  ${description}\n`)
    }
    process.stdout.write('\n')
  }
  process.stdout.write(
    'Use `seo help <command>` or `seo <command> --help` for command help.\n',
  )
  process.stdout.write('Use `seo help all` for the longer command list.\n')
}

const main = defineCommand({
  meta: {
    name: 'seo',
    version: pkg.version,
    description: 'Local-first SEO CLI and MCP server',
  },
  subCommands: {
    init: initCommand,
    llms: llmsCommand,
    auth: authCommand,
    mcp: mcpCommand,
    okf: okfCommand,
    doctor: doctorCommand,
    'ga4-properties': ga4PropertiesCommand,
    privacy: privacyCommand,
    reset: resetCommand,
    cache: cacheCommand,
    crawl: crawlCommand,
    'crawl-queue': crawlQueueCommand,
    'crawl-reports': crawlReportsCommand,
    client: clientCommand,
    content: contentCommand,
    project: projectCommand,
    projects: projectCommand,
    'change-log': changeLogCommand,
    tests: testsCommand,
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
    rules: rulesCommand,
    explain: explainCommand,
    'refresh-priorities': refreshPrioritiesCommand,
    'redirect-trace': redirectTraceCommand,
    schedule: scheduleCommand,
    skills: skillsCommand,
    start: startCommand,
    setup: setupCommand,
    report: mainReportCommand,
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

maybeCheckForUpdates(pkg)

const argv = process.argv.slice(2)
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
if (argv[0] === 'help' && argv.length > 1) {
  process.argv = [
    process.argv[0] ?? 'node',
    process.argv[1] ?? 'seo',
    ...argv.slice(1),
    '--help',
  ]
}
const helpRequested = argv.some((arg) => ['--help', '-h'].includes(arg))
const versionRequested =
  argv.length === 1 && ['--version', '-v'].includes(argv[0] ?? '')

if (helpRequested || versionRequested) {
  await runMain(main)
} else {
  try {
    await runCommand(main, { rawArgs: argv })
  } catch (error) {
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
