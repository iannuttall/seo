import { trafficAnomaly, updateCorrelation } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { printJson, printTable } from '../utils.js'
import {
  printLimitedTable,
  printNextCommand,
  printNotes,
  printReportSummary,
} from './output.js'
import { cliReportArgs } from './report-options.js'
import { selectedSiteOrThrow } from './shared.js'

function formatNumber(value: number): string {
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })
}

function formatChange(value: number | null): string {
  if (value === null) return 'n/a'
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${value > 0 ? '+' : ''}${rounded}%`
}

export const trafficAnomalyCommand = defineCommand({
  meta: {
    name: 'traffic-anomaly',
    description: 'Detect unusual recent GSC traffic movement',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
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
        { client: projectArg(args), site: stringArg(args.site) },
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
    printReportSummary({
      title: 'Traffic anomaly report',
      target: report.site,
      status:
        report.coverage?.status !== 'complete'
          ? 'unknown'
          : report.anomalies.some((anomaly) => anomaly.significant)
            ? 'warning'
            : 'pass',
      summary: report.anomalies.some((anomaly) => anomaly.significant)
        ? 'At least one recent metric moved beyond the report threshold.'
        : 'No significant recent movement was found in the retained evidence.',
      metrics: [
        { label: 'Metrics checked', value: report.anomalies.length },
        {
          label: 'Significant',
          value: report.anomalies.filter((anomaly) => anomaly.significant)
            .length,
        },
        {
          label: 'Observed days',
          value: report.coverage?.observedDays ?? 'Unavailable',
        },
        {
          label: 'Expected days',
          value: report.coverage?.expectedDays ?? 'Unavailable',
        },
      ],
    })
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
        anomaly.zScore ?? 'n/a',
        anomaly.significant ? 'yes' : 'no',
      ]),
    )
    if (report.coverage) {
      printNotes('Evidence coverage', [
        `${report.coverage.observedDays} of ${report.coverage.expectedDays} requested calendar days returned date aggregates.`,
        ...report.coverage.caveats,
      ])
    }
  },
})

export const updateCorrelateCommand = defineCommand({
  meta: {
    name: 'update-correlate',
    description: 'Compare traffic movement with official Google update windows',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
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
    'known-change': {
      type: 'string',
      description:
        'Manual site-side change to treat as a confounder, for example pruning pages or blocking traffic.',
    },
    'ignore-change-log': {
      type: 'boolean',
      default: false,
      description: 'Do not use saved change-log entries as confounders.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const client = projectArg(args)
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
      knownConfounders: stringArg(args['known-change'])
        ? [stringArg(args['known-change']) ?? '']
        : undefined,
      includeChangeLog: !booleanArg(args['ignore-change-log']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Google update correlation',
      target: report.site,
      status: 'unknown',
      summary: report.summary,
      metrics: [
        {
          label: 'Classification',
          value: report.classification.replaceAll('-', ' '),
        },
        {
          label: 'Attribution',
          value: report.attribution.replaceAll('-', ' '),
        },
        { label: 'Confidence', value: report.confidence },
        { label: 'Updates matched', value: report.overlappingUpdates.length },
        { label: 'Known confounders', value: report.confounders.length },
        { label: 'Source', value: report.source.name },
      ],
    })
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
        anomaly.zScore ?? 'n/a',
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
      ? `--project ${JSON.stringify(client)}`
      : `--site ${JSON.stringify(site)}`
    printNextCommand(`seo segment-impact ${target} --dimension page`)
  },
})
