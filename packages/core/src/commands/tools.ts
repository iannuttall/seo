import { z } from 'zod'
import { LINT_MAX_CHARS } from '../lint/types.js'
import { ACCOUNT_INPUTS, runAccount } from './account.js'
import {
  AI_ANSWER_DOMAINS,
  AI_ANSWER_ENGINES,
  AI_ANSWER_QUESTIONS,
  AI_ANSWER_SAMPLES,
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
import { CONTEXT_MAX, savedCompetitors } from './context.js'
import { FEEDBACK_TOOL } from './feedback.js'
import { INSPECT_LIMIT, MAX_INSPECT_LIMIT } from './indexing.js'
import { ISSUE_MARKS, NOTE_MAX, SAVED_MAX } from './issues.js'
import { type LintSource, lintInput, runLint } from './lint.js'
import { NEXT_TEXT, runNext } from './next.js'
import type { Detail } from './present.js'
import { researchProgress } from './progress-track.js'
import {
  REPORT_SECTION_TEXTS,
  REPORT_SECTIONS,
  runBingReport,
  runReport,
} from './report.js'
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
import { LINK_INPUTS } from './research-link-targets.js'
import { DIMENSIONS, rowsInput, rowTextFilters, runRows } from './rows.js'
import {
  runSimpleAnalyticsRows,
  simpleAnalyticsKey,
} from './simple-analytics.js'
import {
  INDEXING_RULE,
  LOST_PAGES_RULE,
  runCompare,
  runLostPages,
  runPage,
} from './site.js'
import { type GoogleAccount, runSites } from './sites.js'
import { runSubmit, SUBMIT_ACTIONS, SUBMIT_HELP } from './submit.js'
import { TEARDOWN_SECTION, teardownBrief } from './teardown.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandId,
  type CommandResult,
  type StartAudit,
} from './types.js'
import { onIncludedUsage } from './usage.js'
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
      'Optional, with site and issues: started when a pull request with the change waits for review (note: its URL), fixed once the change is live, ignored only when the person says so, or open to undo.',
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
    .describe(
      'Optional, with mark: why, in the person’s words, or the pull request URL for started.',
    ),
  fixed_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'Optional, with mark fixed: the day the change went live, YYYY-MM-DD, such as the day its pull request merged, when that was before today. Results are measured from it.',
    ),
  saved: z
    .string()
    .max(SAVED_MAX)
    .optional()
    .describe(
      "Optional, with section issues or mark: a list saved in the person's project before, such as .seo/issues.json, to carry over its marks once. This server keeps the list from then on.",
    ),
}

export const DATA_SOURCES = [
  'search_console',
  'google_analytics',
  'bing',
  'clicky',
  'simple_analytics',
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
  // The tool changes something outside this server, such as sending URLs
  // that spend the person's credits. Every other tool only reads.
  writes?: true
  run: (surface: ToolSurface, input: never) => Promise<CommandResult>
}

