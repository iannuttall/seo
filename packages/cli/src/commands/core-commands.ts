import {
  listSites,
  localError,
  localResearchKeys,
  nodeCommandDeps,
  SeoError,
} from '@seo/core'
import {
  type Caller,
  type CommandResult,
  DIMENSIONS,
  type Dimension,
  matchProperty,
  RESEARCH_ACTIONS,
  RESEARCH_PROVIDERS,
  type ResearchAction,
  type ResearchProvider,
  runCompare,
  runLostPages,
  runPage,
  runReport,
  runResearch,
  runRows,
  SECTION_IDS,
  type SectionId,
} from '@seo/core/commands'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { printJson } from '../utils.js'
import { selectedSiteOrThrow } from './shared.js'

// The shared commands: the same core code and text as the hosted MCP, with
// this machine's Google sign-in. Each takes a target, optional dates and
// progressive detail, nothing more.

const FLAGS: Record<string, string> = {
  site: '--site',
  url: '--url',
  section: '--section',
  date: '--date',
  pages: '--pages',
  dimensions: '--dimensions',
  detail: '--detail',
  offset: '--offset',
}

const quote = (value: string | number) =>
  /^[\w:/.,<>@#?=&%+-]+$/.test(String(value)) ? String(value) : `"${value}"`

export const cliCall: Caller = (command, args) =>
  [
    `seo ${command}`,
    ...Object.entries(args ?? {})
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) => `${FLAGS[key] ?? `--${key}`} ${quote(value ?? '')}`,
      ),
  ].join(' ')

const common = {
  project: { type: 'string', description: 'Saved project id or name.' },
  client: { type: 'string', description: 'Legacy alias for --project.' },
  account: { type: 'string', description: 'Saved Google account email.' },
  json: {
    type: 'boolean',
    default: false,
    description: 'Print machine-readable JSON.',
  },
  refresh: {
    type: 'boolean',
    default: false,
    description: 'Bypass the local cache and fetch fresh data.',
  },
} as const

const dates = {
  'start-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
  'end-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
} as const

const detail = {
  detail: {
    type: 'string',
    description: 'summary (default), rows for the next page, or full.',
  },
  offset: { type: 'string', description: 'rows only: the first row.' },
} as const

type Args = Record<string, unknown>

function detailArg(args: Args) {
  const value = stringArg(args.detail) ?? 'summary'
  if (!['summary', 'rows', 'full'].includes(value)) {
    throw new SeoError('INVALID_INPUT', '--detail is summary, rows or full.')
  }
  return value as 'summary' | 'rows' | 'full'
}

// A saved project, or the property that covers --site or --url.
async function property(args: Args, target?: string): Promise<string> {
  const options = {
    json: jsonFlag(args),
    refresh: booleanArg(args.refresh),
    account: stringArg(args.account),
  }
  if (!target || projectArg(args)) {
    return selectedSiteOrThrow({ client: projectArg(args) }, options)
  }
  const names = (await listSites(options.refresh, options.account)).map(
    (site) => site.siteUrl,
  )
  const found = matchProperty(names, target)
  if (!found) {
    throw new SeoError(
      'PROPERTY_NOT_FOUND',
      `This Google login has no Search Console property for ${target}. Run \`seo sites\` to list the properties it can read.`,
    )
  }
  return found
}

async function run(
  args: Args,
  task: (deps: ReturnType<typeof nodeCommandDeps>) => Promise<CommandResult>,
) {
  try {
    const result = await task(
      nodeCommandDeps({
        call: cliCall,
        account: stringArg(args.account),
        refresh: booleanArg(args.refresh),
      }),
    )
    if (jsonFlag(args)) printJson(result.data)
    else process.stdout.write(`${result.text}\n`)
  } catch (error) {
    throw localError(error)
  }
}

