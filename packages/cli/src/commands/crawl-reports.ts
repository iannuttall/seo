import {
  type CrawlReport,
  type CrawlReportMeta,
  compareCrawlReports,
  crawlSite,
  deleteCrawlReport,
  latestCrawlReport,
  listCrawlReports,
  loadCrawlReport,
  reviewObservations,
  saveCrawlReport,
  topFixes,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { printCrawlHuman } from '../presentation/crawl-report.js'
import { resolveClientSelection } from '../selection.js'
import {
  printJson,
  printKeyValue,
  printSummaryList,
  printTable,
} from '../utils.js'
import { printNotes, truncate } from './output.js'

async function reportSiteFilter(args: Record<string, unknown>, json: boolean) {
  const project = projectArg(args)
  const site = stringArg(args.site)
  if (!project && !site) return undefined
  return (
    await resolveClientSelection({
      client: project,
      site,
      options: { json },
    })
  ).site
}

function printReportList(reports: CrawlReportMeta[]): void {
  printSummaryList(
    reports.map((report) => ({
      title: report.id,
      description: report.site ?? report.url,
      meta: [
        report.status,
        `${report.totalPages} page${report.totalPages === 1 ? '' : 's'}`,
        `${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
        report.createdAt,
      ],
    })),
    { empty: 'No saved crawl reports.' },
  )
}

function printReport(report: CrawlReport): void {
  printCrawlHuman(report)
}

function printReportDiff(report: ReturnType<typeof compareCrawlReports>): void {
  printKeyValue([
    ['Before', `${report.before.id} (${report.before.generatedAt})`],
    ['After', `${report.after.id} (${report.after.generatedAt})`],
    ['Comparability', report.comparability.status],
    ['Completeness', report.completeness.status],
    ['Truncated', report.completeness.truncated ? 'yes' : 'no'],
    ['Headline', report.headline],
    [
      'Pages',
      `${report.after.summary.totalPages} (${report.summary.pageDelta >= 0 ? '+' : ''}${report.summary.pageDelta})`,
    ],
    [
      'Issues',
      `${report.after.summary.highIssues + report.after.summary.mediumIssues + report.after.summary.lowIssues} (${report.summary.issueDelta >= 0 ? '+' : ''}${report.summary.issueDelta})`,
    ],
    ['New status errors', String(report.summary.newStatusErrors)],
    ['Fixed status errors', String(report.summary.fixedStatusErrors)],
    ['Issue groups worse', String(report.summary.issueGroupsWorse)],
    ['Issue groups better', String(report.summary.issueGroupsBetter)],
    ['Changed pages', String(report.summary.changedPages)],
    ['Added pages', String(report.summary.addedPages)],
    ['Removed pages', String(report.summary.removedPages)],
  ])

  if (report.topActions.length) {
    process.stdout.write('\nTop actions\n')
    for (const [index, action] of report.topActions.entries()) {
      process.stdout.write(`${index + 1}. ${action.title}: ${action.action}\n`)
      process.stdout.write(`   ${action.plainEnglish}\n`)
    }
  }

  if (report.pageChanges.length) {
    process.stdout.write('\nChanged pages\n')
    printTable(
      ['Kind', 'Changes', 'URL'],
      report.pageChanges
        .slice(0, 15)
        .map((item) => [
          item.kind,
          item.changes.join(', '),
          truncate(item.url, 80),
        ]),
    )
    if (report.pageChanges.length > 15) {
      process.stdout.write(
        `Showing 15 of ${report.pageChanges.length}. Use --json for all changes.\n`,
      )
    }
  }

  if (report.issueChanges.length) {
    process.stdout.write('\nIssue movement\n')
    printTable(
      ['Rule', 'Before', 'After', 'Delta'],
      report.issueChanges
        .slice(0, 10)
        .map((item) => [
          item.ruleId,
          String(item.before),
          String(item.after),
          `${item.delta >= 0 ? '+' : ''}${item.delta}`,
        ]),
    )
  }

  printNotes('Caveats', report.caveats)
}

function selectReportAliasMeta(
  reports: CrawlReportMeta[],
  input: {
    value: 'latest' | 'previous'
    skipId?: string
  },
): CrawlReportMeta | undefined {
  if (input.value === 'latest') {
    return reports.find((item) => item.id !== input.skipId)
  }

  if (input.skipId) {
    const skippedIndex = reports.findIndex((item) => item.id === input.skipId)
    const older = skippedIndex >= 0 ? reports.slice(skippedIndex + 1) : reports
    return older.find((item) => item.id !== input.skipId)
  }

  return reports[1]
}

function resolveReportAlias(input: {
  value: string
  site?: string
  skipId?: string
}): CrawlReport | undefined {
  if (input.value !== 'latest' && input.value !== 'previous') {
    return loadCrawlReport(input.value)
  }
  const reports = listCrawlReports({ site: input.site, limit: 20 })
  const meta = selectReportAliasMeta(reports, {
    value: input.value,
    skipId: input.skipId,
  })
  return meta ? loadCrawlReport(meta.id) : undefined
}

export const crawlReportsCommand = defineCommand({
  meta: {
    name: 'crawl-reports',
    description: 'List, show, or delete saved crawl reports',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL for filtering reports.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    id: {
      type: 'string',
      description: 'Saved crawl report id to show.',
    },
    latest: {
      type: 'boolean',
      default: false,
      description: 'Show the latest saved crawl report.',
    },
    delete: {
      type: 'string',
      description: 'Delete a saved crawl report by id.',
    },
    rerun: {
      type: 'string',
      description: 'Rerun a saved crawl report by id, or pass latest.',
    },
    compare: {
      type: 'string',
      description: 'Compare a saved report id, latest, or previous.',
    },
    against: {
      type: 'string',
      description: 'Baseline report id. Defaults to previous.',
    },
    limit: {
      type: 'string',
      description: 'Maximum reports to list. Defaults to 20.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const site = await reportSiteFilter(args, json)
    const deleteId = stringArg(args.delete)
    const rerunId = stringArg(args.rerun)
    const compareId = stringArg(args.compare)
    const id = stringArg(args.id)

    if (deleteId) {
      const deleted = deleteCrawlReport(deleteId)
      if (json) {
        printJson({ id: deleteId, deleted })
        return
      }
      process.stdout.write(
        deleted
          ? `Deleted crawl report ${deleteId}.\n`
          : `No saved crawl report found for ${deleteId}.\n`,
      )
      return
    }

    if (rerunId) {
      const previous =
        rerunId === 'latest'
          ? latestCrawlReport(site)
          : loadCrawlReport(rerunId)
      if (!previous) {
        throw new Error(
          rerunId === 'latest'
            ? 'No saved crawl reports found.'
            : `No saved crawl report found for ${rerunId}.`,
        )
      }
      const report = await crawlSite({
        ...previous.config,
        projectId: previous.projectId,
        site: previous.site,
        googleAnalyticsPropertyId: previous.googleAnalyticsPropertyId,
      })
      const saved = saveCrawlReport(report)
      if (json) {
        printJson({
          ...report,
          rerunOf: previous.id,
          saved,
          topFixes: topFixes(report),
          reviewObservations: reviewObservations(report),
        })
        return
      }
      process.stdout.write(`Reran crawl report ${previous.id}.\n\n`)
      printReport(report)
      return
    }

    if (compareId) {
      const after = resolveReportAlias({ value: compareId, site })
      if (!after) {
        throw new Error(`No saved crawl report found for ${compareId}.`)
      }
      const beforeAlias = stringArg(args.against) ?? 'previous'
      const before = resolveReportAlias({
        value: beforeAlias,
        site: after.site ?? site,
        skipId: after.id,
      })
      if (!before) {
        throw new Error(
          `No baseline crawl report found for ${beforeAlias}. Save at least two reports or pass --against <id>.`,
        )
      }
      const diff = compareCrawlReports({ before, after })
      if (json) {
        printJson(diff)
        return
      }
      printReportDiff(diff)
      return
    }

    if (id || booleanArg(args.latest)) {
      const report = id ? loadCrawlReport(id) : latestCrawlReport(site)
      if (!report) {
        throw new Error(
          id
            ? `No saved crawl report found for ${id}.`
            : 'No saved crawl reports found.',
        )
      }
      if (json) {
        printJson(report)
        return
      }
      printReport(report)
      return
    }

    const reports = listCrawlReports({
      site,
      limit: numberArg(args.limit),
    })
    if (json) {
      printJson({ reports })
      return
    }
    printReportList(reports)
  },
})
