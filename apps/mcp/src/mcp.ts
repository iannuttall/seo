import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  commandErrorFrom,
  MCP_INSTRUCTIONS,
  runSharedTool,
  SHARED_TOOLS,
  type SharedTool,
} from '@seo/core/commands'
import { accountUrl, signInHint } from './google.ts'
import { events, send } from './telemetry.ts'
import { deps } from './tools/deps.ts'
import { type Tool, type ToolContext, ToolError } from './tools/registry.ts'

// The shared tools from core, run with the person's linked accounts and keys.
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
          deps: deps(context.env, context.directory),
          resolveSite: (site) => context.directory.resolve(site),
          keys: async () => context.headers,
          drKey: context.env.AHREFS_DR_KEY,
          accounts: async () => context.directory.accounts(),
          signIn: signInHint(context.env),
          connect: accountUrl(context.env),
        },
        input,
      )
      return result.text
    },
  }
}

export const TOOLS: Tool[] = SHARED_TOOLS.map(sharedTool)

const instructions = (env: Env) => `${MCP_INSTRUCTIONS}
Crawls run on the person's own machine with the open-source CLI, not on this server. If you have a shell, run \`npx -y seo crawl https://example.com --json\` or \`npx -y seo internal-links --url https://example.com/page --json\`. The person adds Google accounts, Bing and research keys at ${accountUrl(env)}; give them that link when a site or key is missing. This server keeps only those sign-ins and keys, encrypted, and no report data.`

// A new stateless server for each request, with JSON responses.
export async function serveMcp(
  request: Request,
  context: ToolContext,
): Promise<Response> {
  const server = new McpServer(
    { name: 'seo', title: 'SEO Skill', version: '1.0.0' },
    { instructions: instructions(context.env) },
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
        } catch (thrown) {
          // Core errors (from the shared Google calls) report like tool errors.
          const error = commandErrorFrom(thrown)
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
                        ? ` Add a key at ${accountUrl(context.env)}.`
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
