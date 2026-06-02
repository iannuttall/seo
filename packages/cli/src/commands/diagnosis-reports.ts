import { trafficAnomaly, updateCorrelation } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printLimitedTable } from './output.js'
import { selectedSiteOrThrow } from './shared.js'

export const trafficAnomalyCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: { type: 'string' },
    recent: { type: 'string' },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
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
      ['Metric', 'Direction', 'Baseline', 'Recent', 'z', 'Significant'],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        anomaly.baselineMean,
        anomaly.comparisonMean,
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
    days: { type: 'string' },
    recent: { type: 'string' },
    'padding-days': { type: 'string' },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await updateCorrelation({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json,
          refresh: booleanArg(args.refresh),
        },
      ),
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
      ['Updates matched', String(report.overlappingUpdates.length)],
    ])
    printLimitedTable(
      ['Metric', 'Direction', 'z', 'Recent'],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        anomaly.zScore,
        `${anomaly.comparisonStart} to ${anomaly.comparisonEnd}`,
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
  },
})
