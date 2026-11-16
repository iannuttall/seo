import {
  CONTEXT_DAYS,
  contextGuide,
  contextIsStale,
  contextReviewOn,
  contextText,
  type MoneyPath,
  moneyPaths,
  onMoneyPage,
  type SiteContext,
} from './context.js'
import {
  ISSUES_SECTION,
  type IssuesFile,
  issuesSaveText,
  parseSaved,
  type StoredIssue,
} from './issues.js'
import { runReport } from './report.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandResult,
} from './types.js'

// seo next: where a site is in the SEO loop and the one step that is due.
// The loop is know the business, unblock pages, improve the pages that
// rank, then find new pages; each step is due only when the one before has
// nothing left. It reads the business context and the issues list, runs the
// issues checks when the list is more than a day old, and returns the due
// step's instructions and its first jobs, money pages first.

export const NEXT_STEPS = [
  'context',
  'unblock',
  'improve',
  'new-pages',
] as const
export type NextStep = (typeof NEXT_STEPS)[number]

export const NEXT_TEXT =
  'Where the site is in the SEO loop and the one step that is due, with its instructions, its first jobs (money pages first) and the call that marks each done. The steps: write the business context (when there is none, or it is more than 90 days old), unblock pages (crawl and Google index problems), improve the pages that rank (quick wins, low click-through rates, striking distance), then find new pages for buying searches. It runs the issues checks when the list is more than a day old.'

// Jobs shown for the due step.
const JOBS_SHOWN = 5
// The issues list is checked again when its last check is older than this.
const FRESH_MS = 86_400_000

const SEARCH_KINDS = ['low-ctr', 'quick-wins', 'striking-distance']

export type NextInput = {
  site: string
  // The business context to save first, as Markdown.
  context?: string
  // The issues list the agent saved, where the server keeps none.
  saved?: string
}

type Job = {
  id: string
  kind: string
  subject: string
  evidence: string
  money_page: boolean
}

