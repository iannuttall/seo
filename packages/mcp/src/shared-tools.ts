import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  LOCAL_SIGN_IN,
  localAccounts,
  localError,
  localRefreshClicky,
  localResearchKeys,
  nodeCommandDeps,
  resolveLocalSite,
  type TelemetryOptions,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
} from '@seo/core'
import {
  type CommandId,
  mcpCall,
  runSharedTool,
  SHARED_TOOLS,
  telemetryReportFor,
} from '@seo/core/commands'
import * as z from 'zod/v4'
import { executeReport } from './reports.js'
import { type ToolResult, toolError } from './tool-result.js'

// The local MCP serves the same tools as the hosted MCP, with this machine's
// Google sign-in and saved keys, plus the two that need a local crawl.

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
}

function text(value: string): ToolResult {
  return { content: [{ type: 'text', text: value }] }
}

async function counted(
  command: CommandId,
  args: Record<string, unknown>,
  telemetry: (() => TelemetryOptions) | undefined,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const report = telemetry
    ? telemetryReportFor(command, {
        section: typeof args.section === 'string' ? args.section : undefined,
        action: typeof args.action === 'string' ? args.action : undefined,
      })
    : null
  if (report && telemetry) trackTelemetryReportStart(report, telemetry())
  try {
    const result = await run()
    if (report && telemetry) {
      if (result.isError) {
        trackTelemetryReportFailed(
          report,
          result.structuredContent?.error,
          telemetry(),
        )
      } else {
        trackTelemetryReportComplete(report, telemetry())
      }
    }
    return result
  } catch (error) {
    if (report && telemetry)
      trackTelemetryReportFailed(report, error, telemetry())
    return toolError(localError(error))
  }
}

export function registerSharedTools(
  server: McpServer,
  options: { telemetry?: () => TelemetryOptions } = {},
): void {
  const surface = {
    deps: nodeCommandDeps({ call: mcpCall }),
    resolveSite: (site: string) => resolveLocalSite(site),
    keys: localResearchKeys,
    refreshClicky: localRefreshClicky,
    drKey: null,
    accounts: localAccounts,
    signIn: LOCAL_SIGN_IN.signIn,
    connect:
      'run `seo login` to use your seoskill.dev account (Google, Bing and keys in one place), or `seo auth login`, `seo providers bing connect` and `seo providers dataforseo connect` or `seo providers ahrefs connect` on this machine only.',
  }
  for (const shared of SHARED_TOOLS) {
    server.registerTool(
      shared.name,
      {
        title: shared.title,
        description: shared.description,
        inputSchema: shared.input.shape,
        annotations: readOnly,
      },
      async (input: Record<string, unknown>) =>
        counted(shared.command, input, options.telemetry, async () => {
          const result = await runSharedTool(shared, surface, input)
          return text(result.text)
        }),
    )
  }

  server.registerTool(
    'seo_crawl',
    {
      title: 'Crawl a site',
      description:
        'Crawls a site from this machine and returns technical issues and the URLs they affect. The crawl is saved locally for later reports.',
      inputSchema: { url: z.url() },
      annotations: readOnly,
    },
    async ({ url }) =>
      counted('crawl', {}, options.telemetry, () =>
        executeReport('site-crawl', { url, saveReport: true }),
      ),
  )

  server.registerTool(
    'seo_internal_links',
    {
      title: 'Internal link opportunities',
      description:
        'Pages of the same site that could link to a target page, from Search Console and live page checks on this machine. Each one names the sentence where the link fits and anchor text from it. Takes the target URL and optional dates (default: the last 90 days).',
      inputSchema: {
        url: z.url(),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD. Optional; send with end_date.'),
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD. Optional; send with start_date.'),
      },
      annotations: readOnly,
    },
    async ({ url, start_date, end_date }) =>
      counted('internal-links', {}, options.telemetry, async () => {
        try {
          const site = await resolveLocalSite(url)
          return await executeReport('internal-links', {
            site,
            targetUrl: url,
            startDate: start_date,
            endDate: end_date,
          })
        } catch (error) {
          return toolError(localError(error))
        }
      }),
  )
}
