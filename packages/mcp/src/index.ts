import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SEO_VERSION } from '@seo/core'
import { registerDiscoveryTools } from './discovery-tools.js'

export {
  REPORT_CATEGORIES,
  type ReportCategory,
  type ReportSummary,
} from './report-registry.js'
export {
  describeReport,
  executeReport,
  listReports,
  runReport,
} from './reports.js'

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'seo',
      version: SEO_VERSION,
    },
    { capabilities: { logging: {} } },
  )

  registerDiscoveryTools(server)

  return server
}

export async function startMcpServer(
  opts: { test?: boolean } = {},
): Promise<void> {
  const server = createServer()
  if (opts.test) {
    process.stdout.write('seo MCP server constructed successfully.\n')
    return
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
