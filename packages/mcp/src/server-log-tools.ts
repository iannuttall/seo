import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { importServerLog, serverLogReport } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

export function registerServerLogTools(server: McpServer): void {
  server.registerTool(
    'seo_server_log_analysis',
    {
      description:
        'Stream a local access log into bounded search and AI crawler evidence',
      inputSchema: {
        file: z.string().min(1).max(4_096),
        format: z.enum(['combined', 'jsonl']).optional(),
        rowLimit: z.number().int().min(1).max(10_000_000).optional(),
        pathLimit: z.number().int().min(1).max(100_000).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ file, format, rowLimit, pathLimit, limit }) => {
      try {
        const evidence = await importServerLog({
          file,
          format,
          rowLimit,
          pathLimit,
        })
        const report = serverLogReport({ evidence, limit })
        return toolSuccess(
          `${report.summary.crawlerRows} crawler requests were observed in ${report.summary.parsedRows} parsed log rows.`,
          report,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
