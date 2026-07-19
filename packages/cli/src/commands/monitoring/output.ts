import type { MonitoringStatusReport, technicalWatchWorkflow } from '@seo/core'
import { printTable } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printReportSummary,
  truncate,
} from '../output.js'
import { printWorkflow } from '../workflows/output.js'

type TechnicalWatchReport = Awaited<ReturnType<typeof technicalWatchWorkflow>>

export function printMonitoringRun(report: TechnicalWatchReport): void {
  printWorkflow(report)

  if (report.output.crawl?.recommendations.length) {
    process.stdout.write('\nCrawl actions\n')
    printTable(
      ['Severity', 'URL', 'Action'],
      report.output.crawl.recommendations
        .slice(0, 10)
        .map((item) => [
          item.severity,
          truncate(item.url, 56),
          truncate(item.action, 72),
        ]),
    )
    printActionDetails(
      'Top crawl actions',
      report.output.crawl.recommendations.map((item) => ({
        label: item.severity,
        context: truncate(item.url, 96),
        action: item.action,
      })),
    )
  }

  if (report.output.index?.items.length) {
    const items = report.output.index.items
      .filter(
        (item) =>
          item.currentIssue ||
          item.changed ||
          item.inspectionStatus !== 'succeeded',
      )
      .slice(0, 25)
    if (items.length) {
      process.stdout.write('\nIndex reviews, changes, and failed checks\n')
      printTable(
        ['Check', 'Change', 'Index state', 'Evidence', 'URL'],
        items.map((item) => [
          item.inspectionStatus,
          item.changeKind,
          item.indexStatus,
          truncate(
            (item.errorCode ?? item.issueCodes.join(', ')) || 'none',
            40,
          ),
          truncate(item.url, 64),
        ]),
      )
    }
  }

  if (report.output.recovery?.items.length) {
    process.stdout.write('\nRecoverable URLs\n')
    printTable(
      ['Severity', 'Issue', 'Clicks', 'Impr', 'URL', 'Action'],
      report.output.recovery.items
        .slice(0, 10)
        .map((item) => [
          item.severity,
          item.issue,
          formatCount(item.clicks),
          formatCount(item.impressions),
          truncate(item.url, 56),
          truncate(item.recommendation.action, 72),
        ]),
    )
    printActionDetails(
      'Top recovery actions',
      report.output.recovery.items.map((item) => ({
        label: truncate(item.url, 96),
        context: `${item.severity}, ${formatCount(item.clicks)} clicks at risk`,
        action: item.recommendation.action,
      })),
    )
  }
}

export function printMonitoringStatus(report: MonitoringStatusReport): void {
  printReportSummary({
    title: 'Technical monitoring status',
    target: report.site,
    status:
      report.health === 'clear'
        ? 'pass'
        : report.health === 'attention'
          ? 'warning'
          : 'unknown',
    summary:
      report.summary.attention > 0
        ? `${report.summary.attention} checks need attention.`
        : report.summary.stale > 0 || report.summary.notRun > 0
          ? `${report.summary.stale} checks are stale and ${report.summary.notRun} have not run.`
          : 'No monitoring checks currently need attention.',
    metrics: [
      { label: 'Health', value: report.health },
      { label: 'Attention', value: report.summary.attention },
      { label: 'Stale', value: report.summary.stale },
      { label: 'Not run', value: report.summary.notRun },
    ],
  })

  printTable(
    ['Check', 'Status', 'Last run', 'Summary'],
    report.checks.map((check) => [
      check.name,
      check.status,
      check.lastRunAt ?? '-',
      check.summary,
    ]),
  )

  const actions = report.checks.filter((check) => check.action)
  if (actions.length) {
    process.stdout.write('\nNext actions\n')
    printTable(
      ['Check', 'Action'],
      actions.map((check) => [check.name, truncate(check.action ?? '', 96)]),
    )
    printActionDetails(
      'Next action details',
      actions.map((check) => ({
        label: check.name,
        action: check.action ?? '',
      })),
    )
  }
}
