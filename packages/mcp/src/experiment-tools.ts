import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  createContentGroup,
  deleteChange,
  deleteContentGroup,
  listChanges,
  listContentGroups,
  measureChange,
  recordChange,
} from '@seo/core'
import * as z from 'zod/v4'
import { calendarDateSchema } from './input-schemas.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerExperimentTools(server: McpServer): void {
  server.registerTool(
    'seo_content_groups',
    {
      description: 'List, create, or delete reusable page/query groups',
      inputSchema: {
        action: z.enum(['list', 'add', 'delete']),
        site: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        dimension: z.enum(['page', 'query']).optional(),
        matchType: z.enum(['equals', 'contains', 'regex']).optional(),
        pattern: z.string().optional(),
      },
    },
    async ({ action, site, id, name, dimension, matchType, pattern }) => {
      try {
        if (action === 'list') {
          const groups = listContentGroups(site)
          return toolSuccess(`${groups.length} content groups found.`, {
            groups,
          })
        }
        if (action === 'delete') {
          if (!id) throw new Error('Pass id to delete a content group.')
          const deleted = deleteContentGroup(id)
          return toolSuccess(
            deleted ? 'Content group deleted.' : 'Not found.',
            {
              id,
              deleted,
            },
          )
        }
        if (!site || !name || !pattern) {
          throw new Error(
            'Pass site, name, and pattern to add a content group.',
          )
        }
        const group = createContentGroup({
          site,
          name,
          dimension,
          matchType,
          pattern,
        })
        return toolSuccess(`Content group created: ${group.name}.`, group)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_change_log',
    {
      description: 'List or record SEO annotations and site changes',
      inputSchema: {
        action: z.enum(['list', 'add', 'delete']),
        site: z.string().optional(),
        id: z.string().optional(),
        limit: z.number().optional(),
        scope: z.enum(['site', 'page', 'query', 'group']).optional(),
        target: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        changedAt: z.string().optional(),
      },
    },
    async ({
      action,
      site,
      id,
      limit,
      scope,
      target,
      title,
      description,
      changedAt,
    }) => {
      try {
        if (action === 'list') {
          const changes = listChanges({ site, limit })
          return toolSuccess(`${changes.length} changes found.`, { changes })
        }
        if (action === 'delete') {
          if (!id) throw new Error('Pass id to delete a change.')
          const deleted = deleteChange(id)
          return toolSuccess(deleted ? 'Change deleted.' : 'Not found.', {
            id,
            deleted,
          })
        }
        if (!site || !scope || !target || !title) {
          throw new Error(
            'Pass site, scope, target, and title to add a change.',
          )
        }
        const change = recordChange({
          site,
          scope,
          target,
          title,
          description,
          changedAt: changedAt ?? new Date().toISOString().slice(0, 10),
        })
        return toolSuccess(`Change recorded: ${change.title}.`, change)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_measure_change',
    {
      description:
        'Measure a saved or ad hoc SEO change with equal finalized GSC windows and optional Google Analytics/control evidence',
      inputSchema: {
        id: z.string().min(1).optional(),
        site: z.string().min(1).optional(),
        scope: z.enum(['site', 'page', 'query', 'group']).optional(),
        target: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        changedAt: calendarDateSchema.optional(),
        googleAnalyticsPropertyId: z.string().min(1).optional(),
        controlScope: z.enum(['site', 'page', 'query', 'group']).optional(),
        controlTarget: z.string().min(1).optional(),
        controlTitle: z.string().min(1).optional(),
        beforeDays: z.number().int().min(1).max(548).optional(),
        afterDays: z.number().int().min(1).max(548).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      id,
      site,
      scope,
      target,
      title,
      changedAt,
      googleAnalyticsPropertyId,
      controlScope,
      controlTarget,
      controlTitle,
      beforeDays,
      afterDays,
      refresh,
    }) => {
      try {
        const result = await measureChange({
          id,
          site,
          scope,
          target,
          title,
          changedAt,
          googleAnalyticsPropertyId,
          controlScope,
          controlTarget,
          controlTitle,
          beforeDays,
          afterDays,
          refresh,
        })
        return toolSuccess(
          `Measurement ${result.dataStatus}. Verdict: ${result.verdict}. Compared ${result.window.effectiveDays}/${result.window.requestedDays} finalized days.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
