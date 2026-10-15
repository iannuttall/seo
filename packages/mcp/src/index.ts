import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  initializeTelemetry,
  SEO_VERSION,
  type TelemetryOptions,
} from '@seo/core'
import { MCP_INSTRUCTIONS } from '@seo/core/commands'
import { registerProviderExtensionTools } from './provider-extension-tools.js'
import { registerSharedTools } from './shared-tools.js'

export {
  AGENT_STRUCTURED_OUTPUT_MAX_BYTES,
  compactAgentWorkflowOutput,
} from './agent-output-budget.js'
export type {
  FullReportGuidance,
  RelatedReport,
  ReportDepth,
  ReportGuidance,
} from './report-guidance.js'
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

export interface SeoMcpServer {
  connect(transport: object): Promise<void>
  close(): Promise<void>
}

export function createServer(
  options: { telemetry?: boolean } = {},
): SeoMcpServer {
  const server = new McpServer(
    {
      name: 'seo',
      version: SEO_VERSION,
    },
    {
      capabilities: { logging: {} },
      instructions: `${MCP_INSTRUCTIONS}
seo_crawl and seo_internal_links run on this machine. Keys and Google sign-in come from \`seo start\` and \`seo providers <name> connect\`.`,
    },
  )

  const telemetryOptions = (): TelemetryOptions => ({
    clientName: server.server.getClientVersion()?.name,
  })
  registerSharedTools(server, {
    telemetry: options.telemetry === false ? undefined : telemetryOptions,
  })
  registerProviderExtensionTools(server)
  if (options.telemetry !== false) {
    server.server.oninitialized = () => {
      initializeTelemetry(telemetryOptions())
    }
  }

  return server as unknown as SeoMcpServer
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
