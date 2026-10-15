import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAuditPageTool } from './report-tools/audit-page.js'
import { registerSecondPageTool } from './report-tools/second-page.js'

export function registerReportTools(server: McpServer): void {
  registerAuditPageTool(server)
  registerSecondPageTool(server)
}
