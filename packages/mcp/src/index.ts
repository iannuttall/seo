import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  initializeTelemetry,
  SEO_VERSION,
  type TelemetryOptions,
} from '@seo/core'
import { registerDiscoveryTools } from './discovery-tools.js'

export type { CheckFix, CheckFixResource } from './check-fixes.js'
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
  describeReportCheck,
  executeReport,
  listReports,
  runReport,
} from './reports.js'

export function createServer(options: { telemetry?: boolean } = {}): McpServer {
  const server = new McpServer(
    {
      name: 'seo',
      version: SEO_VERSION,
    },
    { capabilities: { logging: {} } },
  )

  const telemetryOptions = (): TelemetryOptions => ({
    clientName: server.server.getClientVersion()?.name,
  })
  registerDiscoveryTools(server, {
    telemetry: options.telemetry === false ? undefined : telemetryOptions,
  })
  if (options.telemetry !== false) {
    server.server.oninitialized = () => {
      initializeTelemetry(telemetryOptions())
    }
  }

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
