import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  diagnosePropertyWorkflow,
  monthlyReportWorkflow,
  refreshPrioritiesWorkflow,
  technicalWatchWorkflow,
  updatePostmortemWorkflow,
} from '@seo/core'
import * as z from 'zod/v4'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

function toolSuccess(
  summaryText: string,
  structuredContent: unknown,
): ToolResult {
  return {
    content: [{ type: 'text', text: summaryText }],
    structuredContent: structuredContent as Record<string, unknown>,
  }
}

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    'seo_workflow_diagnose_property',
    {
      description:
        'Run the full agent workflow for property diagnosis and next actions',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, limit, refresh }) => {
      try {
        const result = await diagnosePropertyWorkflow({
          site,
          days,
          recentDays,
          limit,
          refresh,
        })
        return toolSuccess(result.summary, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_monthly_report',
    {
      description: 'Run the monthly reporting workflow with next actions',
      inputSchema: {
        site: z.string(),
        month: z.string().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, month, limit, refresh }) => {
      try {
        const result = await monthlyReportWorkflow({
          site,
          month,
          limit,
          refresh,
        })
        return toolSuccess(result.summary, result)
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
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, limit, refresh }) => {
      try {
        const result = await updatePostmortemWorkflow({
          site,
          days,
          recentDays,
          limit,
          refresh,
        })
        return toolSuccess(result.summary, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_technical_watch',
    {
      description:
        'Run scheduled-style crawl-diff and index-watch monitoring in one workflow',
      inputSchema: {
        site: z.string(),
        startUrl: z.string().url().optional(),
        urls: z.array(z.string().url()).optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
        languageCode: z.string().optional(),
      },
    },
    async ({ site, startUrl, urls, limit, refresh, js, languageCode }) => {
      try {
        const result = await technicalWatchWorkflow({
          site,
          startUrl,
          urls,
          limit,
          refresh,
          js: js ? true : 'auto',
          languageCode,
        })
        return toolSuccess(result.summary, result)
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
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        limit: z.number().optional(),
        ga4PropertyId: z.string().optional(),
        verifyContent: z.boolean().optional(),
        verifyLimit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      ga4PropertyId,
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
          ga4PropertyId,
          verifyContent,
          verifyLimit,
          refresh,
        })
        return toolSuccess(result.summary, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
