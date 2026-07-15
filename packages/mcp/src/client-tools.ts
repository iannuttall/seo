import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  deleteClient,
  getClient,
  listClients,
  saveClient,
  setDefaultClient,
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

export function registerClientTools(server: McpServer): void {
  server.registerTool(
    'seo_clients',
    {
      description: 'List saved SEO client profiles',
      inputSchema: {},
    },
    async () => {
      try {
        const clients = listClients()
        return toolSuccess(`${clients.length} clients found.`, { clients })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_client',
    {
      description: 'Show, save, set default, or delete one SEO client profile',
      inputSchema: {
        action: z.enum(['show', 'save', 'default', 'delete']),
        id: z.string().optional(),
        name: z.string().optional(),
        site: z.string().optional(),
        startUrl: z.string().url().optional(),
        watchUrls: z.array(z.string().url()).optional(),
        googleAnalyticsPropertyId: z.string().optional(),
        reportDay: z.number().optional(),
        technicalWeekday: z.number().optional(),
        isDefault: z.boolean().optional(),
      },
    },
    async ({
      action,
      id,
      name,
      site,
      startUrl,
      watchUrls,
      googleAnalyticsPropertyId,
      reportDay,
      technicalWeekday,
      isDefault,
    }) => {
      try {
        if (action === 'show') {
          const client = getClient(id)
          if (!client) throw new Error('Client not found.')
          return toolSuccess(`Client: ${client.name}.`, client)
        }
        if (action === 'delete') {
          if (!id) throw new Error('Pass id to delete a client.')
          const deleted = deleteClient(id)
          return toolSuccess(deleted ? 'Client deleted.' : 'Not found.', {
            id,
            deleted,
          })
        }
        if (action === 'default') {
          if (!id) throw new Error('Pass id to set a default client.')
          const client = setDefaultClient(id)
          return toolSuccess(`Default client set to ${client.id}.`, client)
        }
        if (!site) throw new Error('Pass site to save a client.')
        const client = saveClient({
          id,
          name,
          siteUrl: site,
          startUrl,
          watchUrls,
          analytics: googleAnalyticsPropertyId
            ? { google: { propertyId: googleAnalyticsPropertyId } }
            : undefined,
          reportDay,
          technicalWeekday,
          isDefault,
        })
        return toolSuccess(`Client saved: ${client.id}.`, client)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
