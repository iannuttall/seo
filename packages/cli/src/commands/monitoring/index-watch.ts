import { indexCoveragePlan, indexMonitor, indexWatch } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

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
      printKeyValue([
        ['Property', report.site],
        ['Sitemap URLs', String(report.summary.urlCount)],
        ['Properties used', String(report.summary.properties)],
        ['Daily capacity', String(report.summary.dailyCapacity)],
        ['Estimated cycle', `${report.summary.estimatedCycleDays} day(s)`],
        ['Target cycle', `${report.summary.targetCycleDays} day(s)`],
        ['Suggested properties', String(report.summary.suggestedProperties)],
      ])
      if (report.properties.length) {
        printTable(
          ['Property', 'URLs', 'Cycle', 'Sample URL'],
          report.properties.map((property) => [
            property.property,
            property.urlCount,
            `${property.cycleDays} day(s)`,
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
            `${suggestion.estimatedCycleDays} day(s)`,
            suggestion.reason,
          ]),
        )
      }
      if (report.warnings.length) {
        process.stdout.write('\nWarnings\n')
        for (const warning of report.warnings.slice(0, 10)) {
          process.stdout.write(`- ${warning}\n`)
        }
      }
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
      printKeyValue([
        ['Property', report.site],
        ['Inventory URLs', String(report.summary.inventoryUrls)],
        ['Properties used', String(report.summary.properties)],
        ['Daily capacity', String(report.summary.dailyCapacity)],
        ['Selected this run', String(report.summary.selected)],
        ['Inspected', String(report.summary.inspected)],
        ['Changed', String(report.summary.changed)],
        ['Alerts', String(report.summary.alerts)],
        ['Skipped', String(report.summary.skipped)],
      ])
      if (report.properties.length) {
        printTable(
          ['Property', 'Inventory', 'Selected', 'Inspected', 'Alerts'],
          report.properties.map((property) => [
            property.property,
            property.inventoryUrls,
            property.selectedUrls,
            property.inspected,
            property.alerts,
          ]),
        )
      }
      const issueItems = report.items
        .filter((item) => item.alert || item.changed || item.verdict !== 'PASS')
        .slice(0, 50)
      if (issueItems.length) {
        process.stdout.write('\nIndex issues and changes\n')
        printTable(
          ['Alert', 'Changed', 'Verdict', 'Coverage', 'URL'],
          issueItems.map((item) => [
            item.alert ? 'yes' : 'no',
            item.changed ? 'yes' : 'no',
            item.verdict ?? 'unknown',
            item.coverageState ?? 'unknown',
            item.url,
          ]),
        )
      }
      if (report.warnings.length) {
        process.stdout.write('\nWarnings\n')
        for (const warning of report.warnings.slice(0, 10)) {
          process.stdout.write(`- ${warning}\n`)
        }
      }
      return
    }

    if (!urls.length) throw new Error('Pass at least one URL with --urls.')

    const report = await indexWatch({
      site,
      urls,
      languageCode: stringArg(args.language),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Inspected', String(report.summary.inspected)],
      ['Changed', String(report.summary.changed)],
      ['Alerts', String(report.summary.alerts)],
    ])
    printTable(
      ['Alert', 'Changed', 'Verdict', 'Coverage', 'URL'],
      report.items.map((item) => [
        item.alert ? 'yes' : 'no',
        item.changed ? 'yes' : 'no',
        item.verdict ?? 'unknown',
        item.coverageState ?? 'unknown',
        item.url,
      ]),
    )
  },
})