// MCP annotations for a shared tool: read-only, or a write that is not
// destructive and not safe to repeat blindly.
export function toolAnnotations(tool: Pick<SharedTool, 'writes'>) {
  return tool.writes
    ? {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      }
    : { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
}

function tool<S extends z.ZodObject>(spec: {
  name: string
  command: CommandId
  title: string
  description: string
  input: S
  localInput?: z.ZodObject
  writes?: true
  run: (surface: ToolSurface, input: z.output<S>) => Promise<CommandResult>
}): SharedTool {
  return spec as unknown as SharedTool
}

const listSites = async (surface: ToolSurface) =>
  runSites({
    accounts: await surface.accounts(),
    keys: await surface.keys(),
    clicky: clickySites(await surface.keys()).map(clickyLabel),
    simpleAnalytics: Boolean(simpleAnalyticsKey(await surface.keys())),
    signIn: surface.signIn,
    bing: surface.deps.bing ? await surface.deps.bing() : undefined,
    connect: surface.connect,
    // The account's paid usage, where the surface has an account.
    usage: surface.deps.usage
      ? await surface.deps.usage().catch(() => null)
      : undefined,
  })

export const SHARED_TOOLS: SharedTool[] = [
  tool({
    name: 'seo_sites',
    command: 'data',
    title: 'List sites',
    description:
      "Lists the Search Console and Google Analytics properties the connected Google accounts can read, the Bing Webmaster site for each, and which research keys are set. Call it first. With add: starts the weekly site audit of that site on the hosted server (a weekly crawl, daily Google index checks, a Monday email and webhook with what changed, and alerts when a page drops out of Google's index). A site that needs paying for returns a link to give the person: a Stripe Checkout link, after which the audit starts once they pay, or their account page to pick a plan, after which you add the site again. With plan: moves the account to that usage plan. With a plan already and a saved card it's charged at once, with no link (a lower plan starts at the next reset); the first plan returns a Stripe Checkout link to give the person. With top_up, auto_reload or cancel: does what the account page's Plan tab does, on the saved card, so the person never needs the page.",
    input: z.object({
      add: site
        .optional()
        .describe(
          'Optional. A site to add to the weekly site audit. Only when the person asks for it: a site can cost money.',
        ),
      ...ACCOUNT_INPUTS,
    }),
    run: async (surface, input) => {
      const chosen = await runAccount(surface.deps, input)
      if (typeof chosen !== 'string') return chosen
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
        plan:
          result.status === 'plan'
            ? `${property} needs a plan. Plans start at $${result.price} a month for the whole account, with unlimited sites and research usage included. Ask the person whether to start on the $${result.price} plan. If they say yes, call seo_sites with plan ${result.price} and add ${property}, and give them the Stripe link it returns. They can also pick a plan at ${result.url}.`
            : '',
        full:
          result.status === 'full'
            ? `This account already audits ${result.limit} sites, the most it can. Remove one on the account page first.`
            : '',
        payment_failed: `Stripe could not take the payment for another site, so ${property} was not added. The person can check their card under Manage billing on the account page.`,
      }
      const text = `${chosen}${texts[result.status]}`
      return { text, data: { property, ...result } }
    },
  }),
  tool({
    name: 'seo_next',
    command: 'next',
    title: 'What to do next',
    description: `Start here when the person asks you to work on a site's SEO, to use SEO Skill, or what to do next. ${NEXT_TEXT} Do the step, then call it again. With context: saves the business context the first step asks for, replacing the old one, then returns the next step.`,
    input: z.object({
      site,
      context: z
        .string()
        .max(CONTEXT_MAX)
        .optional()
        .describe(
          'Optional. The business context to save, as Markdown under the headings the context step gives. Only after the person has seen it.',
        ),
      saved: marks.saved.describe(
        "Optional: an issues list saved in the person's project before, such as .seo/issues.json, to carry over its marks once. This server keeps the list from then on.",
      ),
      autopilot: z
        .boolean()
        .optional()
        .describe(
          'Optional. true returns the steps to put the site on autopilot, a scheduled run of the agent, with the prompt each run starts with, instead of the due step. Only after the person has said yes.',
        ),
    }),
    run: async (surface, input) =>
      runNext(
        {
          site: await surface.resolveSite(input.site),
          context: input.context,
          saved: input.saved,
          autopilot: input.autopilot,
          researchKey: await surface
            .keys()
            .then(
              (keys) =>
                !onIncludedUsage(keys) &&
                (keys.has('x-dataforseo-login') || keys.has('x-ahrefs-key')),
            ),
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_report',
    command: 'report',
    title: 'Search Console report',
    description: `Start here for questions about a site's search traffic. Without site: a short summary of every site in the person's weekly site audit for last week, with each site's Google index, weekly crawl and search clicks, sites with changes first, ending with the site to ask about next; an account without the audit gets its site list to pick from. With site: the main report for that Search Console property, the overview plus each section's row count and top rows. With site and section: that section's rows; page sections also check their top 20 URLs live. Sections:\n${Object.entries(
      REPORT_SECTION_TEXTS,
    )
      .map(([id, text]) => `- ${id}: ${text}`)
      .join(
        '\n',
      )}\nWith site, mark and issues: records what happened to those issue ids (started, fixed, ignored, or open to undo) and runs no checks.`,
    input: z.object({
      site: site
        .optional()
        .describe(
          'Leave it out for the summary of every site in the weekly site audit. Otherwise a Search Console property or site, such as sc-domain:example.com, https://example.com/ or example.com.',
        ),
      section: z
        .enum(REPORT_SECTIONS)
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
            fixedOn: input.fixed_on,
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
      // A teardown works for any domain: without a property, the brief.
      if (resolved instanceof Error && input.section === TEARDOWN_SECTION) {
        return teardownBrief(target, resolved.message, surface.deps.call)
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
      'Compares equal periods before and after a date, such as a site change or a Google update: totals, devices, and the pages and queries that moved, Google Analytics sessions from the property whose web stream matches the site, Clicky visits from a saved Clicky site with the same domain, Simple Analytics visitors when an API key is saved and it has the site, brand against not brand by the saved brand names and by Google’s own classification, each market group saved in the business context, and Google updates in the window. Optional pages narrows it to URLs that contain that text, such as /blog/.',
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
    name: 'seo_submit',
    command: 'submit',
    title: 'Ask search engines to crawl pages',
    writes: true,
    description: `Sends page URLs to search engines. IndexNow is free and reaches Bing, Yandex, Seznam, Naver and Yep, not Google; it needs a key file on the site, which indexnow_key sets up and checks. Index My Site (indexmysite.app) is paid from the person's own credits: it sends URLs to Google, checks each, and gives a credit back for each page Google has not indexed by its final check. It never sends without confirm true, and only after the person saw the cost. Submitting asks for a crawl; it does not make a search engine index a page. Fix redirects, noindex, errors and canonicals first. Actions: ${SUBMIT_HELP}`,
    input: z.object({
      action: z.enum(SUBMIT_ACTIONS),
      site: z
        .string()
        .min(1)
        .max(300)
        .optional()
        .describe(
          'indexnow_key: the host or a URL on it, such as example.com.',
        ),
      urls: z
        .array(z.string().min(1).max(2048))
        .max(2000)
        .optional()
        .describe(
          'indexnow and indexmysite: full page URLs. indexnow takes one host per call.',
        ),
      key: z
        .string()
        .max(128)
        .optional()
        .describe(
          'indexnow_key and indexnow, optional: an IndexNow key the site already serves at /<key>.txt.',
        ),
      fast: z
        .boolean()
        .optional()
        .describe(
          'indexmysite, optional: faster Google indexing, 1 more credit per URL, not returned. Only when the person asks.',
        ),
      bing: z
        .boolean()
        .optional()
        .describe(
          'indexmysite, optional: also send each URL to Bing, 1 more credit per URL, not returned. Only when the person asks.',
        ),
      name: z
        .string()
        .max(120)
        .optional()
        .describe('indexmysite, optional: a label for the job.'),
      job_id: z
        .string()
        .min(1)
        .max(100)
        .optional()
        .describe('indexmysite_status and indexmysite_approve: the job id.'),
      url_ids: z
        .array(z.string().min(1).max(100))
        .max(2000)
        .optional()
        .describe(
          'indexmysite_approve: the url_id of each URL the person chose.',
        ),
      all: z
        .boolean()
        .optional()
        .describe(
          'indexmysite_approve: every URL waiting for approval, only when the person chose all of them.',
        ),
      confirm: z
        .boolean()
        .optional()
        .describe(
          'indexmysite and indexmysite_approve: true sends and spends credits. Without it the call returns the cost and sends nothing.',
        ),
    }),
    run: (surface, input) =>
      runSubmit(
        {
          action: input.action,
          site: input.site,
          urls: input.urls,
          key: input.key,
          fast: input.fast,
          bing: input.bing,
          name: input.name,
          jobId: input.job_id,
          urlIds: input.url_ids,
          all: input.all,
          confirm: input.confirm,
        },
        surface.deps,
      ),
  }),
  tool({
    name: 'seo_research',
    command: 'research',
    title: 'Keyword, competitor, backlink and AI answer data',
    description: `Data from the person’s own DataForSEO or Ahrefs account, which costs them credits. It uses the key the person saved on their seoskill.dev account (or on this machine for the CLI). serp or ai_answers with a site as target and no keywords checks the tracked searches or AI questions in the site's business context and keeps the result in its progress. Actions: ${RESEARCH_HELP}`,
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
      ...LINK_INPUTS,
      tasks: z
        .array(z.string().regex(AI_ANSWER_TASK_PATTERN))
        .max(AI_ANSWER_QUESTIONS * AI_ANSWER_ENGINES * AI_ANSWER_SAMPLES)
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
          "ai_answers and mentions: the brand names that count as a mention, such as Datadog for datadoghq.com. Default: each domain's name for ai_answers; mentions searches the domain itself plus up to 3 names.",
        ),
      samples: z
        .number()
        .int()
        .min(1)
        .max(AI_ANSWER_SAMPLES)
        .optional()
        .describe(
          'ai_answers only: how many times to ask each question, to report how often answers cite or name the site. Each sample costs a full run.',
        ),
      refresh: z
        .boolean()
        .default(false)
        .describe(
          'ai_answers only: ask again and pay, instead of reading back the run of the same questions from earlier today.',
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
      const tracked = await researchProgress(input, surface)
      if (tracked) return tracked
      if (input.action === 'ai_answers' && !input.competitors.length) {
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
            store: surface.researchStore,
            refresh: input.refresh,
            samples: input.samples,
            resolveSite: surface.resolveSite,
          },
          await surface.keys(),
          surface.deps,
          (offset, tasks) =>
            `seo_research with the same provider, action, target, also and brand, tasks ${JSON.stringify(tasks)}, detail "rows", offset ${offset}. Passing the tasks reads these answers back at no cost; without them every question is asked and paid for again`,
        )
      }
      // keyword_metrics with a site and no keywords: zero-volume keywords.
      const zeroVolume =
        input.action === 'keyword_metrics' &&
        !input.keywords.length &&
        input.target
      return runResearch(
        zeroVolume
          ? { ...input, target: await surface.resolveSite(input.target) }
          : input,
        await surface.keys(),
        {
          searchAnalytics: zeroVolume
            ? surface.deps.searchAnalytics
            : undefined,
          drKey: surface.drKey,
          saved: await savedCompetitors(input, surface),
          store: surface.researchStore,
          installedSerp: surface.installedSerp,
          call: more,
        },
      )
    },
  }),
  tool({
    name: 'seo_data',
    command: 'data',
    title: 'Raw rows',
    description: `Raw rows for questions the report does not answer. search_console (default): rows for any dimensions, each with the previous period and the change, from web search or with search_type from image, video, news, Discover, Google News or multimodal (Google Lens and Circle to Search); brand narrows to Google’s own branded or non_branded searches, and the brandedClassification dimension splits by it; country and device take lists; page and query narrow to rows whose URL or query contains that text; page_regex, query_regex and exclude_query_regex take RE2 regexes for custom cuts; sort orders rows by impressions, ctr, position or a gain or loss instead of clicks, and min_impressions drops rows seen too rarely to judge. google_analytics: landing pages for visits from search, with Google Analytics’ own metric names. bing: Bing Webmaster query or page rows (first dimension) for the same site, by week. clicky: landing-page visits, traffic sources and search engines from a Clicky site the person saved (site is its domain or Clicky site ID; at most 31 days). simple_analytics: landing-page visitors, referrers, utm_source tags and AI tools from Simple Analytics with the API key the person saved (site is its domain).`,
    input: z.object({
      source: z.enum(DATA_SOURCES).default('search_console'),
      site: z
        .string()
        .min(1)
        .describe(
          'search_console and bing: the property or site. google_analytics: numeric property id from seo_sites. clicky: the site or its Clicky site ID. simple_analytics: the site domain.',
        ),
      dimensions: z
        .array(z.enum(DIMENSIONS))
        .max(4)
        .optional()
        .describe(
          'search_console, default query (page for discover and google_news); bing uses the first, query or page.',
        ),
      ...rowsInput,
      ...dates,
      ...detail,
    }),
    run: async (surface, input) => {
      if (input.source === 'simple_analytics') {
        return runSimpleAnalyticsRows(
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
              `seo_data with source "simple_analytics", site "${input.site}", detail "rows", offset ${offset}`,
          },
        )
      }
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
            dimension: input.dimensions?.[0] === 'page' ? 'page' : 'query',
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
          searchType: input.search_type,
          brand: input.brand,
          countries: input.country,
          devices: input.device,
          sort: input.sort,
          minImpressions: input.min_impressions,
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
  FEEDBACK_TOOL,
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
              .enum([...REPORT_SECTIONS, AUDIT_SECTION])
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

export const MCP_INSTRUCTIONS = `SEO Skill reads the person's own Search Console, Google Analytics, Bing Webmaster Tools, Clicky, Simple Analytics and optional keyword accounts, and returns facts with their dates and limits. It gives no advice.
1. seo_sites: the properties the connected accounts can read.
2. seo_report: start here. Without site it summarises last week across every site in the weekly site audit and names the site to ask about next. With site it shows that property's overview and every section's count and top rows; then ask for the one section you need. Section issues keeps a list of what it found for the site between sessions; mark records which the person fixed or wants ignored.
3. seo_page for one URL, seo_compare for before and after a date, seo_index for Google's indexing reasons and pages that lost their clicks, seo_research for keyword, competitor and backlink data, and whether AI answers cite the site, from the DataForSEO or Ahrefs key the person saved, seo_data for raw rows, including Google Analytics, Bing, Clicky and Simple Analytics.
4. seo_submit asks search engines to crawl pages: IndexNow for free (not Google), or Index My Site for Google from the person's own paid credits. It never spends credits without confirm true; show the person the cost first.
5. seo_lint checks copy you are writing or editing (a landing page, blog post, title or meta description) for patterns common in AI-written text and for title and description length. It reads only the text or files you give it.`

// How an MCP surface writes "run this next": the tool name and its inputs.
export const mcpCall: Caller = (command, args) => {
  const name = `seo_${command.replace('-', '_')}`
  if (command === 'submit') return submitMcpCall(args ?? {})
  const shown = Object.entries(args ?? {}).filter(
    ([, value]) => value !== undefined,
  )
  return shown.length
    ? `${name} with ${shown.map(([key, value]) => `${key} ${typeof value === 'string' ? `"${value}"` : value}`).join(', ')}`
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

// seo_submit with its list and true/false inputs written as such.
function submitMcpCall(args: Parameters<Caller>[1] & object) {
  const parts = Object.entries(args)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      value === 'true'
        ? `${key} true`
        : key === 'urls'
          ? `urls ${JSON.stringify(String(value).split(' '))}`
          : `${key} "${value}"`,
    )
  const needsUrls =
    (args.action === 'indexnow' || args.action === 'indexmysite') &&
    args.urls === undefined
  if (needsUrls) parts.push('the URLs in urls')
  return parts.length ? `seo_submit with ${parts.join(', ')}` : 'seo_submit'
}
