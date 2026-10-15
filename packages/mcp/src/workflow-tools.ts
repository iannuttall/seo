import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  diagnosePropertyWorkflow,
  refreshPrioritiesWorkflow,
  renderWorkflowMarkdown,
  updatePostmortemWorkflow,
  type WorkflowReport,
  workflowPresentation,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

function workflowSuccess(result: WorkflowReport<unknown>) {
  const presentation = workflowPresentation(result)
  const structured = compactAgentWorkflowOutput({
    ...result,
    presentation,
  })
  return toolSuccess(result.summary, structured, {
    markdown: renderWorkflowMarkdown(result),
  })
}

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    'seo_workflow_diagnose_property',
    {
      description:
        'Run the full agent workflow for property diagnosis and next actions',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'refresh',
        ]),
      },
    },
    async ({ site, days, recentDays, limit, includeBrand, refresh }) => {
      try {
        const result = await diagnosePropertyWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_update_postmortem',
    {
      description:
        'Run winner/loser postmortem analysis for recent Google update exposure',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'refresh',
        ]),
        knownConfounders: z.array(z.string()).optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
      knownConfounders,
      refresh,
    }) => {
      try {
        const result = await updatePostmortemWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          knownConfounders,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_refresh_priorities',
    {
      description:
        'Rank decay, striking-distance, quick-win, cannibalisation, and diagnosis signals into an action queue',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'verifyContent',
          'verifyLimit',
          'refresh',
        ]),
        googleAnalyticsPropertyId: z.string().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
      googleAnalyticsPropertyId,
      verifyContent,
      verifyLimit,
      refresh,
    }) => {
      try {
        const result = await refreshPrioritiesWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          googleAnalyticsPropertyId,
          verifyContent,
          verifyLimit,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
