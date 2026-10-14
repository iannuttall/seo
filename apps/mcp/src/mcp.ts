import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  seoAnalytics,
  seoInspect,
  seoResearch,
  seoSearchConsole,
  seoSites,
} from './tools/data.ts'
import { type Tool, type ToolContext, ToolError } from './tools/registry.ts'
import { seoReport } from './tools/reports.ts'

export const TOOLS: Tool[] = [
  seoSites,
  seoReport,
  seoSearchConsole,
  seoInspect,
  seoAnalytics,
  seoResearch,
]

const INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics and optional keyword and analytics accounts, and returns facts with their dates and limits. It gives no advice and stores nothing.
1. seo_sites: the properties this sign-in can read.
2. seo_report: a report such as quick-wins, low-ctr, content-decay, cannibalization or traffic-drop. Start with detail "summary".
3. seo_search_console for raw rows, seo_inspect_url for index status, seo_analytics for landing page traffic, seo_research for keyword and competitor data from the person's own DataForSEO, Ahrefs or Semrush key.
Show the person the facts that matter, for example in a table or a small dashboard, and decide with them what to change. Do not edit pages without their approval.`

// A new stateless server for each request, with JSON responses.
export async function serveMcp(
  request: Request,
  context: ToolContext,
): Promise<Response> {
  const server = new McpServer(
    { name: 'seo', title: 'SEO Skill', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input.shape,
        annotations: {
          title: tool.title,
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (input: unknown): Promise<CallToolResult> => {
        try {
          return {
            content: [{ type: 'text', text: await tool.run(context, input) }],
          }
        } catch (error) {
          const known = error instanceof ToolError
          if (!known) console.error(tool.name, error)
          return {
            content: [
              {
                type: 'text',
                text: known
                  ? `Error ${error.code}: ${error.message}`
                  : 'Error INTERNAL: the tool failed. Try again; if it fails again, report it at https://github.com/iannuttall/seo/issues.',
              },
            ],
            isError: true,
          }
        }
      },
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}
