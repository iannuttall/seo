import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getCacheStats, listSites } from '@seo/core'
import {
  crawlerToolGuide,
  crawlerWorkflowMarkdown,
} from './crawler-workflow-docs.js'

export function registerResources(server: McpServer): void {
  server.registerResource(
    'gsc-sites',
    'gsc://sites',
    {
      mimeType: 'application/json',
      description: 'Configured Search Console properties',
    },
    async () => {
      const sites = await listSites().catch(() => [])
      return {
        contents: [
          {
            uri: 'gsc://sites',
            text: JSON.stringify(sites, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'cache-stats',
    'cache://stats',
    { mimeType: 'application/json', description: 'Local cache stats' },
    async () => ({
      contents: [
        {
          uri: 'cache://stats',
          text: JSON.stringify(getCacheStats(), null, 2),
        },
      ],
    }),
  )

  server.registerResource(
    'last-audit',
    'gsc://report/last-audit',
    { mimeType: 'text/plain', description: 'Placeholder last audit resource' },
    async () => ({
      contents: [
        {
          uri: 'gsc://report/last-audit',
          text: 'Last audit persistence is not wired yet. Use seo_audit_page directly.',
        },
      ],
    }),
  )

  server.registerResource(
    'crawler-workflows',
    'seo://crawler/workflows',
    {
      mimeType: 'text/markdown',
      description:
        'MCP workflow guide for crawler audits, implementation queues, GEO readiness, and focused URL audits.',
    },
    async () => ({
      contents: [
        {
          uri: 'seo://crawler/workflows',
          text: crawlerWorkflowMarkdown,
        },
      ],
    }),
  )

  server.registerResource(
    'crawler-tool-guide',
    'seo://crawler/tools',
    {
      mimeType: 'application/json',
      description:
        'Structured guide mapping crawler MCP tools to workflows and response shapes.',
    },
    async () => ({
      contents: [
        {
          uri: 'seo://crawler/tools',
          text: JSON.stringify(crawlerToolGuide, null, 2),
        },
      ],
    }),
  )
}
