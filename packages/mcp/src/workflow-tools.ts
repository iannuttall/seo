import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  diagnosePropertyWorkflow,
  monthlyReportWorkflow,
  refreshPrioritiesWorkflow,
  renderWorkflowMarkdown,
  technicalWatchWorkflow,
  updatePostmortemWorkflow,
  type WorkflowReport,
  workflowPresentation,
} from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

function workflowSuccess(result: WorkflowReport<unknown>) {
  return toolSuccess(
    result.summary,
    {
      ...result,
      presentation: workflowPresentation(result),
    },
    {
      markdown: renderWorkflowMarkdown(result),
    },
  )
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
    'seo_workflow_monthly_report',
    {
      description: 'Run the monthly reporting workflow with next actions',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'limit', 'includeBrand', 'refresh']),
        month: z.string().optional(),
      },
    },
    async ({ site, month, limit, includeBrand, refresh }) => {
      try {
        const result = await monthlyReportWorkflow({
          site,
          month,
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
        includeChangeLog: z.boolean().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
      knownConfounders,
      includeChangeLog,
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
          includeChangeLog,
          refresh,
        })
        return workflowSuccess(result)
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
        sitemaps: z.array(z.string().url()).optional(),
        properties: z.array(z.string()).optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
        languageCode: z.string().optional(),
        dailyLimit: z.number().optional(),
        inspectLimit: z.number().optional(),
        maxUrls: z.number().optional(),
        recoverLinks: z.boolean().optional(),
        recoverDays: z.number().optional(),
        recoverLimit: z.number().optional(),
        recoverMinClicks: z.number().optional(),
        recoverMinImpressions: z.number().optional(),
      },
    },
    async ({
      site,
      startUrl,
      urls,
      sitemaps,
      properties,
      limit,
      refresh,
      js,
      languageCode,
      dailyLimit,
      inspectLimit,
      maxUrls,
      recoverLinks,
      recoverDays,
      recoverLimit,
      recoverMinClicks,
      recoverMinImpressions,
    }) => {
      try {
        const result = await technicalWatchWorkflow({
          site,
          startUrl,
          urls,
          sitemaps,
          properties,
          limit,
          refresh,
          js: js ? true : 'auto',
          languageCode,
          dailyLimit,
          inspectLimit,
          maxUrls,
          recoverLinks,
          recoverDays,
          recoverLimit,
          recoverMinClicks,
          recoverMinImpressions,
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
        ga4PropertyId: z.string().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
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
          includeBrand,
          ga4PropertyId,
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
