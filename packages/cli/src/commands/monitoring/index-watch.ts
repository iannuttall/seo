import {
  countLabel,
  indexCoveragePlan,
  indexMonitor,
  indexWatch,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { printNotes, printReportSummary } from '../output.js'

export const indexWatchCommand = defineCommand({
  meta: {
    name: 'index-watch',
    description: 'Inspect URLs with GSC and alert on index status changes',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs to inspect.',
    },
    sitemaps: {
      type: 'string',
      description:
        'Comma-separated XML sitemap URLs to plan quota-aware monitoring.',
    },
    plan: {
      type: 'boolean',
      default: false,
      description:
        'Plan sitemap URL allocation across GSC properties without inspecting URLs.',
    },
    properties: {
      type: 'string',
      description:
        'Comma-separated GSC properties to use for planning. Defaults to account properties.',
    },
    'daily-limit': {
      type: 'string',
      description: 'URL Inspection daily limit per property. Defaults to 2000.',
    },
    'target-days': {
      type: 'string',
      description:
        'Target number of days to inspect all monitored URLs. Defaults to 1.',
    },
    'max-urls': {
      type: 'string',
      description:
        'Maximum sitemap URLs to load for planning. Defaults to 50000.',
    },
    'inspect-limit': {
      type: 'string',
      description:
        'Maximum URLs to inspect in this run from sitemap mode. Defaults to 100.',
    },
    language: {
      type: 'string',
      description: 'Optional URL Inspection language code.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const urls = listArg(args.urls)
    const site = await resolveSite({
      site: stringArg(args.site),
      options: { json },
    })

    const sitemaps = listArg(args.sitemaps)

    if (booleanArg(args.plan)) {
      if (!sitemaps.length) {
        throw new Error('Pass at least one sitemap with --sitemaps.')
      }
      const report = await indexCoveragePlan({
        site,
        sitemaps,
        properties: listArg(args.properties).length
          ? listArg(args.properties)
          : undefined,
        dailyLimit: numberArg(args['daily-limit']),
        targetCycleDays: numberArg(args['target-days']),
        maxUrls: numberArg(args['max-urls']),
      })
      if (json) {
        printJson(report)
        return
      }
      printReportSummary({
        title: 'Index monitoring plan',
        target: report.site,
        status: report.warnings.length > 0 ? 'warning' : 'info',
        summary: `${report.summary.urlCount} sitemap URLs can be checked in an estimated ${countLabel(report.summary.estimatedCycleDays, 'day')}.`,
        metrics: [
          { label: 'Sitemap URLs', value: report.summary.urlCount },
          { label: 'Properties', value: report.summary.properties },
          { label: 'Daily capacity', value: report.summary.dailyCapacity },
          {
            label: 'Target cycle',
            value: countLabel(report.summary.targetCycleDays, 'day'),
          },
          {
            label: 'Suggested properties',
            value: report.summary.suggestedProperties,
          },
        ],
      })
      if (report.properties.length) {
        printTable(
          ['Property', 'URLs', 'Cycle', 'Sample URL'],
          report.properties.map((property) => [
            property.property,
            property.urlCount,
            countLabel(property.cycleDays, 'day'),
            property.sampleUrls[0] ?? '-',
          ]),
        )
      }
      if (report.suggestions.length) {
        process.stdout.write('\nSuggested URL-prefix properties\n')
        printTable(
          ['Property', 'URLs', 'Current property', 'Cycle', 'Reason'],
          report.suggestions.map((suggestion) => [
            suggestion.property,
            suggestion.urlCount,
            suggestion.currentProperty,
            countLabel(suggestion.estimatedCycleDays, 'day'),
            suggestion.reason,
          ]),
        )
      }
      printNotes('Warnings', report.warnings.slice(0, 10))
      return
    }

    if (sitemaps.length) {
      const report = await indexMonitor({
        site,
        sitemaps,
        properties: listArg(args.properties).length
          ? listArg(args.properties)
          : undefined,
        dailyLimit: numberArg(args['daily-limit']),
        inspectLimit: numberArg(args['inspect-limit']),
        maxUrls: numberArg(args['max-urls']),
        languageCode: stringArg(args.language),
      })
      if (json) {
        printJson(report)
        return
      }
      printReportSummary({
        title: 'Index monitoring run',
        target: report.site,
        status:
          report.summary.failed > 0 || report.summary.quotaBlocked > 0
            ? 'unknown'
            : report.summary.alerts > 0 || report.summary.regressions > 0
              ? 'warning'
              : report.summary.attempted > 0
                ? 'pass'
                : 'info',
        summary: `${report.summary.inspected} URLs inspected, with ${report.summary.alerts} new alerts and ${report.summary.regressions} regressions.`,
        metrics: [
          { label: 'Inventory URLs', value: report.summary.inventoryUrls },
          { label: 'Selected', value: report.summary.selected },
          { label: 'Inspected', value: report.summary.inspected },
          { label: 'Failed', value: report.summary.failed },
          { label: 'Quota blocked', value: report.summary.quotaBlocked },
          { label: 'Current reviews', value: report.summary.currentIssues },
          { label: 'Regressions', value: report.summary.regressions },
          { label: 'Recoveries', value: report.summary.recoveries },
          { label: 'New alerts', value: report.summary.alerts },
        ],
      })
      if (report.properties.length) {
        printTable(
          [
            'Property',
            'Inventory',
            'Selected',
            'Inspected',
            'Failed',
            'Current',
            'Alerts',
          ],
          report.properties.map((property) => [
            property.property,
            property.inventoryUrls,
            property.selectedUrls,
            property.inspected,
            property.failed + property.quotaBlocked,
            property.currentIssues,
            property.alerts,
          ]),
        )
      }
      const issueItems = report.items
        .filter(
          (item) =>
            item.currentIssue ||
            item.changed ||
            item.inspectionStatus !== 'succeeded',
        )
        .slice(0, 50)
      if (issueItems.length) {
        process.stdout.write('\nIndex reviews, changes, and failed checks\n')
        printTable(
          ['Check', 'Change', 'Index state', 'Evidence', 'URL'],
          issueItems.map((item) => [
            item.inspectionStatus,
            item.changeKind,
            item.indexStatus,
            (item.errorCode ?? item.issueCodes.join(', ')) || 'none',
            item.url,
          ]),
        )
      }
      printNotes('Warnings', report.warnings.slice(0, 10))
      return
    }

    if (!urls.length) throw new Error('Pass at least one URL with --urls.')

    const report = await indexWatch({
      site,
      urls,
      languageCode: stringArg(args.language),
      dailyLimit: numberArg(args['daily-limit']),
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Index watch',
      target: report.site,
      status:
        report.summary.failed > 0 || report.summary.quotaBlocked > 0
          ? 'unknown'
          : report.summary.alerts > 0 || report.summary.regressions > 0
            ? 'warning'
            : report.summary.attempted > 0
              ? 'pass'
              : 'info',
      summary: `${report.summary.inspected} URLs inspected, with ${report.summary.alerts} new alerts.`,
      metrics: [
        { label: 'Property', value: report.source.property },
        { label: 'Attempted', value: report.summary.attempted },
        { label: 'Inspected', value: report.summary.inspected },
        { label: 'Failed', value: report.summary.failed },
        { label: 'Quota blocked', value: report.summary.quotaBlocked },
        { label: 'Current reviews', value: report.summary.currentIssues },
        { label: 'Regressions', value: report.summary.regressions },
        { label: 'Recoveries', value: report.summary.recoveries },
        { label: 'New alerts', value: report.summary.alerts },
      ],
    })
    printTable(
      ['Check', 'Change', 'Index state', 'Evidence', 'URL'],
      report.items.map((item) => [
        item.inspectionStatus,
        item.changeKind,
        item.indexStatus,
        (item.errorCode ?? item.issueCodes.join(', ')) || 'none',
        item.url,
      ]),
    )
  },
})
