import {
  type CrawlReport,
  type CrawlReportMeta,
  crawlSite,
  deleteCrawlReport,
  latestCrawlReport,
  listCrawlReports,
  loadCrawlReport,
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
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
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
  if (!reports.length) {
    process.stdout.write('No saved crawl reports found.\n')
    return
  }
  printTable(
    ['Created', 'Status', 'Pages', 'Issues', 'Site', 'ID'],
    reports.map((report) => [
      report.createdAt,
      report.status,
      String(report.totalPages),
      String(report.issueCount),
      report.site ?? '-',
      report.id,
    ]),
  )
}

function printReport(report: CrawlReport): void {
  printKeyValue([
    ['ID', report.id],
    ['URL', report.config.url],
    ['Site', report.site ?? '-'],
    ['Status', report.status],
    ['Generated', report.generatedAt],
    ['Pages', String(report.summary.totalPages)],
    ['Discovered', String(report.summary.discoveredUrls)],
    ['Queued', String(report.summary.queuedUrls)],
    ['Skipped', String(report.summary.skippedUrls)],
    ['Failed fetches', String(report.summary.failedUrls)],
    ['Verified links', String(report.summary.verifiedLinks)],
    ['Indexable', String(report.summary.indexablePages)],
    ['Issues', String(report.issues.length)],
    ['High', String(report.summary.highIssues)],
    ['Medium', String(report.summary.mediumIssues)],
    ['Low', String(report.summary.lowIssues)],
  ])

  if (report.issueGroups.length) {
    process.stdout.write('\nTop issues\n')
    printTable(
      ['Severity', 'Rule', 'Count', 'Sample URL'],
      report.issueGroups
        .slice(0, 10)
        .map((group) => [
          group.severity,
          group.ruleId,
          String(group.count),
          truncate(group.sampleUrls[0] ?? '', 64),
        ]),
    )
  }

  printNotes('Warnings', report.warnings.slice(0, 10))
  printNotes('Caveats', report.caveats)
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
        ga4PropertyId: previous.ga4PropertyId,
      })
      const saved = saveCrawlReport(report)
      if (json) {
        printJson({
          ...report,
          rerunOf: previous.id,
          saved,
          topFixes: topFixes(report),
        })
        return
      }
      process.stdout.write(`Reran crawl report ${previous.id}.\n\n`)
      printReport(report)
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
