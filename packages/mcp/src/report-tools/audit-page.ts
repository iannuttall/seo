import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { auditPage } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from '../tool-result.js'

export function registerAuditPageTool(server: McpServer): void {
  server.registerTool(
    'seo_audit_page',
    {
      description: 'Run a single-page technical and content audit',
      inputSchema: {
        url: z.string().url(),
        site: z.string().optional(),
        js: z.boolean().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ url, site, js, refresh }) => {
      try {
        const result = await auditPage({
          url,
          site,
          js: js ? true : 'auto',
          refresh,
        })
        return toolSuccess(
          `Audit complete for ${url}. Found ${result.issues.length} issues.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
