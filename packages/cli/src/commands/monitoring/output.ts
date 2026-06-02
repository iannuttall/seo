import type { MonitoringStatusReport, technicalWatchWorkflow } from '@seo/core'
import { printKeyValue, printTable } from '../../utils.js'
import { formatCount, printActionDetails, truncate } from '../output.js'
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
      .filter((item) => item.alert || item.changed || item.verdict !== 'PASS')
      .slice(0, 25)
    if (items.length) {
      process.stdout.write('\nIndex issues and changes\n')
      printTable(
        ['Alert', 'Changed', 'Verdict', 'Coverage', 'URL'],
        items.map((item) => [
          item.alert ? 'yes' : 'no',
          item.changed ? 'yes' : 'no',
          item.verdict ?? 'unknown',
          truncate(item.coverageState ?? 'unknown', 40),
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
  printKeyValue([
    ['Property', report.site],
    ['Health', report.health],
    ['Attention', String(report.summary.attention)],
    ['Stale', String(report.summary.stale)],
    ['Not run', String(report.summary.notRun)],
  ])

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
