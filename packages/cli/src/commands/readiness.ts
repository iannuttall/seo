import {
  type AiReadinessReport,
  aiReadiness,
  type CrawlReport,
  latestCrawlReport,
  loadCrawlReport,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printNotes, truncate } from './output.js'

export async function resolveSavedCrawlReport(
  args: Record<string, unknown>,
  options: { json?: boolean } = {},
): Promise<CrawlReport> {
  const reportId = stringArg(args['report-id'])
  if (reportId) {
    const report = loadCrawlReport(reportId)
    if (!report) throw new Error(`No saved crawl report found for ${reportId}.`)
    return report
  }

  const project = projectArg(args)
  const site = stringArg(args.site)
  const selection =
    project || site
      ? await resolveClientSelection({
          client: project,
          site,
          options,
        })
      : undefined
  const report = latestCrawlReport(selection?.site)
  if (!report) {
    throw new Error(
      selection?.site
        ? `No saved crawl report found for ${selection.site}. Run \`seo crawl --project ${selection.client?.id ?? selection.site} --save\` first.`
        : 'No saved crawl report found. Run `seo crawl <url> --save` first, or pass --report-id.',
    )
  }
  return report
}

function printAiReadiness(report: AiReadinessReport): void {
  process.stdout.write(`AI-search evidence for ${report.url}\n\n`)
  printKeyValue([
    ['Assessment', 'evidence only'],
    ['Data', report.dataStatus],
    ['Report', report.reportId],
  ])
  process.stdout.write(`\n${report.headline}\n`)

  if (report.topActions.length) {
    process.stdout.write('\nTop actions\n')
    printTable(
      ['Status', 'Check', 'Action'],
      report.topActions.map((action) => [
        action.status,
        action.title,
        truncate(action.action, 96),
      ]),
    )
  }

  if (report.botAccess.length) {
    process.stdout.write('\nBot access\n')
    printTable(
      ['User agent', 'Allowed', 'Declared'],
      report.botAccess.map((bot) => [
        bot.userAgent,
        bot.allowed === null ? 'unknown' : bot.allowed ? 'yes' : 'no',
        bot.declared ? 'yes' : bot.coveredByWildcard ? 'wildcard' : 'no',
      ]),
    )
  }

  printNotes('Caveats', report.caveats)
}

export const aiReadinessCommand = defineCommand({
  meta: {
    name: 'ai-readiness',
    description:
      'Review AI-search technical evidence and optional observations',
  },
  args: {
    'report-id': {
      type: 'string',
      description: 'Saved crawl report id to analyze.',
    },
    site: {
      type: 'string',
      description: 'GSC property URL for selecting the latest saved crawl.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await resolveSavedCrawlReport(args, { json })
    const readiness = aiReadiness(report)
    if (json) {
      printJson(readiness)
      return
    }
    printAiReadiness(readiness)
  },
})
