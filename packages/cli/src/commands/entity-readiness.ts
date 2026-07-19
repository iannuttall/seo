import { type EntityReadinessReport, entityReadiness } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { printJson, printSemanticReport } from '../utils.js'
import { resolveSavedCrawlReport } from './readiness.js'

function printEntityReadiness(report: EntityReadinessReport): void {
  printSemanticReport({
    title: 'Entity evidence',
    target: report.url,
    status: report.dataStatus === 'partial' ? 'unknown' : 'info',
    summary: report.headline,
    metrics: [
      {
        label: 'Pages',
        value: `${report.evaluatedPages}/${report.crawlPages}`,
      },
      { label: 'sameAs', value: report.entities.sameAs.length },
      { label: 'Social', value: report.entities.socialProfiles.length },
      { label: 'Authors', value: report.entities.authors.length },
    ],
    sections: [
      {
        title: 'Observed entity signals',
        diagnostics: report.checks.map((check) => ({
          status: check.status,
          title: check.title,
          explanation: check.plainEnglish,
          fix: check.action,
          evidence: (check.urls ?? []).slice(0, 5),
        })),
      },
    ],
    notes: [
      `Data: ${report.dataStatus}. Report: ${report.reportId}.`,
      ...report.caveats,
    ],
  })
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
