import { diagnosePropertyWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  stringArg,
  projectArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { cliReportArgs } from '../report-options.js'
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

function reportFollowups(report: DiagnoseWorkflowReport) {
  const site = `--site ${shellArg(report.site)}`
  const diagnosis = report.output.narrative.diagnosis
  const commands: Array<{ command: string; why: string }> = []
  const skippedNames = new Set(
    (diagnosis.skippedSections ?? []).map((section) => section.section),
  )

  addFollowup(
    commands,
    `seo refresh-priorities ${site} --verify-content --limit 25`,
    'Turn the report into a ranked action queue with content checks.',
  )

  if (diagnosis.decay.summary.rows > 0) {
    addFollowup(
      commands,
      `seo decaying ${site} --limit 25`,
      'Inspect pages and queries losing clicks.',
    )
  }

  if (diagnosis.cannibalization.items.length > 0) {
    addFollowup(
      commands,
      `seo cannibal ${site} --limit 25`,
      'Find queries split across competing URLs.',
    )
  }

  if (diagnosis.quickWins.summary.rows > 0) {
    addFollowup(
      commands,
      `seo quick-wins ${site} --verify-content --verify-limit 5`,
      'Check high-ranking pages with weak CTR or missing query coverage.',
    )
  }

  if (diagnosis.strikingDistance.summary.opportunities > 0) {
    addFollowup(
      commands,
      `seo second-page ${site} --verify-content --verify-limit 5`,
      'Work pages sitting just outside page-one rankings.',
    )
  }

  if (
    skippedNames.has('traffic anomaly') ||
    skippedNames.has('update correlation')
  ) {
    addFollowup(
      commands,
      `seo quick-wins ${site} --min-impressions 10 --verify-content --verify-limit 5`,
      'Sparse GSC data: lower thresholds and look for early content wins.',
    )
    addFollowup(
      commands,
      `seo second-page ${site} --min-impressions 10 --verify-content --verify-limit 5`,
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

  addFollowup(
    commands,
    `seo technical-watch ${site} --limit 50`,
    'Save a crawl/index baseline so future reports can flag technical drift.',
  )

  return commands.slice(0, 6)
}

function printReportFollowups(report: DiagnoseWorkflowReport): void {
  const commands = reportFollowups(report)
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
      if (json) {
        printJson(outputReport)
        return
      }
      process.stdout.write(`${outputReport.output.narrative.markdown}\n\n`)
      printWorkflow(outputReport)
      if (input.printFollowups) {
        printReportFollowups(outputReport)
      }
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
