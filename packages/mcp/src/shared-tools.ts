import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  listSites,
  localError,
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
  table,
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
  server.registerTool(
    'seo_sites',
    {
      title: 'List sites',
      description:
        'Lists the Search Console properties this Google login can read. Call it first.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      try {
        const sites = await listSites()
        return text(
          [
            `Search Console properties (${sites.length}):`,
            sites.length
              ? table(sites, ['siteUrl', 'permissionLevel'], null)
              : 'None. Run `seo start` to sign in with a Google account that has Search Console access.',
            'Next: seo_report with a site.',
          ].join('\n\n'),
        )
      } catch (error) {
        return toolError(localError(error))
      }
    },
  )

  const surface = {
    deps: nodeCommandDeps({ call: mcpCall }),
    resolveSite: (site: string) => resolveLocalSite(site),
    keys: localResearchKeys,
    drKey: null,
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
        'Pages of the same site that could link to a target page, from Search Console and live page checks on this machine.',
      inputSchema: { url: z.url() },
      annotations: readOnly,
    },
    async ({ url }) =>
      counted('internal-links', {}, options.telemetry, async () => {
        try {
          const site = await resolveLocalSite(url)
          return await executeReport('internal-links', {
            site,
            targetUrl: url,
          })
        } catch (error) {
          return toolError(localError(error))
        }
      }),
  )
}
