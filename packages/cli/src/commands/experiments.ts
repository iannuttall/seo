import {
  type ChangeScope,
  type ContentGroupDimension,
  type ContentGroupMatchType,
  createContentGroup,
  deleteChange,
  deleteContentGroup,
  listChanges,
  listContentGroups,
  measureChange,
  recordChange,
} from '@seo/core'
import { defineCommand } from 'citty'
import { resolveSite } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function groupDimension(value: unknown): ContentGroupDimension {
  const dimension = stringArg(value) ?? 'page'
  if (dimension !== 'page' && dimension !== 'query') {
    throw new Error('Invalid --dimension. Use page or query.')
  }
  return dimension
}

function matchType(value: unknown): ContentGroupMatchType {
  const type = stringArg(value) ?? 'contains'
  if (type !== 'equals' && type !== 'contains' && type !== 'regex') {
    throw new Error('Invalid --match. Use equals, contains, or regex.')
  }
  return type
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

export const contentGroupsCommand = defineCommand({
  meta: {
    name: 'content-groups',
    description: 'Create and manage reusable page/query groups',
  },
  subCommands: {
    list: defineCommand({
      args: {
        site: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const groups = listContentGroups(stringArg(args.site))
        if (jsonFlag(args)) {
          printJson({ groups })
          return
        }
        printTable(
          ['ID', 'Site', 'Name', 'Dimension', 'Match', 'Pattern'],
          groups.map((group) => [
            group.id,
            group.site,
            group.name,
            group.dimension,
            group.matchType,
            group.pattern,
          ]),
        )
      },
    }),
    add: defineCommand({
      args: {
        site: { type: 'string' },
        name: { type: 'string', required: true },
        dimension: { type: 'string', default: 'page' },
        match: { type: 'string', default: 'contains' },
        pattern: { type: 'string', required: true },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const group = createContentGroup({
          site: await resolveSite({
            site: stringArg(args.site),
            options: { json },
          }),
          name: stringArg(args.name) ?? '',
          dimension: groupDimension(args.dimension),
          matchType: matchType(args.match),
          pattern: stringArg(args.pattern) ?? '',
        })
        if (json) {
          printJson(group)
          return
        }
        printKeyValue([
          ['ID', group.id],
          ['Site', group.site],
          ['Name', group.name],
          ['Filter', `${group.dimension} ${group.matchType} ${group.pattern}`],
        ])
      },
    }),
    delete: defineCommand({
      args: {
        id: { type: 'string', required: true },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const id = stringArg(args.id) ?? ''
        const deleted = deleteContentGroup(id)
        if (jsonFlag(args)) {
          printJson({ id, deleted })
          return
        }
        process.stdout.write(`${deleted ? 'Deleted' : 'Not found'} ${id}.\n`)
      },
    }),
  },
})

export const changeLogCommand = defineCommand({
  meta: {
    name: 'change-log',
    description: 'Annotate SEO changes and measure before/after impact',
  },
  subCommands: {
    list: defineCommand({
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