export async function runNext(
  input: NextInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const { site, saved } = input
  const call = deps.call
  const now = (deps.now ?? (() => new Date()))()
  let savedNote: string | null = null
  if (input.context !== undefined) {
    if (!deps.context) {
      throw new CommandError(
        'INVALID_INPUT',
        'This surface does not keep a business context. Nothing was saved.',
      )
    }
    const context = {
      text: contextText(input.context),
      updated_at: now.toISOString(),
    }
    await deps.context.write(site, context)
    savedNote = `Saved the business context for ${site}. It is checked again after ${contextReviewOn(context)}.`
  }
  const context = deps.context ? await deps.context.read(site) : null
  if (!context || contextIsStale(context, now)) {
    return contextStep(site, context, call)
  }

  const list = await issuesList(site, saved, deps, now)
  const money = moneyPaths(context.text)
  const open = list.issues.filter((issue) => issue.mark === 'open')
  const active = open.filter((issue) => issue.seen !== 'not-found')
  const gone = open.filter((issue) => issue.seen === 'not-found')
  const unblock = jobs(
    active.filter((issue) => !SEARCH_KINDS.includes(issue.kind)),
    money,
    (kind) => (kind === 'index-drop' ? 0 : 1),
  )
  const improve = jobs(
    active.filter((issue) => SEARCH_KINDS.includes(issue.kind)),
    money,
    (kind) => SEARCH_KINDS.indexOf(kind),
  )
  const step: NextStep = unblock.length
    ? 'unblock'
    : improve.length
      ? 'improve'
      : 'new-pages'
  const shown = (step === 'unblock' ? unblock : improve).slice(0, JOBS_SHOWN)
  const fixed = list.issues.filter((issue) => issue.mark === 'fixed')
  const measured = fixed.filter((issue) => issue.measures?.length)
  const checked = lastCheck(list.issues)
  const due = (id: NextStep) => (id === step ? ' (due now)' : '')

  const loop = [
    `- Business context: saved ${context.updated_at.slice(0, 10)}, checked again after ${contextReviewOn(context)}.`,
    `- Issues list: ${list.ranChecks ? 'checked just now' : `last checked ${checked?.slice(0, 10) ?? 'never'}`}, ${open.length} open, ${fixed.length} fixed.`,
    `- Unblock pages: ${unblock.length} open${due('unblock')}.`,
    `- Improve the pages that rank: ${improve.length} open${due('improve')}.`,
    `- New pages: ${step === 'new-pages' ? 'due now' : 'after the steps above'}.`,
    `- Results: ${measured.length} fixed ${measured.length === 1 ? 'issue' : 'issues'} measured, ${fixed.length - measured.length} waiting for 28 days of Search Console data${measured.length ? `; ${call('report', { site, section: ISSUES_SECTION })} shows them` : ''}.`,
  ]

  return {
    text: [
      savedNote,
      `Next for ${site}: ${STEP_TITLES[step]}.`,
      `The loop:\n${loop.join('\n')}`,
      `## ${heading(step)}\n${stepGuide(step, site, call)}`,
      shown.length
        ? `Jobs ${shown.length} of ${step === 'unblock' ? unblock.length : improve.length}, money pages first:\n${jobsTable(shown)}`
        : null,
      shown.length
        ? `When a job is done and live: ${call('report', { site, mark: 'fixed', issues: '<id>,<id>' })}. Mark a job that does not fit the business "ignored" with a note. Then ${call('next', { site })}.`
        : null,
      gone.length
        ? `${gone.length} open ${gone.length === 1 ? 'issue was' : 'issues were'} not found by the last check (${gone
            .slice(0, 10)
            .map((issue) => issue.id)
            .join(
              ', ',
            )}${gone.length > 10 ? ' and more' : ''}): if the person fixed them, mark them fixed so their results are measured.`
        : null,
      money.length
        ? null
        : 'The business context lists no money pages, so jobs are in the list order. Add them under "## Money pages" and save the context again.',
      `## Business context (saved ${context.updated_at.slice(0, 10)})\n${context.text}`,
      list.stored
        ? null
        : `${issuesSaveText(site, list.issues, call)}\nPass the same file as saved to ${call('next', { site })} too.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      site,
      step,
      context: {
        updated_at: context.updated_at,
        review_on: contextReviewOn(context),
      },
      issues: {
        stored: list.stored,
        checked_at: list.ranChecks ? now.toISOString() : checked,
        open: open.length,
        fixed: fixed.length,
        measured: measured.length,
      },
      counts: { unblock: unblock.length, improve: improve.length },
      jobs: shown,
      ...(list.stored
        ? {}
        : { save: { version: 1, sites: { [site]: list.issues } } }),
    },
  }
}

const STEP_TITLES: Record<NextStep, string> = {
  context: 'write the business context',
  unblock: 'unblock pages',
  improve: 'improve the pages that rank',
  'new-pages': 'find new pages for buying searches',
}

const heading = (step: NextStep) =>
  STEP_TITLES[step].charAt(0).toUpperCase() + STEP_TITLES[step].slice(1)

function contextStep(
  site: string,
  context: SiteContext | null,
  call: Caller,
): CommandResult {
  const why = context
    ? `The business context was saved ${context.updated_at.slice(0, 10)}, more than ${CONTEXT_DAYS} days ago, so check it again: read it below, look for what changed on the site, its prices and its competitors, and save it again with the changes.`
    : `There is no business context for ${site} yet.`
  return {
    text: [
      `Next for ${site}: ${STEP_TITLES.context}.`,
      why,
      `## ${heading('context')}\n${contextGuide(site, call)}`,
      context
        ? `## Business context (saved ${context.updated_at.slice(0, 10)})\n${context.text}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      site,
      step: 'context' satisfies NextStep,
      context: context
        ? {
            updated_at: context.updated_at,
            review_on: contextReviewOn(context),
          }
        : null,
    },
  }
}

function stepGuide(step: NextStep, site: string, call: Caller): string {
  switch (step) {
    case 'unblock':
      return `These stop Google from crawling, reading or indexing pages. For each job, find the cause in the site's code or CMS, make the smallest change that fixes it, and open a pull request for the person to review (or push where they have said that is fine). Ask the person before you delete, redirect or noindex a page. Once the change is live, check the page with ${call('page', { url: '<url>' })}.`
    case 'improve':
      return `These pages already rank for a search but get fewer clicks than they could. For each job, first judge from the business context whether the search fits what the business sells and how close the searcher is to buying; mark a search that does not fit "ignored" with a note. For the rest, rewrite the title and description for that searcher and make the page answer what they came for, with what only this business knows. Open a pull request for each page, and check the new copy with ${call('lint', {})}.`
    case 'new-pages':
      return `Nothing open is blocking or holding back the pages that rank, so look for buying searches the site has no page for. Run ${call('research', { action: 'ranked_keywords', target: '<competitor>' })} for the competitors in the business context, and keep searches that fit the product and show someone comparing options or ready to buy: comparisons, alternatives, use cases, industries and integrations. Check each with ${call('research', { action: 'serp', keywords: '<keyword>' })} and ${call('report', { site, section: 'striking-distance' })} so you do not duplicate a page the site already has. Show the person at most 3, each with the search, its volume and the page you would build, and build only the ones they approve, as landing pages rather than blog posts. Run ${call('next', { site })} again in a week.`
    default:
      return contextGuide(site, call)
  }
}

// Open issues as jobs: money pages first, then by kind, then list order.
function jobs(
  issues: StoredIssue[],
  money: MoneyPath[],
  kindOrder: (kind: string) => number,
): Job[] {
  return issues
    .map((issue, index) => ({
      index,
      job: {
        id: issue.id,
        kind: issue.kind,
        subject: issue.subject,
        evidence: issue.evidence,
        money_page: onMoneyPage(issue.subject, money),
      },
    }))
    .sort(
      (a, b) =>
        Number(b.job.money_page) - Number(a.job.money_page) ||
        kindOrder(a.job.kind) - kindOrder(b.job.kind) ||
        a.index - b.index,
    )
    .map(({ job }) => job)
}

function jobsTable(shown: Job[]): string {
  const cell = (text: string) =>
    text.replaceAll('|', '\\|').replaceAll('\n', ' ')
  return [
    '| id | kind | subject | evidence | money page |',
    '| --- | --- | --- | --- | --- |',
    ...shown.map(
      (job) =>
        `| ${job.id} | ${job.kind} | ${cell(job.subject)} | ${cell(job.evidence)} | ${job.money_page ? 'yes' : ''} |`,
    ),
  ].join('\n')
}

function lastCheck(issues: StoredIssue[]): string | null {
  let last: string | null = null
  for (const issue of issues) {
    if (issue.checked_at && (!last || issue.checked_at > last)) {
      last = issue.checked_at
    }
  }
  return last
}

// The site's issues list: kept by the surface, or saved by the agent. The
// checks run again when the list is empty or more than a day old; an empty
// list carries no date, so a site with nothing found is checked each time.
async function issuesList(
  site: string,
  saved: string | undefined,
  deps: CommandDeps,
  now: Date,
): Promise<{ issues: StoredIssue[]; stored: boolean; ranChecks: boolean }> {
  const kept = deps.issues ? await deps.issues.read(site) : null
  const stored = kept !== null
  const issues = kept ?? (saved ? parseSaved(saved, site) : [])
  const last = lastCheck(issues)
  if (last && now.getTime() - Date.parse(last) < FRESH_MS) {
    return { issues, stored, ranChecks: false }
  }
  const result = await runReport(
    { site, section: ISSUES_SECTION, detail: 'full', saved },
    deps,
  )
  const file = result.data as IssuesFile
  return { issues: file.sites[site] ?? [], stored, ranChecks: true }
}
