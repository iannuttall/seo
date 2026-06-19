import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAiOpportunityTools } from './ai-opportunity-tools.js'
import { registerClientTools } from './client-tools.js'
import { registerCrawlerTools } from './crawler-tools.js'
import { registerDataTools } from './data-tools.js'
import { registerDiagnosisTools } from './diagnosis-tools.js'
import { registerExperimentTools } from './experiment-tools.js'
import { registerMonitoringTools } from './monitoring-tools.js'
import { registerOpportunityTools } from './opportunity-tools.js'
import { registerPrompts } from './prompts.js'
import { registerPseoTools } from './pseo-tools.js'
import { registerReportTools } from './report-tools.js'
import { registerResources } from './resources.js'
import { registerWorkflowTools } from './workflow-tools.js'

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'seo',
      version: '0.1.0',
    },
    { capabilities: { logging: {} } },
  )

  registerDiagnosisTools(server)
  registerOpportunityTools(server)
  registerAiOpportunityTools(server)
  registerCrawlerTools(server)
  registerMonitoringTools(server)
  registerReportTools(server)
  registerExperimentTools(server)
  registerPseoTools(server)
  registerDataTools(server)
  registerClientTools(server)
  registerWorkflowTools(server)
  registerResources(server)
  registerPrompts(server)

  return server
}

export async function startMcpServer(
  opts: { test?: boolean } = {},
): Promise<void> {
  if (opts.test) {
    process.stdout.write('seo MCP server constructed successfully.\n')
    return
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
