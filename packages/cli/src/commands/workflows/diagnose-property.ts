import {
  diagnosePropertyWorkflow,
  latestCrawlReport,
  latestCrawlSummaries,
  topFixes,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { truncate } from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { startUrlForSite } from '../shared.js'
import { printWorkflow } from './output.js'

type DiagnoseWorkflowReport = Awaited<
  ReturnType<typeof diagnosePropertyWorkflow>
>

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

function addFollowup(
  commands: Array<{ command: string; why: string }>,
  command: string,
  why: string,
): void {
  if (commands.some((item) => item.command === command)) {
    return
  }
  commands.push({ command, why })
}

function hasTechnicalBaseline(site: string): boolean {
  return Boolean(
    latestCrawlReport(site) || latestCrawlSummaries(site, 1).length,
  )
}

function savedTechnicalSection(site: string) {
  const report = latestCrawlReport(site)
  if (!report) return undefined
  return {
    reportId: report.id,
    generatedAt: report.generatedAt,
    status: report.status,
    summary: report.summary,
    topFixes: topFixes(report, { limit: 5 }),
  }
}

function printTechnicalSection(
  section: ReturnType<typeof savedTechnicalSection>,
): void {
  if (!section?.topFixes.length) return
  process.stdout.write('\nTechnical fixes with search value\n')
  printTable(
    ['Score', 'Rule', 'Severity', 'Search value', 'Verify'],
    section.topFixes.map((fix) => [
      fix.score,
      fix.ruleId,
      fix.severity,
      `${fix.scoreFactors.clicks} clicks / ${fix.scoreFactors.sessions} sessions / ${fix.scoreFactors.conversions} conv.`,
      truncate(fix.howToVerify, 72),
    ]),
  )
}

export function reportFollowups(
  report: DiagnoseWorkflowReport,
  input: { crawlStartUrl?: string; projectId?: string } = {},
) {
  const identity = input.projectId
    ? `--project ${shellArg(input.projectId)}`
    : `--site ${shellArg(report.site)}`
  const diagnosis = report.output.narrative.diagnosis
  const commands: Array<{ command: string; why: string }> = []
  const skippedNames = new Set(
    (diagnosis.skippedSections ?? []).map((section) => section.section),
  )

  addFollowup(
    commands,
    `seo refresh-priorities ${identity} --verify-content --limit 25`,
    'Turn the report into a ranked action queue with content checks.',
  )

  if (diagnosis.decay.summary.rows > 0) {
    addFollowup(
      commands,
      `seo decaying ${identity} --limit 25`,
      'Inspect pages and queries losing clicks.',
    )
  }

  if (diagnosis.cannibalization.items.length > 0) {
    addFollowup(
      commands,
      `seo cannibal ${identity} --limit 25`,
      'Find queries split across competing URLs.',
    )
  }

  if (diagnosis.quickWins.summary.eligibleRows > 0) {
    addFollowup(
      commands,
      `seo quick-wins ${identity} --verify-content --verify-limit 5`,
      'Review average-position rows below their heuristic CTR target with optional page evidence.',
    )
  }

  if (diagnosis.strikingDistance.summary.eligibleRows > 0) {
    addFollowup(
      commands,
      `seo second-page ${identity} --verify-content --verify-limit 5`,
      'Work pages sitting just outside page-one rankings.',
    )
  }

  if (
    skippedNames.has('traffic anomaly') ||
    skippedNames.has('update correlation')
  ) {
    addFollowup(
      commands,
      `seo quick-wins ${identity} --min-impressions 10 --verify-content --verify-limit 5`,
      'Sparse GSC data: lower thresholds and look for early content wins.',
    )
    addFollowup(
      commands,
      `seo second-page ${identity} --min-impressions 10 --verify-content --verify-limit 5`,
      'Sparse GSC data: inspect early second-page opportunities.',
    )
  }

  const topMovedPage = diagnosis.segments.page.items.find((item) =>
    item.key.startsWith('http'),
  )
  if (topMovedPage) {
    addFollowup(
      commands,
      `seo audit-page --url ${shellArg(topMovedPage.key)}`,
      'Audit the biggest moved URL for title, metadata, links, and schema.',
    )
  }

  if (input.crawlStartUrl && !hasTechnicalBaseline(report.site)) {
    addFollowup(
      commands,
      `seo crawl --url ${shellArg(input.crawlStartUrl)} ${identity} --save`,
      'Create the first technical crawler baseline with plain-English fixes and JSON-ready issue data.',
    )
  }

  addFollowup(
    commands,
    `seo technical-watch ${identity} --limit 50`,
    'Save a crawl/index baseline so future reports can flag technical drift.',
  )

  return commands.slice(0, 6)
}

function printReportFollowups(
  commands: Array<{ command: string; why: string }>,
): void {
  if (!commands.length) {
    return
  }
  process.stdout.write('\nRecommended next commands\n')
  printTable(
    ['Command', 'Why'],
    commands.map((item) => [item.command, item.why]),
  )
}

function workflowCommandMeta(input: {
  name: string
  description: string
  workflowName?: string
  printFollowups?: boolean
}) {
  return defineCommand({
    meta: input,
    args: {
      site: {
        type: 'string',
        description: 'GSC property URL, for example sc-domain:example.com.',
      },
      client: {
        type: 'string',
        description: 'Legacy alias for --project.',
      },
      project: {
        type: 'string',
        description: 'Saved project id or name.',
      },
      ...cliReportArgs(
        ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
        {
          days: {
            description: 'Diagnosis window length in days. Defaults to 90.',
          },
          limit: {
            description: 'Maximum rows per section. Defaults to 10.',
          },
        },
      ),
      json: {
        type: 'boolean',
        default: false,
        description: 'Print machine-readable JSON.',
      },
    },
    run: async ({ args }) => {
      const json = jsonFlag(args)
      const selection = await resolveClientSelection({
        client: projectArg(args),
        site: stringArg(args.site),
        options: { json, refresh: booleanArg(args.refresh) },
      })
      const report = await diagnosePropertyWorkflow({
        site: selection.site,
        days: numberArg(args.days),
        recentDays: numberArg(args.recent),
        limit: numberArg(args.limit),
        brandTerms: selection.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
        refresh: booleanArg(args.refresh),
      })
      const outputReport = input.workflowName
        ? { ...report, workflow: input.workflowName }
        : report
      const technicalCrawl = input.printFollowups
        ? savedTechnicalSection(selection.site)
        : undefined
      const followups = input.printFollowups
        ? reportFollowups(outputReport, {
            crawlStartUrl:
              selection.client?.startUrl ?? startUrlForSite(selection.site),
            projectId: selection.client?.id,
          })
        : undefined
      if (json) {
        printJson(
          technicalCrawl || followups
            ? {
                ...outputReport,
                ...(technicalCrawl ? { technicalCrawl } : {}),
                ...(followups ? { nextCommands: followups } : {}),
              }
            : outputReport,
        )
        return
      }
      process.stdout.write(`${outputReport.output.narrative.markdown}\n\n`)
      printWorkflow(outputReport)
      printTechnicalSection(technicalCrawl)
      if (followups) printReportFollowups(followups)
    },
  })
}

export const diagnosePropertyWorkflowCommand = workflowCommandMeta({
  name: 'diagnose-property',
  description: 'Agent workflow for full property diagnosis and next actions',
})

export const mainReportCommand = workflowCommandMeta({
  name: 'report',
  workflowName: 'report',
  printFollowups: true,
  description:
    'Run the main SEO report and recommend the next best follow-up commands',
})
