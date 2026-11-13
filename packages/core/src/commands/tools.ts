import { z } from 'zod'
import {
  LINT_CATEGORIES,
  LINT_FORMATS,
  LINT_MAX_CHARS,
  LINT_META_KINDS,
  LINT_PRESETS,
} from '../lint/types.js'
import {
  AI_ANSWER_DOMAINS,
  AI_ANSWER_TASK_PATTERN,
  runAiAnswers,
} from './ai-answers.js'
import { analyticsSignIn, runAnalyticsRows } from './analytics.js'
import { AUDIT_SECTION, AUDIT_SECTION_TEXT } from './audit.js'
import {
  CHECKS_PAGE_SIZE,
  CHECKS_SUMMARY_ROWS,
  runAuditChecks,
} from './audit-checks.js'
import { runBingRows } from './bing.js'
import { clickyLabel, clickySites, runClickyRows } from './clicky.js'
import { INSPECT_LIMIT, MAX_INSPECT_LIMIT } from './indexing.js'
import {
  ISSUE_MARKS,
  ISSUES_SECTION,
  ISSUES_SECTION_TEXT,
  NOTE_MAX,
  SAVED_MAX,
} from './issues.js'
import { type LintSource, runLint } from './lint.js'
import type { Detail } from './present.js'
import { runBingReport, runReport, SECTION_IDS, SECTIONS } from './report.js'
import {
  type InstalledSerp,
  RESEARCH_ACTIONS,
  RESEARCH_DEVICES,
  RESEARCH_HELP,
  RESEARCH_PROVIDERS,
  RESEARCH_SCOPES,
  runResearch,
  SERP_DEPTH,
} from './research.js'
import type { ResearchStore } from './research-cache.js'
import { DIMENSIONS, REGEX_MAX_CHARS, rowTextFilters, runRows } from './rows.js'
import {
  INDEXING_RULE,
  LOST_PAGES_RULE,
  runCompare,
  runLostPages,
  runPage,
} from './site.js'
import { type GoogleAccount, runSites } from './sites.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandId,
  type CommandResult,
  type StartAudit,
} from './types.js'
import { UPDATES_SECTION, UPDATES_SECTION_TEXT } from './updates.js'
import { runAllSites } from './week.js'

// The MCP tools for the shared commands, defined once for the hosted MCP and
// the local MCP. Each surface supplies how it reaches Google and the keys.

