import { type EntityReadinessReport, entityReadiness } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printNotes } from './output.js'
import { resolveSavedCrawlReport } from './readiness.js'

function printEntityReadiness(report: EntityReadinessReport): void {
  process.stdout.write(`Entity evidence for ${report.url}\n\n`)
  printKeyValue([
    ['Assessment', 'evidence only'],
    ['Data', report.dataStatus],
    ['Evaluated pages', `${report.evaluatedPages}/${report.crawlPages}`],
    ['Report', report.reportId],
    ['sameAs profiles', String(report.entities.sameAs.length)],
    ['Social profiles', String(report.entities.socialProfiles.length)],
    ['Authors', String(report.entities.authors.length)],
  ])
  process.stdout.write(`\n${report.headline}\n`)

  const schemaRows = Object.entries(report.entities.schemaTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (schemaRows.length) {
    process.stdout.write('\nSchema types\n')
    printTable(
      ['Type', 'Pages'],
      schemaRows.map(([type, count]) => [type, String(count)]),
    )
  }

  printNotes('sameAs', report.entities.sameAs.slice(0, 10))
  printNotes('Social profiles', report.entities.socialProfiles.slice(0, 10))
}

export const entityReadinessCommand = defineCommand({
  meta: {
    name: 'entity-readiness',
    description:
      'Check schema, sameAs, social, author, and naming signals from a saved crawl',
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
    const readiness = entityReadiness(report)
    if (json) {
      printJson(readiness)
      return
    }
    printEntityReadiness(readiness)
  },
})
