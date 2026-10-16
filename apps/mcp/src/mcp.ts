import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  CLI_LINK,
  commandErrorFrom,
  MCP_INSTRUCTIONS,
  runSharedTool,
  SHARED_TOOLS,
  type SharedTool,
  SKILL_RESOURCE,
} from '@seo/core/commands'
import { z } from 'zod'
// The same skills/seo/SKILL.md that `npx skills add` installs, bundled as
// text by the Text rule in wrangler.jsonc.
import skill from '../../../skills/seo/SKILL.md'
import { accountUrl, openForPerson, signInHint } from './google.ts'
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
          connect: `${accountUrl(context.env)}. Crawls, internal links and Bing run in the CLI. ${CLI_LINK}`,
        },
        input,
      )
      return result.text
    },
  }
}

export const TOOLS: Tool[] = SHARED_TOOLS.map(sharedTool)

const instructions = (env: Env) => `${MCP_INSTRUCTIONS}
Crawls, internal links and Bing run on a machine with the open-source CLI, not on this server. ${CLI_LINK} Then run, for example, \`npx -y seo crawl https://example.com --json\`, \`npx -y seo internal-links --url https://example.com/page --json\` or \`npx -y seo report --site <site> --section bing --json\`. When a site or key is missing, open ${accountUrl(env)} in the person's browser (with \`open <url>\` on macOS, \`xdg-open\` on Linux or \`start\` on Windows when you have a shell, otherwise show the link), let them add the Google account or key there, then run the same call again. This server keeps only those sign-ins and keys, encrypted, and no report data.`

const SERVER_INFO = { name: 'seo', title: 'SEO Skill', version: '1.0.0' }

// The static server card at /.well-known/mcp/server-card.json, so
// directories such as Smithery can list the tools without signing in.
export function serverCard(): Response {
  return Response.json({
    serverInfo: SERVER_INFO,
    authentication: { required: true, schemes: ['oauth2'] },
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.input, { io: 'input' }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    })),
    resources: [SKILL_RESOURCE],
    prompts: [],
  })
}

// A new stateless server for each request, with JSON responses.
export async function serveMcp(
  request: Request,
  context: ToolContext,
): Promise<Response> {
  const server = new McpServer(SERVER_INFO, {
    instructions: instructions(context.env),
  })
  const { name, uri, ...meta } = SKILL_RESOURCE
  server.registerResource(name, uri, meta, async (url) => ({
    contents: [{ uri: url.href, mimeType: meta.mimeType, text: skill }],
  }))
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
                        ? ` ${openForPerson(`${accountUrl(context.env)}#keys`, 'save the key')}`
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
