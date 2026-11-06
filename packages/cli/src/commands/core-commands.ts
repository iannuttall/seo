import {
  cloudLinked,
  localError,
  localRefreshClicky,
  localResearchKeys,
  nodeCommandDeps,
  readLintFiles,
  SeoError,
} from '@seo/core'
import {
  type Caller,
  type CommandResult,
  DIMENSIONS,
  type Dimension,
  INSPECT_LIMIT,
  ISSUE_MARKS,
  ISSUES_SECTION,
  type IssueMark,
  LINT_FORMATS,
  LINT_PRESETS,
  type LintFormat,
  type LintPreset,
  MAX_INSPECT_LIMIT,
  RESEARCH_ACTIONS,
  RESEARCH_PROVIDERS,
  RESEARCH_SCOPES,
  type ResearchAction,
  type ResearchProvider,
  type ResearchScope,
  runAiAnswers,
  runAllSites,
  runBingReport,
  runBingRows,
  runClickyRows,
  runCompare,
  runLint,
  runLostPages,
  runPage,
  runReport,
  runResearch,
  runRows,
  SECTION_IDS,
  type SectionId,
  UPDATES_SECTION,
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
  mark: '--mark',
  issues: '--issues',
  note: '--note',
  end_date: '--end-date',
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
      'Start here. No --site: last week across your audited sites (beta, after `seo login`). --site: overview and every section. Add --section for one',
  },
  args: {
    site: {
      type: 'string',
      description:
        'Site, URL or Search Console property. Leave it out for the summary of every audited site (beta, after `seo login`).',
    },
    section: {
      type: 'string',
      description: `Optional, needs --site. One of ${[...SECTION_IDS, ISSUES_SECTION, UPDATES_SECTION].join(', ')}. issues keeps a list of what was found for the site, on this machine. ${UPDATES_SECTION} lays the latest Google ranking update (or the latest that started by --end-date) over the site.`,
    },
    mark: {
      type: 'string',
      description: `With --site and --issues: ${ISSUE_MARKS.join(', ')}. Records what the person decided; runs no checks.`,
    },
    issues: {
      type: 'string',
      description:
        'With --mark: issue ids from --section issues, comma-separated.',
    },
    note: { type: 'string', description: 'Optional, with --mark: why.' },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const section = stringArg(args.section)
    const sections = [...SECTION_IDS, ISSUES_SECTION, UPDATES_SECTION]
    if (section && !sections.includes(section)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--section is one of ${sections.join(', ')}.`,
      )
    }
    const target = stringArg(args.site)
    const mark = stringArg(args.mark)
    const issues = stringArg(args.issues)
    if (mark || issues) {
      if (mark && !ISSUE_MARKS.includes(mark as IssueMark)) {
        throw new SeoError(
          'INVALID_INPUT',
          `--mark is one of ${ISSUE_MARKS.join(', ')}.`,
        )
      }
      const site = await property(args, requireSite(target))
      await run(args, (deps) =>
        runReport(
          {
            site,
            section: section as SectionId | undefined,
            mark: mark as IssueMark | undefined,
            issues: issues?.split(','),
            note: stringArg(args.note),
          },
          deps,
        ),
      )
      return
    }
    // No site on a machine linked to a seoskill.dev account: the summary of
    // every audited site. Unlinked, the "no site given" error stays.
    if (!target && !section && cloudLinked()) {
      await run(args, (deps) => runAllSites(deps))
      return
    }
    // The bing section needs only Bing: without a Google property it shows
    // the Bing rows and says Google was not available.
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
      description: `${RESEARCH_PROVIDERS.join(', ')}. Default: the saved key, DataForSEO when both are saved.`,
    },
    scope: {
      type: 'string',
      description: `${RESEARCH_SCOPES.join(', ')}. Default: from the target. A domain is the whole site, a path ending in / is every URL under it (example.com/blog/), any other path is one page.`,
    },
    keywords: { type: 'string', description: 'Comma-separated keywords.' },
    tasks: {
      type: 'string',
      description:
        'ai_answers only: comma-separated tasks an earlier run returned as not ready.',
    },
    target: {
      type: 'string',
      description: 'Domain, subfolder ending in / or page URL.',
    },
    competitors: {
      type: 'string',
      description: 'link_gap only: 2 to 5 comma-separated competitor domains.',
    },
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
    const provider = stringArg(args.provider) as ResearchProvider | undefined
    if (provider && !RESEARCH_PROVIDERS.includes(provider)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--provider is one of ${RESEARCH_PROVIDERS.join(', ')}.`,
      )
    }
    const scope = stringArg(args.scope) as ResearchScope | undefined
    if (scope && !RESEARCH_SCOPES.includes(scope)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--scope is one of ${RESEARCH_SCOPES.join(', ')}.`,
      )
    }
    const keywords = csvArg(args.keywords) ?? []
    const target = stringArg(args.target)
    const competitors = csvArg(args.competitors) ?? []
    const country = stringArg(args.country)
    if (action === 'ai_answers') {
      if (provider === 'ahrefs') {
        throw new SeoError('INVALID_INPUT', 'ai_answers uses dataforseo.')
      }
      const tasks = csvArg(args.tasks) ?? []
      const site =
        keywords.length || tasks.length
          ? (target ?? '')
          : await property(args, target)
      await run(args, (deps) =>
        runAiAnswers(
          {
            site,
            country: country ?? 'us',
            detail: detailArg(args),
            offset: numberArg(args.offset) ?? 0,
            questions: keywords,
            tasks,
            // No MCP client to time out, so wait for the queue.
            waitSeconds: 240,
          },
          keys,
          deps,
          (offset, answered) =>
            cliCall('research', {
              action,
              target,
              tasks: answered.join(',') || undefined,
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
          scope,
          action,
          keywords,
          target,
          competitors,
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
              scope,
              keywords: keywords.join(',') || undefined,
              target,
              competitors: competitors.join(',') || undefined,
              country,
              detail: 'rows',
              offset,
            }).replace('--action ', ''),
        },
      ),
    )
  },
})

export const lintCommand = defineCommand({
  meta: {
    name: 'lint',
    description:
      'Check copy for patterns common in AI-written text, weak copy and title and description length',
  },
  args: {
    paths: {
      type: 'positional',
      required: true,
      description:
        'Files, folders or globs: .md, .mdx, .html, .astro or .txt. Up to 100 files.',
    },
    preset: {
      type: 'string',
      description: `${LINT_PRESETS.join(', ')}. Default blog for Markdown and text, landing for HTML and Astro. meta reads one title or description per line.`,
    },
    format: {
      type: 'string',
      description: `${LINT_FORMATS.join(', ')}. Default: from each file name.`,
    },
    'fail-on': {
      type: 'string',
      description:
        'error (default) or warning: exit with code 1 when a finding at that level or above is found.',
    },
    ignore: {
      type: 'string',
      description: 'Rule ids or review lenses to skip, comma-separated.',
    },
    'ignore-phrase': {
      type: 'string',
      description:
        'A phrase to allow, such as a product name a rule keeps matching. Repeat it for more.',
    },
    json: common.json,
  },
  run: async ({ args }) => {
    const preset = stringArg(args.preset)
    if (preset && !LINT_PRESETS.includes(preset as LintPreset)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--preset is one of ${LINT_PRESETS.join(', ')}.`,
      )
    }
    const format = stringArg(args.format)
    if (format && !LINT_FORMATS.includes(format as LintFormat)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--format is one of ${LINT_FORMATS.join(', ')}.`,
      )
    }
    const failOn = stringArg(args['fail-on']) ?? 'error'
    if (failOn !== 'error' && failOn !== 'warning') {
      throw new SeoError('INVALID_INPUT', '--fail-on is error or warning.')
    }
    const positionals = (args._ as unknown[] | undefined) ?? []
    const paths = positionals.filter(
      (value): value is string => typeof value === 'string',
    )
    const phrases = ([] as unknown[])
      .concat(args['ignore-phrase'] ?? [])
      .filter((value): value is string => typeof value === 'string')
    try {
      const result = await runLint(
        {
          paths,
          preset: preset as LintPreset | undefined,
          format: format as LintFormat | undefined,
          ignoreRules: csvArg(args.ignore),
          ignorePhrases: phrases,
        },
        (inputs) => readLintFiles(inputs),
      )
      if (jsonFlag(args)) printJson(result.data)
      else process.stdout.write(`${result.text}\n`)
      const { errors, warnings } = result.data as {
        errors: number
        warnings: number
      }
      if (errors > 0 || (failOn === 'warning' && warnings > 0)) {
        process.exitCode = 1
      }
    } catch (error) {
      throw localError(error)
    }
  },
})
