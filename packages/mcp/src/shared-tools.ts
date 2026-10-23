import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  cloudLinked,
  internalLinksReport,
  LOCAL_SIGN_IN,
  localAccounts,
  localError,
  localInternalLinksDependencies,
  localRefreshClicky,
  localResearchKeys,
  MAX_MAX_PAGES,
  nodeCommandDeps,
  resolveLocalSite,
  SeoError,
  type TelemetryOptions,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
  updateNotice,
} from '@seo/core'
import {
  type CommandId,
  internalLinksText,
  mcpCall,
  runSharedTool,
  SHARED_TOOLS,
  telemetryReportFor,
  WEEK_TOOL,
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

async function countedRun(
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
    const failure = localError(error)
    if (report && telemetry)
      trackTelemetryReportFailed(report, failure, telemetry())
    return toolError(failure)
  }
}

// Every tool result ends with the update notice when this seo is behind.
async function counted(
  command: CommandId,
  args: Record<string, unknown>,
  telemetry: (() => TelemetryOptions) | undefined,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const result = await countedRun(command, args, telemetry, run)
  const notice = updateNotice()
  return notice
    ? {
        ...result,
        content: [...result.content, { type: 'text' as const, text: notice }],
      }
    : result
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
  // seo_week only on a machine linked to a seoskill.dev account, where the
  // weekly site audit lives.
  for (const shared of cloudLinked()
    ? [...SHARED_TOOLS, WEEK_TOOL]
    : SHARED_TOOLS) {
    server.registerTool(
      shared.name,
      {
        title: shared.title,
        description: shared.description,
        inputSchema: (shared.localInput ?? shared.input).shape,
        annotations: readOnly,
      },
      async (input: Record<string, unknown>) =>
        counted(shared.command, input, options.telemetry, async () => {
          const result = await runSharedTool(shared, surface, input, true)
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
      title: 'Internal links',
      description:
        'Internal links to add, crawled from this machine. Send site to audit a whole site, or url to find links to one page. Each link names a real sentence on the source and a real phrase from it as anchor text. With a TypeSafe key (TYPESAFE_API_KEY or the seoskill.dev account), Jev classifies pages and judges each link; without one the result says Jev was not used. Search Console query overlap is added when this login has the property.',
      inputSchema: {
        site: z
          .string()
          .min(1)
          .optional()
          .describe('Site to audit: a domain, URL or Search Console property.'),
        url: z.url().optional().describe('One page to find links to.'),
        max_pages: z
          .number()
          .int()
          .min(1)
          .max(MAX_MAX_PAGES)
          .optional()
          .describe('site only: pages to crawl, 500 by default, up to 5,000.'),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            'YYYY-MM-DD for Search Console. Optional; send with end_date.',
          ),
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD. Optional; send with start_date.'),
        detail: z
          .enum(['summary', 'rows', 'full'])
          .default('summary')
          .describe(
            'summary first. rows: the next page of links. full: every field as JSON.',
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('rows only: the first link to return.'),
      },
      annotations: readOnly,
    },
    async ({ site, url, max_pages, start_date, end_date, detail, offset }) =>
      counted('internal-links', {}, options.telemetry, async () => {
        try {
          if (Boolean(site) === Boolean(url)) {
            throw new SeoError(
              'INVALID_INPUT',
              'Send site to audit a whole site, or url to find links to one page.',
            )
          }
          const target = (url ?? site) as string
          const report = await internalLinksReport(
            {
              site: target,
              targetUrl: url,
              maxPages: max_pages,
              startDate: start_date,
              endDate: end_date,
            },
            await localInternalLinksDependencies({ site: target }),
          )
          return text(
            internalLinksText(report, {
              detail,
              offset,
              more: (view, from) =>
                mcpCall('internal-links', {
                  ...(url ? { url } : { site }),
                  ...(max_pages ? { max_pages } : {}),
                  detail: view,
                  offset: from,
                }),
            }),
          )
        } catch (error) {
          return toolError(localError(error))
        }
      }),
  )
}
