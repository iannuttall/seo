import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'seo-second-page',
    {
      description: 'Run second-page opportunity analysis',
      argsSchema: {
        site: z.string(),
        range: z.string().optional(),
        limit: z.string().optional(),
      },
    },
    async ({ site, range, limit }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run the seo_second_page tool with site=${site}, range=${range ?? '28'}, limit=${limit ?? '5'}. Use only tool output. Quote the evidenceRef. Do not invent data.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-audit-page',
    {
      description: 'Run a page audit and explain issues without inventing data',
      argsSchema: {
        url: z.string(),
      },
    },
    async ({ url }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run seo_audit_page for ${url}. Explain findings using the returned principle and evidenceRef values only.`,
          },
        },
      ],
    }),
  )
}
