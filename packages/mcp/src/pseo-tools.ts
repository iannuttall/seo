import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  countLabel,
  pseoAuditReport,
  pseoPresentation,
  renderPseoMarkdown,
} from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerPseoTools(server: McpServer): void {
  server.registerTool(
    'seo_pseo_audit',
    {
      description:
        'Audit pSEO templates with first-party GSC, optional crawl, and optional URL Inspection evidence',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'includeBrand',
          'refresh',
          'js',
        ]),
        sitemaps: z.array(z.string().url()).optional(),
        templateLimit: z.number().optional(),
        crawlSamples: z.number().optional(),
        inspectSamples: z.number().optional(),
      },
    },
    async ({
      site,
      days,
      sitemaps,
      templateLimit,
      crawlSamples,
      inspectSamples,
      includeBrand,
      refresh,
      js,
    }) => {
      try {
        const result = await pseoAuditReport({
          site,
          days,
          sitemaps,
          templateLimit,
          crawlSamples,
          inspectSamples,
          includeBrand,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `${countLabel(result.summary.templates, 'pSEO template')} audited from ${countLabel(result.summary.gscPages, 'GSC page')}.`,
          { ...result, presentation: pseoPresentation(result) },
          { markdown: renderPseoMarkdown(result) },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
