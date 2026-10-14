import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { events, send } from './telemetry.ts'
import { seoData, seoResearch, seoSites } from './tools/data.ts'
import { type Tool, type ToolContext, ToolError } from './tools/registry.ts'
import { seoReport } from './tools/reports.ts'
import { seoCompare, seoIndex, seoPage } from './tools/site-tools.ts'

export const TOOLS: Tool[] = [
  seoSites,
  seoReport,
  seoPage,
  seoCompare,
  seoIndex,
  seoResearch,
  seoData,
]

const INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics and optional keyword and analytics accounts, and returns facts with their dates and limits. It gives no advice and stores nothing.
1. seo_sites: the properties this sign-in can read.
2. seo_report: the main report. Run it without a section first; it shows the overview and every section's count and top rows. Then ask for the one section you need.
3. seo_page for one URL, seo_compare for before and after a date, seo_index for pages that lost their clicks, seo_research for keyword, competitor and backlink data from the person's own DataForSEO, Ahrefs or Semrush key, seo_data for raw rows.
Crawls run on the person's own machine with the open-source CLI, not on this server. If you have a shell, run \`npx -y seo crawl https://example.com --json\` or \`npx -y seo internal-links --url https://example.com/page --json\`.
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
        const count = (failure: Parameters<typeof events>[0]['failure']) =>
          context.waitUntil(
            send(
              events({
                tool: tool.name,
                args: input as Record<string, unknown> | undefined,
                userAgent: context.headers.get('user-agent'),
                failure,
              }),
            ),
          )
        try {
          const text = await tool.run(context, input)
          count(null)
          return { content: [{ type: 'text', text }] }
        } catch (error) {
          const known = error instanceof ToolError
          count(known ? error.code : 'INTERNAL')
          if (!known) console.error(tool.name, error)
          return {
            content: [
              {
                type: 'text',
                text: known
                  ? `Error ${error.code}: ${error.message}${
                      error.code === 'NO_KEY'
                        ? ` How keys work: ${context.env.PUBLIC_URL}/mcp/keys`
                        : ''
                    }`
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
