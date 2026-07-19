import {
  type ChangeMeasurement,
  type ChangeScope,
  listChanges,
  measureChange,
  recordChange,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  strictNumberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { formatCount, printNotes, printReportSummary } from '../output.js'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function changeScope(value: unknown): ChangeScope {
  const scope = stringArg(value) ?? 'page'
  if (
    scope !== 'site' &&
    scope !== 'page' &&
    scope !== 'query' &&
    scope !== 'group'
  ) {
    throw new Error('Invalid --scope. Use site, page, query, or group.')
  }
  return scope
}

function maybeScope(value: unknown): ChangeScope | undefined {
  return value ? changeScope(value) : undefined
}

function pct(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)}%`
}

function countMetric(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'unavailable'
    : formatCount(value)
}

function countDelta(value: number | null, percentage: number | null): string {
  return value === null
    ? 'unavailable'
    : `${formatCount(value)} (${pct(percentage)})`
}

function decimalMetric(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined
    ? 'unavailable'
    : value.toFixed(digits)
}

function printMeasurement(report: ChangeMeasurement): void {
  printReportSummary({
    title: 'SEO test report',
    target: report.change.title,
    status: report.dataStatus === 'complete' ? 'info' : 'unknown',
    summary: report.note,
    metrics: [
      { label: 'Verdict', value: report.verdict },
      { label: 'Confidence', value: report.confidence },
      {
        label: 'Before',
        value: `${report.before.startDate} to ${report.before.endDate}`,
      },
      {
        label: 'After',
        value: `${report.after.startDate} to ${report.after.endDate}`,
      },
      {
        label: 'Window',
        value: `${report.window.effectiveDays}/${report.window.requestedDays} finalized days`,
      },
    ],
  })
  printTable(
    ['Metric', 'Before', 'After', 'Delta'],
    [
      [
        'GSC clicks',
        countMetric(report.before.metrics?.clicks),
        countMetric(report.after.metrics?.clicks),
        countDelta(report.delta.clicks, report.delta.clickPct),
      ],
      [
        'GSC impressions',
        countMetric(report.before.metrics?.impressions),
        countMetric(report.after.metrics?.impressions),
        countDelta(report.delta.impressions, report.delta.impressionPct),
      ],
      [
        'GSC CTR',
        report.before.metrics
          ? `${(report.before.metrics.ctr * 100).toFixed(1)}%`
          : 'unavailable',
        report.after.metrics
          ? `${(report.after.metrics.ctr * 100).toFixed(1)}%`
          : 'unavailable',
        report.delta.ctr === null
          ? 'unavailable'
          : `${(report.delta.ctr * 100).toFixed(1)} pts`,
      ],
      [
        'GSC position',
        decimalMetric(report.before.metrics?.position),
        decimalMetric(report.after.metrics?.position),
        decimalMetric(report.delta.position),
      ],
    ],
  )

  if (report.analytics) {
    process.stdout.write('\nGoogle Analytics impact\n')
    printTable(
      ['Metric', 'Before', 'After', 'Delta'],
      [
        [
          'Sessions',
          formatCount(report.analytics.before.metrics.sessions),
          formatCount(report.analytics.after.metrics.sessions),
          `${formatCount(report.analytics.delta.sessions)} (${pct(report.analytics.delta.sessionPct)})`,
        ],
        [
          'Conversions',
          formatCount(report.analytics.before.metrics.conversions),
          formatCount(report.analytics.after.metrics.conversions),
          `${formatCount(report.analytics.delta.conversions)} (${pct(report.analytics.delta.conversionPct)})`,
        ],
        [
          'Revenue',
          report.analytics.before.metrics.totalRevenue.toFixed(2),
          report.analytics.after.metrics.totalRevenue.toFixed(2),
          `${report.analytics.delta.totalRevenue.toFixed(2)} (${pct(report.analytics.delta.revenuePct)})`,
        ],
      ],
    )
  }

  if (report.control) {
    process.stdout.write('\nControl comparison\n')
    printKeyValue([
      ['Control', report.control.change.title],
      [
        'Adjusted clicks',
        report.control.adjusted.clickDelta === null
          ? 'n/a'
          : formatCount(report.control.adjusted.clickDelta),
      ],
      [
        'Adjusted click %',
        report.control.adjusted.clickPctPoints === null
          ? 'n/a'
          : `${report.control.adjusted.clickPctPoints.toFixed(1)} pts`,
      ],
      ['Note', report.control.note],
    ])
  }
  printNotes('Warnings', report.warnings)
  printNotes('Caveats', report.caveats)
}

export const testsCommand = defineCommand({
  meta: {
    name: 'tests',
    description:
      'Create and report local SEO tests from Search Console and Google Analytics data',
  },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List saved SEO tests' },
      args: {
        site: { type: 'string', description: 'GSC property URL.' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        limit: {
          type: 'string',
          description: 'Maximum tests to list. Defaults to 20.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const project = projectArg(args)
        const selection =
          project || stringArg(args.site)
            ? await resolveClientSelection({
                client: project,
                site: stringArg(args.site),
                options: { json },
              })
            : undefined
        const changes = listChanges({
          site: selection?.site,
          limit: numberArg(args.limit),
        })
        if (json) {
          printJson({ tests: changes })
          return
        }
        printTable(
          ['ID', 'Date', 'Scope', 'Target', 'Title'],
          changes.map((change) => [
            change.id,
            change.changedAt,
            change.scope,
            change.target,
            change.title,
          ]),
        )
      },
    }),
    create: defineCommand({
      meta: { name: 'create', description: 'Create a local SEO test' },
      args: {
        site: { type: 'string', description: 'GSC property URL.' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        scope: {
          type: 'string',
          default: 'page',
          description: 'Change scope: site, page, query, or group.',
        },
        target: {
          type: 'string',
          required: true,
          description: 'Changed URL, query, group pattern, or site marker.',
        },
        title: {
          type: 'string',
          required: true,
          description: 'Plain-English name for the test.',
        },
        description: {
          type: 'string',
          description: 'Optional note about what changed.',
        },
        date: {
          type: 'string',
          description: 'Change date in YYYY-MM-DD. Defaults to today.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: projectArg(args),
          site: stringArg(args.site),
          options: { json },
        })
        const change = recordChange({
          site: selection.site,
          scope: changeScope(args.scope),
          target: stringArg(args.target) ?? '',
          title: stringArg(args.title) ?? '',
          description: stringArg(args.description),
          changedAt: stringArg(args.date) ?? today(),
        })
        if (json) {
          printJson(change)
          return
        }
        printKeyValue([
          ['ID', change.id],
          ['Date', change.changedAt],
          ['Project', selection.client?.name ?? selection.site],
          ['Scope', change.scope],
          ['Target', change.target],
          ['Title', change.title],
        ])
      },
    }),
    report: defineCommand({
      meta: {
        name: 'report',
        description:
          'Report an SEO test with equal finalized before/after windows',
      },
      args: {
        id: { type: 'string', description: 'Saved SEO test id.' },
        site: { type: 'string', description: 'GSC property URL.' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        scope: {
          type: 'string',
          description: 'Ad-hoc change scope: site, page, query, or group.',
        },
        target: {
          type: 'string',
          description:
            'Ad-hoc changed URL, query, group pattern, or site marker.',
        },
        title: { type: 'string', description: 'Ad-hoc test title.' },
        date: {
          type: 'string',
          description: 'Ad-hoc change date in YYYY-MM-DD.',
        },
        property: {
          type: 'string',
          description: 'Google Analytics property ID.',
        },
        'control-scope': {
          type: 'string',
          description: 'Control scope: site, page, query, or group.',
        },
        'control-target': {
          type: 'string',
          description: 'Control URL, query, group pattern, or site marker.',
        },
        'control-title': {
          type: 'string',
          description: 'Plain-English name for the control group.',
        },
        before: {
          type: 'string',
          description: 'Days before the change date. Defaults to 28.',
        },
        after: {
          type: 'string',
          description: 'Days after the change date. Defaults to 28.',
        },
        refresh: {
          type: 'boolean',
          default: false,
          description:
            'Bypass the local Search Console and Google Analytics cache.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const id = stringArg(args.id)
        const needsSelection =
          !id || Boolean(projectArg(args) || stringArg(args.site))
        const selection = needsSelection
          ? await resolveClientSelection({
              client: projectArg(args),
              site: stringArg(args.site),
              options: { json, refresh: booleanArg(args.refresh) },
            })
          : undefined
        const report = await measureChange({
          id,
          site: id ? undefined : selection?.site,
          scope: id ? undefined : maybeScope(args.scope),
          target: id ? undefined : stringArg(args.target),
          title: stringArg(args.title),
          changedAt: id ? undefined : stringArg(args.date),
          googleAnalyticsPropertyId:
            stringArg(args.property) ??
            selection?.client?.analytics.google?.propertyId,
          controlScope: maybeScope(args['control-scope']),
          controlTarget: stringArg(args['control-target']),
          controlTitle: stringArg(args['control-title']),
          beforeDays: strictNumberArg(args.before, '--before'),
          afterDays: strictNumberArg(args.after, '--after'),
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printMeasurement(report)
      },
    }),
  },
})
