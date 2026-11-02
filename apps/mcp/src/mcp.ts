import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  AUDIT_TOOLS,
  CLI_LINK,
  commandErrorFrom,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  runSharedTool,
  SHARED_TOOLS,
  type SharedTool,
  SKILL_RESOURCE,
} from '@seo/core/commands'
import { z } from 'zod'
// The same skills/seo/SKILL.md that `npx skills add` installs, bundled as
// text by the Text rule in wrangler.jsonc.
import skill from '../../../skills/seo/SKILL.md'
import { refreshClicky } from './clicky.ts'
import { accountUrl, openForPerson, signInHint } from './google.ts'
import { events, send } from './telemetry.ts'
import { deps } from './tools/deps.ts'
import { type Tool, type ToolContext, ToolError } from './tools/registry.ts'
import { addUsage } from './usage.ts'

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
          deps: deps(context),
          resolveSite: (site) => context.directory.resolve(site),
          keys: async () => context.headers,
          refreshClicky: async () => {
            const change = await refreshClicky(context.env, context.userId)
            if (!change) return null
            const keys = new Headers(context.headers)
            for (const name of change.removed) keys.delete(name)
            for (const [name, value] of Object.entries(change.set)) {
              keys.set(name, value)
            }
            return keys
          },
          drKey: context.env.AHREFS_DR_KEY,
          accounts: async () => context.directory.accounts(),
          signIn: signInHint(context.env),
          connect: `${accountUrl(context.env)}. Crawls, internal links and Bing run in the CLI. ${CLI_LINK}`,
        },
        input,
      )
      // Research runs on the person's own key; this counts logical calls
      // that returned, by provider: one per seo_research call, or one per
      // serp keyword. Never per fetch, so a retry is not counted twice.
      const { provider, action, keywords } = (input ?? {}) as {
        provider?: unknown
        action?: unknown
        keywords?: unknown
      }
      if (
        shared.name === 'seo_research' &&
        (provider === 'dataforseo' || provider === 'ahrefs')
      ) {
        const calls =
          action === 'serp' && Array.isArray(keywords)
            ? Math.max(1, keywords.length)
            : 1
        context.waitUntil(
          addUsage(context.env, context.userId, {
            [`research_${provider}_calls`]: calls,
          }).catch(() => undefined),
        )
      }
      return result.text
    },
  }
}

export const TOOLS: Tool[] = SHARED_TOOLS.map(sharedTool)
// seo_report with the weekly-audit section, for accounts in that beta.
const AUDIT_BETA_TOOLS: Tool[] = AUDIT_TOOLS.map(sharedTool)

// Which research keys this person saved, so the agent asks for a missing
// key before it calls seo_research instead of after the call fails.
function savedKeys(env: Env, headers: Headers): string {
  const saved = [
    headers.get('x-dataforseo-login') && 'dataforseo',
    headers.get('x-ahrefs-key') && 'ahrefs',
  ].filter(Boolean)
  return saved.length
    ? `Research keys saved: ${saved.join(', ')}. seo_research with another provider needs that key saved first.`
    : `No research key is saved, so seo_research fails until the person saves a DataForSEO or Ahrefs key at ${accountUrl(env)}#keys. Ask them first.`
}

const instructions = (env: Env, headers: Headers) => `${MCP_INSTRUCTIONS}
${savedKeys(env, headers)}
Crawls, internal links and Bing run on a machine with the open-source CLI, not on this server. ${CLI_LINK} Then run, for example, \`npx -y seo crawl https://example.com --json\`, \`npx -y seo internal-links --url https://example.com/page --json\` or \`npx -y seo report --site <site> --section bing --json\`. When a site or key is missing, open ${accountUrl(env)} in the person's browser (with \`open <url>\` on macOS, \`xdg-open\` on Linux or \`start\` on Windows when you have a shell, otherwise show the link), let them add the Google account or key there, then run the same call again. This server keeps only those sign-ins and keys, encrypted, and no report data.`

const SERVER_INFO = { ...MCP_SERVER_INFO, version: '1.0.0' }

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
    instructions: instructions(context.env, context.headers),
  })
  const { name, uri, ...meta } = SKILL_RESOURCE
  server.registerResource(name, uri, meta, async (url) => ({
    contents: [{ uri: url.href, mimeType: meta.mimeType, text: skill }],
  }))
  const tools = context.beta.has('weekly-audit') ? AUDIT_BETA_TOOLS : TOOLS
  for (const tool of tools) {
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
