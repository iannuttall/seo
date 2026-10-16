import { z } from 'zod'
import { analyticsSignIn, runAnalyticsRows } from './analytics.js'
import { runBingRows } from './bing.js'
import { runReport, SECTION_IDS, SECTIONS } from './report.js'
import {
  RESEARCH_ACTIONS,
  RESEARCH_HELP,
  RESEARCH_PROVIDERS,
  runResearch,
} from './research.js'
import { DIMENSIONS, runRows } from './rows.js'
import { LOST_PAGES_RULE, runCompare, runLostPages, runPage } from './site.js'
import { type GoogleAccount, runSites } from './sites.js'
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
  // Includes Bing calls when Bing is connected.
  deps: CommandDeps
  // The Search Console property that covers a site or URL.
  resolveSite: (site: string) => Promise<string>
  // Provider keys as header-style names, such as x-ahrefs-key.
  keys: () => Promise<Headers>
  // The Ahrefs key for the free Domain Rating column, when there is one.
  drKey?: string | null
  // Every Google sign-in on this surface, for listing and Google Analytics.
  accounts: () => Promise<GoogleAccount[]>
  // What to do when Google rejects the sign-in.
  signIn: string
  // Where to add a Google account, Bing or a key on this surface.
  connect: string
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
  'bing',
] as const

// Other analytics sources run on the person's machine through provider
// packages, like crawls. Agents with a shell use the CLI for them.
export const LOCAL_ANALYTICS =
  'Clicky and other analytics run on the person’s machine with the CLI and a provider package: `npx -y seo providers install @seoskill/clicky-provider`, connect it once with `seo providers connect clicky`, then `npx -y seo analytics clicky report --json`. `seo providers list` shows installed providers.'

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
    name: 'seo_sites',
    command: 'data',
    title: 'List sites',
    description:
      'Lists the Search Console and Google Analytics properties the connected Google accounts can read, the Bing Webmaster site for each, and which research keys are set. Call it first.',
    input: z.object({}),
    run: async (surface) =>
      runSites({
        accounts: await surface.accounts(),
        keys: await surface.keys(),
        signIn: surface.signIn,
        bing: surface.deps.bing ? await surface.deps.bing() : undefined,
        connect: surface.connect,
      }),
  }),
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
          // The bing section needs only Bing: without a Google property it
          // shows the Bing rows and says Google was not available.
          site:
            input.section === 'bing'
              ? await surface.resolveSite(input.site).catch(() => input.site)
              : await surface.resolveSite(input.site),
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
    description: `Data from the person’s own DataForSEO or Ahrefs account, which costs them credits. It uses the key the person saved on their seoskill.dev account (or on this machine for the CLI). Actions: ${RESEARCH_HELP}`,
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
    description: `Raw rows for questions the report does not answer. search_console (default): rows for any dimensions, each with the previous period and the change; page and query narrow to rows whose URL or query contains that text. google_analytics: landing pages for visits from search, with Google Analytics’ own metric names. bing: Bing Webmaster query or page rows (first dimension) for the same site, by week. ${LOCAL_ANALYTICS}`,
    input: z.object({
      source: z.enum(DATA_SOURCES).default('search_console'),
      site: z
        .string()
        .min(1)
        .describe(
          'search_console and bing: the property or site. google_analytics: numeric property id from seo_sites.',
        ),
      dimensions: z
        .array(z.enum(DIMENSIONS))
        .max(4)
        .default(['query'])
        .describe('search_console; bing uses the first, query or page.'),
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
      if (input.source === 'bing') {
        return runBingRows(
          {
            site: input.site,
            dimension: input.dimensions[0] === 'page' ? 'page' : 'query',
            startDate: input.start_date,
            endDate: input.end_date,
            detail: input.detail,
            offset: input.offset,
          },
          surface.deps,
        )
      }
      if (input.source === 'google_analytics') {
        return runAnalyticsRows(
          {
            property: input.site,
            startDate: input.start_date,
            endDate: input.end_date,
            detail: input.detail,
            offset: input.offset,
          },
          await analyticsSignIn(
            await surface.accounts(),
            input.site,
            surface.signIn,
          ),
          {
            signIn: surface.signIn,
            call: (offset) =>
              `seo_data with source "google_analytics", site "${input.site}", detail "rows", offset ${offset}`,
          },
        )
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

export const MCP_INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics, Bing Webmaster Tools and optional keyword and analytics accounts, and returns facts with their dates and limits. It gives no advice.
1. seo_sites: the properties the connected accounts can read.
2. seo_report: the main report. Run it without a section first; it shows the overview and every section's count and top rows. Then ask for the one section you need.
3. seo_page for one URL, seo_compare for before and after a date, seo_index for pages that lost their clicks, seo_research for keyword, competitor and backlink data from the DataForSEO or Ahrefs key the person saved, seo_data for raw rows.
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

// The skill as an MCP resource (Skills over MCP, SEP-2640), so a client that
// loads skills from a server gets the same skills/seo/SKILL.md as
// `npx skills add`. Each server supplies the file's text.
export const SKILL_RESOURCE = {
  name: 'seo-skill',
  uri: 'skill://seo/SKILL.md',
  title: 'SEO Skill',
  description:
    'How to use these tools: the commands, the one-report flow and the evidence rules.',
  mimeType: 'text/markdown',
} as const