export type ToolSurface = {
  // Includes Bing calls when Bing is connected.
  deps: CommandDeps
  // The Search Console property that covers a site or URL.
  resolveSite: (site: string) => Promise<string>
  // Provider keys as header-style names, such as x-ahrefs-key.
  keys: () => Promise<Headers>
  // Reads the saved Clicky account's sites again and returns the new keys,
  // or null when no Clicky account is saved.
  refreshClicky?: () => Promise<Headers | null>
  // Where research results are kept for a day; the Workers cache if unset.
  researchStore?: ResearchStore
  // The Ahrefs key for the free Domain Rating column, when there is one.
  drKey?: string | null
  // serp from installed provider packages, where the surface loads them.
  installedSerp?: InstalledSerp
  // Every Google sign-in on this surface, for listing and Google Analytics.
  accounts: () => Promise<GoogleAccount[]>
  // What to do when Google rejects the sign-in.
  signIn: string
  // Where to add a Google account, Bing or a key on this surface.
  connect: string
  // Reads files for seo_lint, where the surface runs on the person's
  // machine (the local MCP).
  readFiles?: (paths: string[]) => Promise<LintSource[]>
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
    .describe(
      'YYYY-MM-DD. Optional; without end_date it runs to the latest final day.',
    ),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('YYYY-MM-DD. Optional.'),
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

// The issues section's list: what the person decided about issues.
const marks = {
  mark: z
    .enum(ISSUE_MARKS)
    .optional()
    .describe(
      'Optional, with site and issues: fixed, ignored, or open to undo. Only when the person says so.',
    ),
  issues: z
    .string()
    .min(1)
    .optional()
    .describe('With mark: issue ids from the issues section, comma-separated.'),
  note: z
    .string()
    .max(NOTE_MAX)
    .optional()
    .describe('Optional, with mark: why, in the person’s words.'),
  saved: z
    .string()
    .max(SAVED_MAX)
    .optional()
    .describe(
      'Optional, with section issues or mark, only where this server is not storing the list: the JSON the issues section returned last time, as the agent saved it.',
    ),
}

export const DATA_SOURCES = [
  'search_console',
  'google_analytics',
  'bing',
  'clicky',
] as const

export type SharedTool = {
  name: string
  command: CommandId
  title: string
  description: string
  input: z.ZodObject
  // A wider input for the local MCP only, for options that need this
  // machine (such as the URL Inspection quota count).
  localInput?: z.ZodObject
  run: (surface: ToolSurface, input: never) => Promise<CommandResult>
}

function tool<S extends z.ZodObject>(spec: {
  name: string
  command: CommandId
  title: string
  description: string
  input: S
  localInput?: z.ZodObject
  run: (surface: ToolSurface, input: z.output<S>) => Promise<CommandResult>
}): SharedTool {
  return spec as unknown as SharedTool
}

const listSites = async (surface: ToolSurface) =>
  runSites({
    accounts: await surface.accounts(),
    keys: await surface.keys(),
    clicky: clickySites(await surface.keys()).map(clickyLabel),
    signIn: surface.signIn,
    bing: surface.deps.bing ? await surface.deps.bing() : undefined,
    connect: surface.connect,
  })

const lintInput = {
  text: z
    .string()
    .max(LINT_MAX_CHARS)
    .optional()
    .describe(
      `The copy to check: a page, post, title or description, up to ${LINT_MAX_CHARS.toLocaleString('en-US')} characters. Markdown, MDX or HTML as written, so line numbers match.`,
    ),
  url: z
    .url()
    .optional()
    .describe(
      'Optional instead of text: a live page. Its main content is extracted as Markdown (as seo_page with detail full shows it) and checked with the blog preset. Only the CLI and the local MCP server read pages.',
    ),
  format: z
    .enum(LINT_FORMATS)
    .optional()
    .describe(
      'Optional. md (default for text), mdx, html, astro or text. Code, tags and URLs are skipped; captions and titles are checked.',
    ),
  preset: z
    .enum(LINT_PRESETS)
    .optional()
    .describe(
      'Optional. blog (default for Markdown), landing (default for HTML: stricter on buzzwords, weak links and claims with no number), docs, or meta (one title or description per line; start a line with "title:" or "description:" to say which).',
    ),
  meta_kind: z
    .enum(LINT_META_KINDS)
    .optional()
    .describe(
      'Optional, with the meta preset: title or description, what a line with no "title:" or "description:" label is. Default: a line up to 70 characters is a title, a longer one a description.',
    ),
  ignore_rules: z
    .array(z.string().min(1).max(60))
    .max(50)
    .optional()
    .describe('Optional rule ids or review lenses to skip.'),
  only: z
    .array(z.enum(LINT_CATEGORIES))
    .max(LINT_CATEGORIES.length)
    .optional()
    .describe(
      'Optional categories to check: ai (patterns common in AI-written text), copy (weak copy and house style, such as dashes) or seo (titles, descriptions, headings). Default: all.',
    ),
  ignore_phrases: z
    .array(z.string().min(1).max(200))
    .max(50)
    .optional()
    .describe(
      'Optional phrases to allow, such as a product name a rule keeps matching.',
    ),
  rules: z
    .boolean()
    .optional()
    .describe(
      'Optional. true lists every rule with its id, category, level and description instead of checking text; only limits the list, such as only ["ai"].',
    ),
}

export const SHARED_TOOLS: SharedTool[] = [
  tool({
    name: 'seo_sites',
    command: 'data',
    title: 'List sites',
    description:
      "Lists the Search Console and Google Analytics properties the connected Google accounts can read, the Bing Webmaster site for each, and which research keys are set. Call it first. With add: starts the weekly site audit of that site on the hosted server (a weekly crawl, daily Google index checks, a Monday email and webhook with what changed, and alerts when a page drops out of Google's index). A site that needs paying for returns a Stripe Checkout link: give it to the person to open, and the audit starts once they pay.",
    input: z.object({
      add: site
        .optional()
        .describe(
          'Optional. A site to add to the weekly site audit. Only when the person asks for it: a site can cost money.',
        ),
    }),
    run: async (surface, input) => {
      if (!input.add) return listSites(surface)
      const start = surface.deps.startAudit
      if (!start) {
        throw new CommandError(
          'INVALID_INPUT',
          'The weekly site audit runs on the hosted server only. Connect https://seoskill.dev/mcp and call seo_sites with add there.',
        )
      }
      const property = await surface.resolveSite(input.add)
      const result = await start(property)
      const texts: Record<StartAudit['status'], string> = {
        added: `Added ${property} to the weekly site audit. Its first crawl and index checks have started; ask ${surface.deps.call('report', { site: property, section: AUDIT_SECTION })} for the findings once the crawl is done.`,
        exists: `${property} is already in the weekly site audit.`,
        pending:
          'The payment went through and the plan is starting. Call seo_sites with add again in a minute.',
        checkout:
          result.status === 'checkout'
            ? `${property} needs a plan: $${result.price} a month per site, cancel at any time. Give the person this Stripe Checkout link to open and pay: ${result.url}\nThe audit of ${property} starts once they pay. Call seo_sites with add again afterwards to confirm.`
            : '',
        full:
          result.status === 'full'
            ? `This account already audits ${result.limit} sites, the most it can. Remove one on the account page first.`
            : '',
        payment_failed: `Stripe could not take the payment for another site, so ${property} was not added. The person can check their card under Manage billing on the account page.`,
      }
      return { text: texts[result.status], data: { property, ...result } }
    },
  }),
  tool({
    name: 'seo_report',
    command: 'report',
    title: 'Search Console report',
    description: `Start here. Without site: a short summary of every site in the person's weekly site audit for last week, with each site's Google index, weekly crawl and search clicks, sites with changes first, ending with the site to ask about next; an account without the audit gets its site list to pick from. With site: the main report for that Search Console property, the overview plus each section's row count and top rows. With site and section: that section's rows; page sections also check their top 20 URLs live. Sections:\n${Object.entries(
      SECTIONS,
    )
      .map(([id, text]) => `- ${id}: ${text}`)
      .join(
        '\n',
      )}\n- ${ISSUES_SECTION}: ${ISSUES_SECTION_TEXT}\n- ${UPDATES_SECTION}: ${UPDATES_SECTION_TEXT}\nWith site, mark and issues: records what the person decided about those issue ids (fixed, ignored, or open to undo) and runs no checks.`,
    input: z.object({
      site: site
        .optional()
        .describe(
          'Leave it out for the summary of every site in the weekly site audit. Otherwise a Search Console property or site, such as sc-domain:example.com, https://example.com/ or example.com.',
        ),
      section: z
        .enum([...SECTION_IDS, ISSUES_SECTION, UPDATES_SECTION])
        .optional()
        .describe(
          'Optional, needs site. Leave it out first; then ask for one section.',
        ),
      ...dates,
      ...detail,
      ...marks,
    }),
    run: async (surface, input) => {
      if (!input.site) {
        if (input.section) {
          throw new CommandError(
            'INVALID_INPUT',
            `section needs a site: ${surface.deps.call('report', { site: '<site>', section: input.section })}.`,
          )
        }
        if (input.mark || input.issues) {
          throw new CommandError(
            'INVALID_INPUT',
            `mark needs a site: ${surface.deps.call('report', { site: '<site>', mark: input.mark ?? 'fixed', issues: input.issues ?? '<id>' })}.`,
          )
        }
        return runAllSites(surface.deps, () => listSites(surface))
      }
      const target = input.site
      if (input.mark || input.issues) {
        return runReport(
          {
            site: await surface.resolveSite(target),
            section: input.section,
            mark: input.mark,
            issues: input.issues?.split(','),
            note: input.note,
            saved: input.saved,
          },
          surface.deps,
        )
      }
      // A site with no Search Console property can still have Bing, on a
      // surface that reads Bing.
      const resolved = await surface
        .resolveSite(target)
        .catch((error: unknown) =>
          error instanceof Error ? error : new Error(String(error)),
        )
      if (resolved instanceof Error && !input.section && surface.deps.bing) {
        return runBingReport(
          {
            site: target,
            startDate: input.start_date,
            endDate: input.end_date,
          },
          surface.deps,
        ).catch(() => {
          throw resolved
        })
      }
      // The bing section needs only Bing: without a Google property it shows
      // the Bing rows and says Google was not available.
      if (resolved instanceof Error && input.section !== 'bing') throw resolved
      return runReport(
        {
          site: resolved instanceof Error ? target : resolved,
          section: input.section,
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
          saved: input.saved,
        },
        surface.deps,
      )
    },
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
      'Compares equal periods before and after a date, such as a site change or a Google update: totals, devices, and the pages and queries that moved, Google Analytics sessions from the property whose web stream matches the site, Clicky visits from a saved Clicky site with the same domain, and Google updates in the window. Optional pages narrows it to URLs that contain that text, such as /blog/.',
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
        await surface.keys(),
      ),
  }),
  tool({
    name: 'seo_index',
    command: 'index',
    title: 'Google indexing reasons and pages that lost their clicks',
    description: `${INDEXING_RULE} Use it for a first baseline and then weekly: keep the full result and compare by URL and reason to find new reasons. Also: ${LOST_PAGES_RULE}`,
    input: z.object({ site, ...dates, ...detail }),
    localInput: z.object({
      site,
      ...dates,
      max_urls: z
        .number()
        .int()
        .min(1)
        .max(MAX_INSPECT_LIMIT)
        .optional()
        .describe(
          `URLs to inspect with Google, ${INSPECT_LIMIT} by default, up to the URL Inspection quota left today.`,
        ),
      ...detail,
    }),
    run: async (surface, input) =>
      runLostPages(
        {
          site: await surface.resolveSite(input.site),
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
          maxUrls: (input as { max_urls?: number }).max_urls,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_research',
    command: 'research',
    title: 'Keyword, competitor, backlink and AI answer data',
    description: `Data from the person’s own DataForSEO or Ahrefs account, which costs them credits. It uses the key the person saved on their seoskill.dev account (or on this machine for the CLI). Actions: ${RESEARCH_HELP}`,
    input: z.object({
      provider: z
        .string()
        .max(64)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional()
        .describe(
          `${RESEARCH_PROVIDERS.join(' or ')}. Optional: without it, the saved key; DataForSEO when both are saved. For serp in the CLI and the local MCP server it can also be the id of an installed provider package with live search results.`,
        ),
      action: z.enum(RESEARCH_ACTIONS),
      keywords: z.array(z.string().min(1)).max(100).default([]),
      target: z
        .string()
        .default('')
        .describe(
          'Domain (the whole site), a path ending in / for every URL under it, such as example.com/blog/, or one page.',
        ),
      scope: z
        .enum(RESEARCH_SCOPES)
        .optional()
        .describe(
          'Optional: domain, prefix or exact, to read the target another way than its shape says.',
        ),
      competitors: z
        .array(z.string().min(1))
        .max(5)
        .default([])
        .describe('link_gap only: 2 to 5 competitor domains.'),
      tasks: z
        .array(z.string().regex(AI_ANSWER_TASK_PATTERN))
        .max(30)
        .default([])
        .describe(
          'ai_answers only: the tasks an earlier run returned as not ready, to read back at no cost.',
        ),
      also: z
        .array(z.string().min(1))
        .max(AI_ANSWER_DOMAINS - 1)
        .default([])
        .describe(
          "ai_answers only: the brand's other domains, such as claude.ai beside claude.com. A citation to any of them counts as citing the target.",
        ),
      brand: z
        .array(z.string().min(1).max(60))
        .max(10)
        .default([])
        .describe(
          "ai_answers only: the brand names that count as a mention, such as Datadog for datadoghq.com. Default: each domain's name.",
        ),
      country: z
        .string()
        .regex(/^[a-z]{2}$/)
        .default('us')
        .describe('Two-letter country code.'),
      depth: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          `serp only: results per keyword, default ${SERP_DEPTH}. Deeper costs more.`,
        ),
      device: z
        .enum(RESEARCH_DEVICES)
        .optional()
        .describe(
          'serp only: desktop (default) or mobile. Google ranks pages differently on each. DataForSEO only.',
        ),
      ...detail,
    }),
    run: async (surface, input) => {
      const more = (offset: number) =>
        `seo_research with the same input, detail "rows", offset ${offset}`
      if (input.action === 'ai_answers') {
        if (input.provider && input.provider !== 'dataforseo') {
          throw new CommandError('INVALID_INPUT', 'ai_answers uses dataforseo.')
        }
        return runAiAnswers(
          {
            site:
              input.keywords.length || input.tasks.length
                ? input.target
                : await surface.resolveSite(input.target),
            country: input.country,
            detail: input.detail,
            offset: input.offset,
            questions: input.keywords,
            tasks: input.tasks,
            also: input.also,
            brand: input.brand,
          },
          await surface.keys(),
          surface.deps,
          (offset, tasks) =>
            `seo_research with the same provider, action, target, also and brand, tasks ${JSON.stringify(tasks)}, detail "rows", offset ${offset}. Passing the tasks reads these answers back at no cost; without them every question is asked and paid for again`,
        )
      }
      return runResearch(input, await surface.keys(), {
        drKey: surface.drKey,
        store: surface.researchStore,
        installedSerp: surface.installedSerp,
        call: more,
      })
    },
  }),
  tool({
    name: 'seo_data',
    command: 'data',
    title: 'Raw rows',
    description: `Raw rows for questions the report does not answer. search_console (default): rows for any dimensions, each with the previous period and the change; page and query narrow to rows whose URL or query contains that text; page_regex, query_regex and exclude_query_regex take RE2 regexes for custom cuts. google_analytics: landing pages for visits from search, with Google Analytics’ own metric names. bing: Bing Webmaster query or page rows (first dimension) for the same site, by week. clicky: landing-page visits, traffic sources and search engines from a Clicky site the person saved (site is its domain or Clicky site ID; at most 31 days).`,
    input: z.object({
      source: z.enum(DATA_SOURCES).default('search_console'),
      site: z
        .string()
        .min(1)
        .describe(
          'search_console and bing: the property or site. google_analytics: numeric property id from seo_sites. clicky: the site or its Clicky site ID.',
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
      page_regex: z
        .string()
        .min(1)
        .max(REGEX_MAX_CHARS)
        .optional()
        .describe('search_console only: RE2 the page URL must match.'),
      query_regex: z
        .string()
        .min(1)
        .max(REGEX_MAX_CHARS)
        .optional()
        .describe('search_console only: RE2 the query must match.'),
      exclude_query_regex: z
        .string()
        .min(1)
        .max(REGEX_MAX_CHARS)
        .optional()
        .describe(
          'search_console only: RE2 for queries to leave out, such as the brand.',
        ),
      ...dates,
      ...detail,
    }),
    run: async (surface, input) => {
      if (input.source === 'clicky') {
        return runClickyRows(
          {
            site: input.site,
            startDate: input.start_date,
            endDate: input.end_date,
            detail: input.detail,
            offset: input.offset,
          },
          await surface.keys(),
          {
            connect: surface.connect,
            call: (offset) =>
              `seo_data with source "clicky", site "${input.site}", detail "rows", offset ${offset}`,
            refresh: surface.refreshClicky,
          },
        )
      }
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
          filters: rowTextFilters({
            page: input.page,
            query: input.query,
            pageRegex: input.page_regex,
            queryRegex: input.query_regex,
            excludeQueryRegex: input.exclude_query_regex,
          }),
          startDate: input.start_date,
          endDate: input.end_date,
          detail: input.detail,
          offset: input.offset,
        },
        surface.deps,
      )
    },
  }),
  tool({
    name: 'seo_lint',
    command: 'lint',
    title: 'Check copy for AI writing patterns',
    description:
      'Checks landing page copy, blog posts, titles and meta descriptions for patterns common in AI-written text (such as "isn\'t X, it\'s Y" reframes, ", not X" contrasts, two-beat fragments, stock idioms and kicker lines), weak copy (dash punctuation, buzzwords, vague link text) and SEO rules (title 30 to 60 characters, description 70 to 160, one H1). Each error and warning has a line, the words, and a concrete fix. Each finding has a category (ai, copy or seo); only limits the check, such as only ["ai"] to leave out house style like dashes. Review items are judgement calls for you: read each quote and change it only when it fails the question. A url checks the main content of a live page (CLI and local MCP only). It reads no accounts.',
    input: z.object(lintInput),
    localInput: z.object({
      ...lintInput,
      paths: z
        .array(z.string().min(1))
        .max(20)
        .optional()
        .describe(
          'Optional instead of text: files, folders or globs on this machine (.md, .mdx, .html, .astro, .txt). The format comes from each file name.',
        ),
    }),
    run: async (surface, input) => {
      const pageMarkdown = surface.deps.pageMarkdown
      return runLint(
        {
          text: input.text,
          paths: (input as { paths?: string[] }).paths,
          url: input.url,
          format: input.format,
          preset: input.preset,
          ignoreRules: input.ignore_rules,
          ignorePhrases: input.ignore_phrases,
          only: input.only,
          metaKind: input.meta_kind,
          rules: input.rules,
        },
        surface.readFiles,
        pageMarkdown && ((url) => pageMarkdown(url, LINT_MAX_CHARS)),
      )
    },
  }),
]

