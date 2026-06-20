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
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { formatCount } from '../output.js'

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

function printMeasurement(report: ChangeMeasurement): void {
  printKeyValue([
    ['Test', report.change.title],
    ['Verdict', report.verdict],
    ['Confidence', report.confidence],
    ['Before', `${report.before.startDate} to ${report.before.endDate}`],
    ['After', `${report.after.startDate} to ${report.after.endDate}`],
    ['Note', report.note],
  ])
  printTable(
    ['Metric', 'Before', 'After', 'Delta'],
    [
      [
        'GSC clicks',
        formatCount(report.before.metrics.clicks),
        formatCount(report.after.metrics.clicks),
        `${formatCount(report.delta.clicks)} (${pct(report.delta.clickPct)})`,
      ],
      [
        'GSC impressions',
        formatCount(report.before.metrics.impressions),
        formatCount(report.after.metrics.impressions),
        `${formatCount(report.delta.impressions)} (${pct(report.delta.impressionPct)})`,
      ],
      [
        'GSC CTR',
        `${(report.before.metrics.ctr * 100).toFixed(1)}%`,
        `${(report.after.metrics.ctr * 100).toFixed(1)}%`,
        `${(report.delta.ctr * 100).toFixed(1)} pts`,
      ],
      [
        'GSC position',
        report.before.metrics.position.toFixed(1),
        report.after.metrics.position.toFixed(1),
        report.delta.position.toFixed(1),
      ],
    ],
  )

  if (report.analytics) {
    process.stdout.write('\nGA4 impact\n')
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
      ['Adjusted clicks', formatCount(report.control.adjusted.clickDelta)],
      [
        'Adjusted click %',
        report.control.adjusted.clickPctPoints === null
          ? 'n/a'
          : `${report.control.adjusted.clickPctPoints.toFixed(1)} pts`,
      ],
      ['Note', report.control.note],
    ])
  }
}

export const testsCommand = defineCommand({
  meta: {
    name: 'tests',
    description: 'Create and report local SEO tests from GSC and GA4 data',
  },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List saved SEO tests' },
      args: {
        site: { type: 'string' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        limit: { type: 'string' },
        json: { type: 'boolean', default: false },
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
        site: { type: 'string' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        scope: { type: 'string', default: 'page' },
        target: { type: 'string', required: true },
        title: { type: 'string', required: true },
        description: { type: 'string' },
        date: { type: 'string' },
        json: { type: 'boolean', default: false },
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
        description: 'Report before/after SEO test impact',
      },
      args: {
        id: { type: 'string' },
        site: { type: 'string' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        scope: { type: 'string' },
        target: { type: 'string' },
        title: { type: 'string' },
        date: { type: 'string' },
        property: { type: 'string', description: 'GA4 property ID.' },
        'control-scope': { type: 'string' },
        'control-target': { type: 'string' },
        'control-title': { type: 'string' },
        before: { type: 'string' },
        after: { type: 'string' },
        refresh: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
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
          ga4PropertyId:
            stringArg(args.property) ?? selection?.client?.ga4PropertyId,
          controlScope: maybeScope(args['control-scope']),
          controlTarget: stringArg(args['control-target']),
          controlTitle: stringArg(args['control-title']),
          beforeDays: numberArg(args.before),
          afterDays: numberArg(args.after),
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
