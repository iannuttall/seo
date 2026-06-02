import {
  type ContentGroupDimension,
  type ContentGroupMatchType,
  createContentGroup,
  deleteContentGroup,
  listContentGroups,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

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
