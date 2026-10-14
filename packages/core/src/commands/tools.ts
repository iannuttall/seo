import { z } from 'zod'
import { runReport, SECTION_IDS, SECTIONS } from './report.js'
import {
  RESEARCH_ACTIONS,
  RESEARCH_HELP,
  RESEARCH_PROVIDERS,
  runResearch,
} from './research.js'
import { KEY_HEADERS } from './research-providers.js'
import { DIMENSIONS, runRows } from './rows.js'
import { LOST_PAGES_RULE, runCompare, runLostPages, runPage } from './site.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandId,
  type CommandResult,
} from './types.js'

// The MCP tools for the shared commands, defined once for the hosted MCP and
// the local MCP. Each surface supplies how it reaches Google and the keys.

export type ToolSurface = {
  deps: CommandDeps
  // The Search Console property that covers a site or URL.
  resolveSite: (site: string) => Promise<string>
  // Provider keys as header-style names, such as x-ahrefs-key.
  keys: () => Promise<Headers>
  // The Ahrefs key for the free Domain Rating column, when there is one.
  drKey?: string | null
  // Landing pages from an analytics source, when this surface can read one.
  analytics?: (
    input: AnalyticsInput,
  ) => Promise<{ text: string; data: unknown }>
}

export type AnalyticsInput = {
  source: Exclude<(typeof DATA_SOURCES)[number], 'search_console'>
  site: string
  startDate?: string
  endDate?: string
  detail: 'summary' | 'rows' | 'full'
  offset: number
}

const site = z
  .string()
  .min(1)
  .describe(
    'Search Console property or site, such as sc-domain:example.com, https://example.com/ or example.com.',
  )

const dates = {
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
}

