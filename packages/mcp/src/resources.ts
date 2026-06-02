import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getCacheStats, listSites } from '@seo/core'

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
}