export const reportCommand = defineCommand({
  meta: {
    name: 'report',
    description:
      'The main Search Console report: overview and every section, then one section on request',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    section: {
      type: 'string',
      description: `Optional. One of ${SECTION_IDS.join(', ')}.`,
    },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const section = stringArg(args.section)
    if (section && !SECTION_IDS.includes(section as SectionId)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--section is one of ${SECTION_IDS.join(', ')}.`,
      )
    }
    const site = await property(args, stringArg(args.site))
    await run(args, (deps) =>
      runReport(
        {
          site,
          section: section as SectionId | undefined,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        deps,
      ),
    )
  },
})

export const pageCommand = defineCommand({
  meta: {
    name: 'page',
    description:
      'One URL: live page facts, Google index status and its queries',
  },
  args: {
    url: { type: 'string', description: 'The page URL.', required: true },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const url = stringArg(args.url) ?? ''
    if (!/^https?:\/\/\S+$/.test(url)) {
      throw new SeoError('INVALID_INPUT', '--url must be a full http(s) URL.')
    }
    const site = await property(args, url)
    await run(args, (deps) =>
      runPage(
        {
          site,
          url,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        deps,
      ),
    )
  },
})

export const compareCommand = defineCommand({
  meta: {
    name: 'compare',
    description:
      'Equal periods before and after a date, with the pages and queries that moved',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    date: {
      type: 'string',
      description: 'YYYY-MM-DD: the first day after the change.',
      required: true,
    },
    pages: {
      type: 'string',
      description: 'Optional URL text, such as /blog/.',
    },
    ...common,
  },
  run: async ({ args }) => {
    const site = await property(args, stringArg(args.site))
    await run(args, (deps) =>
      runCompare(
        {
          site,
          date: stringArg(args.date) ?? '',
          pages: stringArg(args.pages),
        },
        deps,
      ),
    )
  },
})

export const indexCommand = defineCommand({
  meta: {
    name: 'index',
    description:
      'Pages that lost most of their clicks, checked live and with URL Inspection',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    ...dates,
    ...common,
  },
  run: async ({ args }) => {
    const site = await property(args, stringArg(args.site))
    await run(args, (deps) =>
      runLostPages(
        {
          site,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
        },
        deps,
      ),
    )
  },
})

export const dataCommand = defineCommand({
  meta: {
    name: 'data',
    description:
      'Raw Search Console rows for any dimensions, beside the previous period',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    dimensions: {
      type: 'string',
      description: `Comma-separated: ${DIMENSIONS.join(', ')}. Default query.`,
    },
    page: {
      type: 'string',
      description: 'Optional: only rows for pages whose URL contains this.',
    },
    query: {
      type: 'string',
      description: 'Optional: only rows for queries that contain this.',
    },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const dimensions = csvArg(args.dimensions) ?? ['query']
    const unknown = dimensions.filter(
      (dimension) => !DIMENSIONS.includes(dimension as Dimension),
    )
    if (unknown.length) {
      throw new SeoError(
        'INVALID_INPUT',
        `Unknown dimensions: ${unknown.join(', ')}. Use ${DIMENSIONS.join(', ')}.`,
      )
    }
    const site = await property(args, stringArg(args.site))
    const page = stringArg(args.page)
    const query = stringArg(args.query)
    await run(args, (deps) =>
      runRows(
        {
          site,
          dimensions: dimensions as Dimension[],
          filters: [
            ...(page
              ? [
                  {
                    dimension: 'page' as const,
                    operator: 'contains' as const,
                    expression: page,
                  },
                ]
              : []),
            ...(query
              ? [
                  {
                    dimension: 'query' as const,
                    operator: 'contains' as const,
                    expression: query,
                  },
                ]
              : []),
          ],
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        deps,
      ),
    )
  },
})

export const researchCommand = defineCommand({
  meta: {
    name: 'research',
    description:
      'Keyword, SERP, competitor and backlink data from your DataForSEO or Ahrefs key',
  },
  args: {
    action: {
      type: 'positional',
      required: true,
      description: RESEARCH_ACTIONS.join(', '),
    },
    provider: {
      type: 'string',
      description: `${RESEARCH_PROVIDERS.join(', ')}. Default: the first one with a saved key.`,
    },
    keywords: { type: 'string', description: 'Comma-separated keywords.' },
    target: { type: 'string', description: 'Domain or URL.' },
    country: {
      type: 'string',
      description: 'Two-letter country code. Default us.',
    },
    ...detail,
    json: common.json,
  },
  run: async ({ args }) => {
    const action = stringArg(args.action) as ResearchAction
    if (!RESEARCH_ACTIONS.includes(action)) {
      throw new SeoError(
        'INVALID_INPUT',
        `The action is one of ${RESEARCH_ACTIONS.join(', ')}.`,
      )
    }
    const keys = await localResearchKeys()
    const header: Record<ResearchProvider, string> = {
      dataforseo: 'x-dataforseo-login',
      ahrefs: 'x-ahrefs-key',
    }
    const chosen = stringArg(args.provider)
    const provider = (chosen ??
      RESEARCH_PROVIDERS.find((name) => keys.has(header[name])) ??
      'dataforseo') as ResearchProvider
    if (!RESEARCH_PROVIDERS.includes(provider)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--provider is one of ${RESEARCH_PROVIDERS.join(', ')}.`,
      )
    }
    if (!keys.has(header[provider])) {
      throw new SeoError(
        'AUTH_CONFIG_REQUIRED',
        `No ${provider} key saved. Run \`seo providers ${provider} connect\` first.`,
      )
    }
    const keywords = csvArg(args.keywords) ?? []
    const target = stringArg(args.target)
    const country = stringArg(args.country)
    await run(args, () =>
      runResearch(
        {
          provider,
          action,
          keywords,
          target,
          country,
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        keys,
        {
          call: (offset) =>
            cliCall('research', {
              action,
              provider,
              keywords: keywords.join(',') || undefined,
              target,
              country,
              detail: 'rows',
              offset,
            }).replace('--action ', ''),
        },
      ),
    )
  },
})