const detail = {
  detail: z
    .enum(['summary', 'rows', 'full'])
    .default('summary')
    .describe(
      'summary first. rows: the next page of rows. full: every field as JSON.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('rows only: the first row to return.'),
}

export const DATA_SOURCES = [
  'search_console',
  'google_analytics',
  'clicky',
  'fathom',
  'simple_analytics',
  'plausible',
] as const

export type SharedTool = {
  name: string
  command: CommandId
  title: string
  description: string
  input: z.ZodObject
  run: (surface: ToolSurface, input: never) => Promise<CommandResult>
}

function tool<S extends z.ZodObject>(spec: {
  name: string
  command: CommandId
  title: string
  description: string
  input: S
  run: (surface: ToolSurface, input: z.output<S>) => Promise<CommandResult>
}): SharedTool {
  return spec as unknown as SharedTool
}

export const SHARED_TOOLS: SharedTool[] = [
  tool({
    name: 'seo_report',
    command: 'report',
    title: 'Search Console report',
    description: `The main report for a Search Console property. Without a section it returns the overview plus each section's row count and top rows. With a section it returns that section's rows; page sections also check their top 20 URLs live. Sections:\n${Object.entries(
      SECTIONS,
    )
      .map(([id, text]) => `- ${id}: ${text}`)
      .join('\n')}`,
    input: z.object({
      site,
      section: z
        .enum(SECTION_IDS)
        .optional()
        .describe('Optional. Leave it out first; then ask for one section.'),
      ...dates,
      ...detail,
    }),
    run: async (surface, input) =>
      runReport(
        {
          site: await surface.resolveSite(input.site),
          section: input.section,
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_page',
    command: 'page',
    title: 'One page',
    description:
      'Everything for one URL: live page facts (status, redirect, title, description, H1, canonical, robots), Google’s index status from URL Inspection, and the page’s Search Console queries against the previous period.',
    input: z.object({ url: z.url(), ...dates, ...detail }),
    run: async (surface, input) =>
      runPage(
        {
          site: await surface.resolveSite(input.url),
          url: input.url,
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_compare',
    command: 'compare',
    title: 'Before and after a date',
    description:
      'Compares equal periods before and after a date, such as a site change or a Google update: totals, devices, and the pages and queries that moved, with Google updates in the window. Optional pages narrows it to URLs that contain that text, such as /blog/.',
    input: z.object({
      site,
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('YYYY-MM-DD: the first day after the change.'),
      pages: z
        .string()
        .min(1)
        .optional()
        .describe('Optional URL text, such as /blog/.'),
    }),
    run: async (surface, input) =>
      runCompare(
        {
          site: await surface.resolveSite(input.site),
          date: input.date,
          pages: input.pages,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_index',
    command: 'index',
    title: 'Pages that lost their clicks',
    description: `${LOST_PAGES_RULE} It shows pages that broke, redirect, block indexing or dropped out of Google.`,
    input: z.object({ site, ...dates }),
    run: async (surface, input) =>
      runLostPages(
        {
          site: await surface.resolveSite(input.site),
          startDate: input.start_date,
          endDate: input.end_date,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_research',
    command: 'research',
    title: 'Keyword, competitor and backlink data',
    description: `Data from the person’s own DataForSEO, Ahrefs or Semrush account, which costs them credits. Key headers on the hosted server: ${Object.entries(
      KEY_HEADERS,
    )
      .map(([provider, header]) => `${provider} ${header}`)
      .join('; ')}. Actions: ${RESEARCH_HELP}`,
    input: z.object({
      provider: z.enum(RESEARCH_PROVIDERS),
      action: z.enum(RESEARCH_ACTIONS),
      keywords: z.array(z.string().min(1)).max(100).default([]),
      target: z.string().default('').describe('Domain or URL.'),
      country: z
        .string()
        .regex(/^[a-z]{2}$/)
        .default('us')
        .describe('Two-letter country code.'),
      ...detail,
    }),
    run: async (surface, input) =>
      runResearch(input, await surface.keys(), {
        drKey: surface.drKey,
        call: (offset) =>
          `seo_research with the same input, detail "rows", offset ${offset}`,
      }),
  }),
  tool({
    name: 'seo_data',
    command: 'data',
    title: 'Raw rows',
    description:
      'Raw rows for questions the report does not answer. search_console (default): rows for any dimensions, each with the previous period and the change; page and query narrow to rows whose URL or query contains that text. The other sources: landing pages for visits from search, from Google Analytics or from Clicky, Fathom, Simple Analytics or Plausible with the person’s key; each keeps its own metric names.',
    input: z.object({
      source: z.enum(DATA_SOURCES).default('search_console'),
      site: z
        .string()
        .min(1)
        .describe(
          'search_console: the property or site. google_analytics: numeric property id from seo_sites. clicky and fathom: site id. simple_analytics and plausible: the domain.',
        ),
      dimensions: z
        .array(z.enum(DIMENSIONS))
        .max(4)
        .default(['query'])
        .describe('search_console only.'),
      page: z
        .string()
        .min(1)
        .optional()
        .describe('search_console only: URL text, such as /blog/.'),
      query: z
        .string()
        .min(1)
        .optional()
        .describe('search_console only: query text.'),
      ...dates,
      ...detail,
    }),
    run: async (surface, input) => {
      if (input.source !== 'search_console') {
        if (!surface.analytics) {
          throw new CommandError(
            'INVALID_INPUT',
            `${input.source} is not available here. Use the hosted MCP at https://seoskill.dev/mcp, or \`seo analytics\` in the CLI.`,
          )
        }
        return surface.analytics({
          source: input.source,
          site: input.site,
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
        })
      }
      return runRows(
        {
          site: await surface.resolveSite(input.site),
          dimensions: input.dimensions,
          filters: [
            ...(input.page
              ? [
                  {
                    dimension: 'page' as const,
                    operator: 'contains' as const,
                    expression: input.page,
                  },
                ]
              : []),
            ...(input.query
              ? [
                  {
                    dimension: 'query' as const,
                    operator: 'contains' as const,
                    expression: input.query,
                  },
                ]
              : []),
          ],
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
        },
        surface.deps,
      )
    },
  }),
]

// Parses the input with the tool's schema, so bad input fails the same way on
// every surface.
export async function runSharedTool(
  tool: SharedTool,
  surface: ToolSurface,
  input: unknown,
): Promise<CommandResult> {
  const parsed = tool.input.safeParse(input ?? {})
  if (!parsed.success) {
    throw new CommandError(
      'INVALID_INPUT',
      parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; '),
    )
  }
  return tool.run(surface, parsed.data as never)
}

export const MCP_INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics and optional keyword and analytics accounts, and returns facts with their dates and limits. It gives no advice.
1. seo_sites: the properties this sign-in can read.
2. seo_report: the main report. Run it without a section first; it shows the overview and every section's count and top rows. Then ask for the one section you need.
3. seo_page for one URL, seo_compare for before and after a date, seo_index for pages that lost their clicks, seo_research for keyword, competitor and backlink data from the person's own DataForSEO, Ahrefs or Semrush key, seo_data for raw rows.
Show the person the facts that matter, for example in a table or a small dashboard, and decide with them what to change. Do not edit pages without their approval.`

// How an MCP surface writes "run this next": the tool name and its inputs.
export const mcpCall: Caller = (command, args) => {
  const name = `seo_${command.replace('-', '_')}`
  const shown = Object.entries(args ?? {}).filter(
    ([, value]) => value !== undefined,
  )
  return shown.length
    ? `${name} with ${shown.map(([key, value]) => `${key} ${typeof value === 'number' ? value : `"${value}"`}`).join(', ')}`
    : name
}
