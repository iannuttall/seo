import {
  type ChangeScope,
  deleteChange,
  listChanges,
  measureChange,
  recordChange,
} from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

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

export const changeLogCommand = defineCommand({
  meta: {
    name: 'change-log',
    description: 'Annotate SEO changes and measure before/after impact',
  },
  subCommands: {
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List recorded SEO changes',
      },
      args: {
        site: { type: 'string' },
        limit: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const changes = listChanges({
          site: stringArg(args.site),
          limit: numberArg(args.limit),
        })
        if (jsonFlag(args)) {
          printJson({ changes })
          return
        }
        printTable(
          ['ID', 'Date', 'Site', 'Scope', 'Target', 'Title'],
          changes.map((change) => [
            change.id,
            change.changedAt,
            change.site,
            change.scope,
            change.target,
            change.title,
          ]),
        )
      },
    }),
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Record an SEO change',
      },
      args: {
        site: { type: 'string' },
        scope: { type: 'string', default: 'page' },
        target: { type: 'string', required: true },
        title: { type: 'string', required: true },
        description: { type: 'string' },
        date: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const change = recordChange({
          site: await resolveSite({
            site: stringArg(args.site),
            options: { json },
          }),
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
          ['Site', change.site],
          ['Scope', change.scope],
          ['Target', change.target],
          ['Title', change.title],
        ])
      },
    }),
    delete: defineCommand({
      meta: {
        name: 'delete',
        description: 'Delete a recorded SEO change',
      },
      args: {
        id: { type: 'string', required: true },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const id = stringArg(args.id) ?? ''
        const deleted = deleteChange(id)
        if (jsonFlag(args)) {
          printJson({ id, deleted })
          return
        }
        process.stdout.write(`${deleted ? 'Deleted' : 'Not found'} ${id}.\n`)
      },
    }),
    measure: defineCommand({
      meta: {
        name: 'measure',
        description: 'Measure before/after impact for a change',
      },
      args: {
        id: { type: 'string' },
        site: { type: 'string' },
        scope: { type: 'string' },
        target: { type: 'string' },
        title: { type: 'string' },
        date: { type: 'string' },
        before: { type: 'string' },
        after: { type: 'string' },
        json: { type: 'boolean', default: false },
        refresh: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const id = stringArg(args.id)
        if (
          !id &&
          (!stringArg(args.site) ||
            !stringArg(args.scope) ||
            !stringArg(args.target) ||
            !stringArg(args.date))
        ) {
          throw new Error(
            'Pass --id, or pass --site, --scope, --target, and --date for an ad hoc measurement.',
          )
        }
        const report = await measureChange({
          id,
          site: id
            ? undefined
            : await resolveSite({
                site: stringArg(args.site),
                options: { json },
              }),
          scope: id ? undefined : changeScope(args.scope),
          target: id ? undefined : stringArg(args.target),
          title: stringArg(args.title),
          changedAt: id ? undefined : stringArg(args.date),
          beforeDays: numberArg(args.before),
          afterDays: numberArg(args.after),
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printKeyValue([
          ['Change', report.change.title],
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
              'Clicks',
              report.before.metrics.clicks,
              report.after.metrics.clicks,
              report.delta.clickPct === null
                ? `${report.delta.clicks}`
                : `${report.delta.clicks} (${report.delta.clickPct}%)`,
            ],
            [
              'Impressions',
              report.before.metrics.impressions,
              report.after.metrics.impressions,
              report.delta.impressionPct === null
                ? `${report.delta.impressions}`
                : `${report.delta.impressions} (${report.delta.impressionPct}%)`,
            ],
            [
              'CTR',
              report.before.metrics.ctr,
              report.after.metrics.ctr,
              report.delta.ctr,
            ],
            [
              'Position',
              report.before.metrics.position,
              report.after.metrics.position,
              report.delta.position,
            ],
          ],
        )
      },
    }),
  },
})