// seo_index for an account in the weekly site audit beta: it answers at once
// from the site's stored URL Inspection results, with the same input. A site
// with no store is added to the audit, which starts its checks; when the
// account audits the most sites already, it runs the usual seo_index.
function indexFromStore(shared: SharedTool): SharedTool {
  // detail and offset page through the rows only where seo_index takes them.
  const paged = 'detail' in shared.input.shape
  return {
    ...shared,
    description: `${shared.description} For a site in the weekly site audit it answers at once from the URL Inspection results this server keeps for the site, checked in the background each day, and says how many URLs are covered, how many are queued and the time left.`,
    run: async (surface, parsed: never) => {
      const input = parsed as {
        site: string
        detail?: Detail
        offset?: number
      }
      const audit = surface.deps.audit
      if (!audit) return shared.run(surface, parsed)
      const site = await surface.resolveSite(input.site)
      const detail = input.detail ?? 'summary'
      const offset = detail === 'rows' ? (input.offset ?? 0) : 0
      const limit = detail === 'rows' ? CHECKS_PAGE_SIZE : CHECKS_SUMMARY_ROWS
      let checks = await audit.checks(site, offset, limit)
      if (!checks) {
        if ((await audit.add(site)) === 'full') {
          const result = await shared.run(surface, parsed)
          return {
            text: `${result.text}\n\n${site} is not in the weekly site audit, and this account already audits the most sites the beta allows, so this ran the usual way. Remove a site under Beta on the account page to keep its checks here.`,
            data: result.data,
          }
        }
        checks = await audit.checks(site, offset, limit)
        if (!checks) throw new Error(`The audit of ${site} did not start.`)
      }
      return runAuditChecks(
        { site, detail, offset, paged },
        checks,
        surface.deps.call,
      )
    },
  }
}

