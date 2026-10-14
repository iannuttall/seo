import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  MCP_INSTRUCTIONS,
  runSharedTool,
  SHARED_TOOLS,
  type SharedTool,
} from '@seo/core/commands'
import { resolveProperty } from './google.ts'
import { events, send } from './telemetry.ts'
import { hostedAnalytics, seoSites } from './tools/data.ts'
import { deps } from './tools/deps.ts'
import { type Tool, type ToolContext, ToolError } from './tools/registry.ts'

// The shared tools from core, run with this request's Google token, key
// headers and analytics adapters.
function sharedTool(shared: SharedTool): Tool {
  return {
    name: shared.name,
    title: shared.title,
    description: shared.description,
    input: shared.input,
    async run(context, input) {
      const result = await runSharedTool(
        shared,
        {
          deps: deps(context.google),
          resolveSite: (site) => resolveProperty(context.google, site),
          keys: async () => context.headers,
          drKey: context.env.AHREFS_DR_KEY,
          analytics: (analytics) => hostedAnalytics(context, analytics),
        },
        input,
      )
      return result.text
    },
  }
}

export const TOOLS: Tool[] = [seoSites, ...SHARED_TOOLS.map(sharedTool)]

const INSTRUCTIONS = `${MCP_INSTRUCTIONS}
Crawls run on the person's own machine with the open-source CLI, not on this server. If you have a shell, run \`npx -y seo crawl https://example.com --json\` or \`npx -y seo internal-links --url https://example.com/page --json\`. This server stores nothing.`

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
