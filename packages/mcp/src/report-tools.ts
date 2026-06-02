import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAuditPageTool } from './report-tools/audit-page.js'
import { registerMonthlyReportTool } from './report-tools/monthly.js'
import { registerNarrativeReportTool } from './report-tools/narrative.js'
import { registerSecondPageTool } from './report-tools/second-page.js'

export function registerReportTools(server: McpServer): void {
  registerNarrativeReportTool(server)
  registerMonthlyReportTool(server)
  registerAuditPageTool(server)
  registerSecondPageTool(server)
}
