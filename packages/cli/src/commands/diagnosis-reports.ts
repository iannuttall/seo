import { trafficAnomaly, updateCorrelation } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printLimitedTable, printNextCommand, printNotes } from './output.js'
import { cliReportArgs } from './report-options.js'
import { selectedSiteOrThrow } from './shared.js'

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })
}

function formatChange(value: number): string {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${value > 0 ? '+' : ''}${rounded}%`
}

export const trafficAnomalyCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    ...cliReportArgs(['days', 'recentDays', 'refresh'], {
      days: { description: 'Baseline window length in days. Defaults to 90.' },
      recentDays: {
        description: 'Recent anomaly window in days. Defaults to 7.',
      },
      refresh: {
        description: 'Bypass local cache and fetch fresh GSC data.',
      },
    }),
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await trafficAnomaly({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json,
          refresh: booleanArg(args.refresh),
        },
      ),
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printLimitedTable(
      [
        'Metric',
        'Direction',
        'Baseline/day',
        'Recent/day',
        'Change',
        'z',
        'Significant',
      ],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        formatNumber(anomaly.baselineMean),
        formatNumber(anomaly.comparisonMean),
        formatChange(anomaly.percentChange),
        anomaly.zScore,
        anomaly.significant ? 'yes' : 'no',
      ]),
    )
  },
})

export const updateCorrelateCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    ...cliReportArgs(['days', 'recentDays', 'refresh'], {
      days: { description: 'Baseline window length in days. Defaults to 90.' },
      recentDays: {
        description: 'Recent anomaly window in days. Defaults to 7.',
      },
      refresh: {
        description: 'Bypass local cache and fetch fresh GSC data.',
      },
    }),
    'padding-days': {
      type: 'string',
      description: 'Days around update windows to count as overlap.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const client = stringArg(args.client)
    const site = await selectedSiteOrThrow(
      { client, site: stringArg(args.site) },
      {
        json,
        refresh: booleanArg(args.refresh),
      },
    )
    const report = await updateCorrelation({
      site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      paddingDays: numberArg(args['padding-days']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Classification', report.classification],
      ['Confidence', report.confidence],
      ['Updates matched', String(report.overlappingUpdates.length)],
      ['Source', report.source.name],
    ])
    process.stdout.write(`\n${report.summary}\n`)
    printNotes('Evidence', report.evidence)
    printNotes('Report caveats', report.caveats)
    printNotes('Recommended next checks', report.actions)
    printLimitedTable(
      ['Metric', 'Direction', 'Baseline/day', 'Recent/day', 'Change', 'z'],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        formatNumber(anomaly.baselineMean),
        formatNumber(anomaly.comparisonMean),
        formatChange(anomaly.percentChange),
        anomaly.zScore,
      ]),
    )
    if (report.overlappingUpdates.length) {
      process.stdout.write('\nUpdates\n')
      printTable(
        ['Start', 'End', 'Type', 'Name'],
        report.overlappingUpdates.map((update) => [
          update.start.slice(0, 10),
          update.end?.slice(0, 10) ?? 'open',
          update.type,
          update.name,
        ]),
      )
    }
    const target = client
      ? `--client ${JSON.stringify(client)}`
      : `--site ${JSON.stringify(site)}`
    printNextCommand(`seo segment-impact ${target} --dimension page`)
  },
})
