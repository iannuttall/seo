import {
  localError,
  localRefreshClicky,
  localResearchKeys,
  nodeCommandDeps,
  SeoError,
} from '@seo/core'
import {
  type Caller,
  type CommandResult,
  DIMENSIONS,
  type Dimension,
  INSPECT_LIMIT,
  MAX_INSPECT_LIMIT,
  RESEARCH_ACTIONS,
  RESEARCH_PROVIDERS,
  type ResearchAction,
  type ResearchProvider,
  runAiAnswers,
  runBingReport,
  runBingRows,
  runClickyRows,
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
import { booleanArg, csvArg, jsonFlag, numberArg, stringArg } from '../args.js'
import { requireSite, resolveProperty } from '../selection.js'
import { printJson } from '../utils.js'

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
  max_urls: '--max-urls',
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

export const dates = {
  'start-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
  'end-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
} as const

export const detail = {
  detail: {
    type: 'string',
    description: 'summary (default), rows for the next page, or full.',
  },
  offset: { type: 'string', description: 'rows only: the first row.' },
} as const

type Args = Record<string, unknown>

export function detailArg(args: Args) {
  const value = stringArg(args.detail) ?? 'summary'
  if (!['summary', 'rows', 'full'].includes(value)) {
    throw new SeoError('INVALID_INPUT', '--detail is summary, rows or full.')
  }
  return value as 'summary' | 'rows' | 'full'
}

// The property that covers --site or --url.
function property(args: Args, target?: string): Promise<string> {
  return resolveProperty(target, {
    refresh: booleanArg(args.refresh),
    account: stringArg(args.account),
  })
}

export async function run(
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
    // The bing section needs only Bing: without a Google property it shows
    // the Bing rows and says Google was not available.
    const target = stringArg(args.site)
    const site =
      section === 'bing'
        ? await property(args, target).catch(() => requireSite(target))
        : await property(args, target).catch(async (error: unknown) => {
            // A site with no Search Console property can still have Bing.
            if (section || !target) throw error
            await run(args, (deps) =>
              runBingReport(
                {
                  site: requireSite(target),
                  startDate: stringArg(args['start-date']),
                  endDate: stringArg(args['end-date']),
                },
                deps,
              ).catch(() => {
                throw error
              }),
            )
            return null
          })
    if (site === null) return
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
      'Google indexing reasons for known URLs, checked live, and pages that lost most of their clicks',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    'max-urls': {
      type: 'string',
      description: `How many URLs to ask Google about, ${INSPECT_LIMIT} by default. Ask for more when you want a fuller picture; it stops at the URL Inspection quota left today.`,
    },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const site = await property(args, stringArg(args.site))
    const maxUrls = numberArg(args['max-urls'])
    if (
      maxUrls !== undefined &&
      (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > MAX_INSPECT_LIMIT)
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        `--max-urls is a whole number from 1 to ${MAX_INSPECT_LIMIT}.`,
      )
    }
    await run(args, (deps) =>
      runLostPages(
        {
          site,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
          maxUrls,
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
      'Raw Search Console or Bing rows beside the previous period, or Clicky landing pages',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    source: {
      type: 'string',
      description:
        'search_console (default), bing or clicky. Bing takes the first dimension, query or page. Clicky takes the site or its Clicky site ID.',
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
    const source = stringArg(args.source) ?? 'search_console'
    if (!['search_console', 'bing', 'clicky'].includes(source)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--source is search_console, bing or clicky.',
      )
    }
    if (source === 'clicky') {
      const site = requireSite(stringArg(args.site))
      await run(args, async () =>
        runClickyRows(
          {
            site,
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            detail: detailArg(args),
            offset: numberArg(args.offset),
          },
          await localResearchKeys(),
          {
            connect:
              'save it at https://seoskill.dev/account#keys and run `seo login`, or run `seo analytics clicky connect` to keep it on this machine only.',
            refresh: localRefreshClicky,
            call: (offset) =>
              cliCall('data', {
                source: 'clicky',
                site,
                detail: 'rows',
                offset,
              }),
          },
        ),
      )
      return
    }
    // Bing needs only Bing: its own site list matches the site.
    if (source === 'bing') {
      const site = requireSite(stringArg(args.site))
      await run(args, (deps) =>
        runBingRows(
          {
            site,
            dimension: dimensions[0] === 'page' ? 'page' : 'query',
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            detail: detailArg(args),
            offset: numberArg(args.offset),
          },
          deps,
        ),
      )
      return
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
      'Keyword, SERP, competitor, backlink and AI answer data from your DataForSEO or Ahrefs key',
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
    account: common.account,
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
      (action === 'ai_answers'
        ? 'dataforseo'
        : RESEARCH_PROVIDERS.find((name) => keys.has(header[name]))) ??
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
        `No ${provider} key. Save it at https://seoskill.dev/account#keys and run \`seo login\`, or run \`seo providers ${provider} connect\` to keep it on this machine only.`,
      )
    }
    const keywords = csvArg(args.keywords) ?? []
    const target = stringArg(args.target)
    const country = stringArg(args.country)
    if (action === 'ai_answers') {
      if (provider !== 'dataforseo') {
        throw new SeoError('INVALID_INPUT', 'ai_answers uses dataforseo.')
      }
      const site = await property(args, target)
      await run(args, (deps) =>
        runAiAnswers(
          {
            site,
            country: country ?? 'us',
            detail: detailArg(args),
            offset: numberArg(args.offset) ?? 0,
          },
          keys,
          deps,
          (offset) =>
            cliCall('research', {
              action,
              target,
              country,
              detail: 'rows',
              offset,
            }).replace('--action ', ''),
        ),
      )
      return
    }
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