// The shared tools for an account in the weekly site audit beta: seo_report
// also takes the weekly-audit section, and seo_index answers from the
// site's stored checks. Only the hosted server uses them, so every other
// account and surface sees the tools unchanged.
export const AUDIT_TOOLS: SharedTool[] = SHARED_TOOLS.map((shared) =>
  shared.name === 'seo_index'
    ? indexFromStore(shared)
    : shared.name === 'seo_report'
      ? {
          ...shared,
          description: `${shared.description}\n- ${AUDIT_SECTION}: ${AUDIT_SECTION_TEXT}`,
          input: shared.input.extend({
            section: z
              .enum([
                ...SECTION_IDS,
                ISSUES_SECTION,
                UPDATES_SECTION,
                AUDIT_SECTION,
              ])
              .optional()
              .describe(
                'Optional. Leave it out first; then ask for one section.',
              ),
          }),
        }
      : shared,
)

// Parses the input with the tool's schema, so bad input fails the same way on
// every surface.
export async function runSharedTool(
  tool: SharedTool,
  surface: ToolSurface,
  input: unknown,
  // The local MCP reads the wider local input.
  local = false,
): Promise<CommandResult> {
  const parsed = ((local && tool.localInput) || tool.input).safeParse(
    input ?? {},
  )
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

// What an MCP client shows for the server: one identity for the hosted and
// local servers. The local server changes only its title and description.
// Icons are absolute so a client can fetch them from either server; sizes
// must be a list, per the 2025-11-25 spec.
export const MCP_SERVER_INFO = {
  name: 'seo',
  title: 'SEO Skill',
  description:
    'Search Console, Google Analytics and keyword data for your AI agent.',
  websiteUrl: 'https://seoskill.dev',
  icons: [
    {
      src: 'https://seoskill.dev/favicon-light.png',
      mimeType: 'image/png',
      sizes: ['512x512'],
      theme: 'light' as const,
    },
    {
      src: 'https://seoskill.dev/favicon-dark.png',
      mimeType: 'image/png',
      sizes: ['512x512'],
      theme: 'dark' as const,
    },
    {
      src: 'https://seoskill.dev/favicon.svg',
      mimeType: 'image/svg+xml',
      sizes: ['any'],
    },
  ],
}

export const MCP_INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics, Bing Webmaster Tools, Clicky and optional keyword accounts, and returns facts with their dates and limits. It gives no advice.
1. seo_sites: the properties the connected accounts can read.
2. seo_report: start here. Without site it summarises last week across every site in the weekly site audit and names the site to ask about next. With site it shows that property's overview and every section's count and top rows; then ask for the one section you need. Section issues keeps a list of what it found for the site between sessions; mark records which the person fixed or wants ignored.
3. seo_page for one URL, seo_compare for before and after a date, seo_index for Google's indexing reasons and pages that lost their clicks, seo_research for keyword, competitor and backlink data, and whether AI answers cite the site, from the DataForSEO or Ahrefs key the person saved, seo_data for raw rows, including Google Analytics, Bing and Clicky.
4. seo_lint checks copy you are writing or editing (a landing page, blog post, title or meta description) for patterns common in AI-written text and for title and description length. It reads only the text or files you give it.`

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
    'How to use these tools: what each command returns and how to reach it.',
  mimeType: 'text/markdown',
} as const
