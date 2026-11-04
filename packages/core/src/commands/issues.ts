import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import {
  GSC_TIME_ZONE,
  latestFinalGscDate,
  shiftIsoDate,
} from '../gsc/dates.js'
import type { AuditSnapshot } from './audit.js'
import type { Detail } from './present.js'
import {
  type DateInput,
  dateWindow,
  googleUpdates,
  originOf,
  realIsoDate,
} from './shared.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandResult,
  type DateRange,
} from './types.js'

// The issues section of the report: a list of what SEO Skill found for a
// site, kept between sessions, with what the person decided about each one
// (fixed or ignored) and what the latest check saw. The surface keeps the
// list (a file on this machine, or the hosted account); this file finds the
// issues, merges them and writes the text, so every surface does the same.

export const ISSUES_SECTION = 'issues'

export const ISSUES_SECTION_TEXT =
  'A list kept for the site between sessions: issues the striking-distance, low-ctr and quick-wins checks found (and the weekly crawl and Google index checks for an audited site), each with its id, the latest check and what the person marked it (open, fixed or ignored). A fixed page, or query on a page, gets its Search Console clicks and impressions for the 28 and 56 days from the day it was marked fixed against the same days before, once final data covers them. Asking for it runs those checks again. To mark issues, add mark and issues instead of section. The hosted server keeps the list only for sites in the weekly site audit; for any other site it returns the list as JSON for the agent to save and pass back as saved.'

export const ISSUE_MARKS = ['open', 'fixed', 'ignored'] as const
export type IssueMark = (typeof ISSUE_MARKS)[number]

// What the latest check saw: the issue, no issue when the check covered all
// it could, or nothing either way (the check failed, was partial or capped,
// or did not run).
export type IssueSeen = 'found' | 'not-found' | 'not-checked'

export type StoredIssue = {
  id: string
  // The check that found it: a report section, weekly-audit:<rule>, or
  // index-drop.
  kind: string
  // "query" on url, a URL, or a title for duplicate titles.
  subject: string
  // The latest evidence in a few words.
  evidence: string
  mark: IssueMark
  marked_at: string | null
  note: string | null
  first_found: string
  last_found: string | null
  seen: IssueSeen
  checked_at: string | null
  // Search Console before and after the day the issue was marked fixed,
  // once final data covers the days after. Only for a fixed issue whose
  // subject is a page, or a query on a page.
  measures?: IssueMeasure[]
}

export const MEASURE_DAYS = [28, 56] as const
export type MeasureDays = (typeof MEASURE_DAYS)[number]

export type MeasurePeriod = {
  start: string
  end: string
  clicks: number
  impressions: number
  // Weighted by impressions; null with no impressions.
  position: number | null
}

export type IssueMeasure = {
  days: MeasureDays
  // The Search Console day (America/Los_Angeles) the issue was marked
  // fixed: the first day of after.
  fixed_on: string
  scope: 'page' | 'query on page'
  before: MeasurePeriod
  after: MeasurePeriod
  // Google ranking updates whose dates overlap before or after, by name
  // (timing only), or null when Google's status feed could not be read.
  updates: string[] | null
  measured_at: string
}

// Where a surface keeps each site's list. read returns null when this
// surface keeps no list for the site; the agent then saves the list itself.
export type IssueStore = {
  read: (site: string) => Promise<StoredIssue[] | null>
  write: (site: string, issues: StoredIssue[]) => Promise<void>
}

// The issues list as a file: issues.json on this machine, and the JSON an
// agent saves and passes back as saved where the server keeps no list.
export type IssuesFile = { version: 1; sites: Record<string, StoredIssue[]> }

// The longest saved list the tools take, as text.
export const SAVED_MAX = 600_000

// The bounds, set before any work: new issues per search check, new audit
// findings per run, and the issues a site keeps.
export const NEW_PER_SEARCH_CHECK = 10
export const NEW_AUDIT_FINDINGS = 50
export const MAX_ISSUES = 500
// Fixed issues measured in one run, one Search Console call each.
export const MEASURES_PER_RUN = 20
const MEASURED_SHOWN = 20
const SUBJECT_MAX = 300
const EVIDENCE_MAX = 200
export const NOTE_MAX = 300
const PAGE_SIZE = 50
const SUMMARY_ROWS = 20

const SEARCH_CHECKS = ['striking-distance', 'low-ctr', 'quick-wins'] as const
type SearchCheck = (typeof SEARCH_CHECKS)[number]

// One check's result: every issue it returned, and whether it covered all
// it could, so an issue it did not return can count as not found.
type Found = { subject: string; evidence: string }
type CheckRun = {
  kind: string
  // Issues in the order the check ranks them.
  found: { kind: string; issue: Found }[]
  // The kinds this run speaks for; an issue of another kind is not touched.
  covers: (kind: string) => boolean
  complete: boolean
  // Issues it adds when they are new: the first ones, up to the cap.
  addLimit: number
  // Issues this run saw as gone, even when it is not complete.
  gone?: Set<string>
  // Kinds whose absent issues it cannot speak for (capped audit rules).
  partialKinds?: Set<string>
  status: string
}

// A short id from the kind and subject, so the same issue keeps its id.
export function issueId(kind: string, subject: string): string {
  let hash = 0x811c9dc5
  for (const char of `${kind}\n${subject}`) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const pctText = (value: unknown) => {
  const n = num(value)
  return n === null ? null : `${Math.round(n * 1000) / 10}%`
}

function searchEvidence(item: Record<string, unknown>): string {
  const position = num(item.position)
  const ctr = pctText(item.actualCtr ?? item.ctr)
  const expected = pctText(item.expectedCtr ?? item.targetCtr)
  return [
    position === null ? null : `position ${Math.round(position * 10) / 10}`,
    num(item.impressions) === null ? null : `${item.impressions} impressions`,
    num(item.clicks) === null ? null : `${item.clicks} clicks`,
    ctr ? `CTR ${ctr}${expected ? ` against ${expected} expected` : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

// A search check covered all it could when its data is not partial or
// unavailable, Search Console did not cut the rows short and the check
// returned every row that qualified.
function searchComplete(report: Record<string, unknown>): string | null {
  const status = report.dataStatus
  if (status === 'partial' || status === 'unavailable') {
    return `data ${status}`
  }
  const source = report.source as { possiblyTruncated?: boolean } | undefined
  if (source?.possiblyTruncated) return 'Search Console rows possibly cut short'
  const selection = (report.selection ?? {}) as Record<string, unknown>
  const limited = Object.entries(selection).find(
    ([key, value]) => key.startsWith('limited') && Number(value) > 0,
  )
  if (limited) return `capped, ${limited[1]} more rows not returned`
  return null
}

function searchRun(
  kind: SearchCheck,
  report: Record<string, unknown> | Error,
): CheckRun {
  const base = { kind, covers: (k: string) => k === kind }
  if (report instanceof Error) {
    return {
      ...base,
      found: [],
      complete: false,
      addLimit: 0,
      status: `${kind}: could not run (${clip(report.message, 120)})`,
    }
  }
  const items = (report.items as Record<string, unknown>[] | undefined) ?? []
  const found = items
    .filter(
      (item) => typeof item.query === 'string' && typeof item.url === 'string',
    )
    .map((item) => ({
      kind,
      issue: {
        subject: `"${item.query}" on ${item.url}`,
        evidence: searchEvidence(item),
      },
    }))
  const short = searchComplete(report)
  return {
    ...base,
    found,
    complete: !short,
    addLimit: NEW_PER_SEARCH_CHECK,
    status: `${kind}: ${found.length} ${found.length === 1 ? 'row' : 'rows'}${short ? ` (${short}, so an issue it did not return is not checked)` : ''}`,
  }
}

function auditEvidence(details: string): string {
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>
    return Object.entries(parsed)
      .filter(([, value]) => ['string', 'number'].includes(typeof value))
      .map(([key, value]) => `${key} ${value}`)
      .join(', ')
  } catch {
    return ''
  }
}

const AUDIT_KIND = 'weekly-audit:'
const INDEX_KIND = 'index-drop'

function auditRuns(snapshot: AuditSnapshot | null | undefined): CheckRun[] {
  const crawl = (k: string) => k.startsWith(AUDIT_KIND)
  const index = (k: string) => k === INDEX_KIND
  if (snapshot === undefined) return []
  const summary = snapshot?.summary
  if (!snapshot || !summary || snapshot.finished_at === null) {
    const why = snapshot
      ? 'the first crawl has not finished'
      : 'the site is not in the weekly site audit'
    return [
      {
        kind: 'weekly-audit',
        covers: crawl,
        found: [],
        complete: false,
        addLimit: 0,
        status: `weekly-audit: not checked, ${why}`,
      },
      {
        kind: INDEX_KIND,
        covers: index,
        found: [],
        complete: false,
        addLimit: 0,
        status: `${INDEX_KIND}: not checked, ${why}`,
      },
    ]
  }
  const open = snapshot.findings.filter((f) => f.state === 'open')
  const gone = new Set(
    snapshot.findings
      .filter((f) => f.state === 'resolved')
      .map((f) => issueId(`${AUDIT_KIND}${f.rule}`, f.subject)),
  )
  const capped = new Set(
    summary.findings.capped_rules.map((rule) => `${AUDIT_KIND}${rule}`),
  )
  const complete = summary.complete && summary.findings.resolution === 'all'
  const day = new Date(snapshot.finished_at).toISOString().slice(0, 10)
  const runs: CheckRun[] = [
    {
      kind: 'weekly-audit',
      covers: crawl,
      found: open.map((f) => ({
        kind: `${AUDIT_KIND}${f.rule}`,
        issue: { subject: f.subject, evidence: auditEvidence(f.details) },
      })),
      complete,
      addLimit: NEW_AUDIT_FINDINGS,
      gone,
      partialKinds: capped,
      status: `weekly-audit: crawl of ${day}, ${open.length} open findings${complete ? '' : ' (partial crawl, so a finding it did not see again is not checked)'}${capped.size ? `; capped rules, not checked when absent: ${[...capped].map((k) => k.slice(AUDIT_KIND.length)).join(', ')}` : ''}`,
    },
  ]
  const changes = snapshot.index_changes
  if (changes) {
    const dropped = changes.rows.filter((row) => row.change === 'dropped')
    runs.push({
      kind: INDEX_KIND,
      covers: index,
      found: dropped.map((row) => ({
        kind: INDEX_KIND,
        issue: {
          subject: row.url,
          evidence: `dropped out ${new Date(row.at).toISOString().slice(0, 10)}${row.coverage ? `, ${row.coverage}` : ''}${row.top ? ', top page' : ''}`,
        },
      })),
      // The daily checks show only the last 7 days, so a URL missing from
      // them is not checked; a URL that came back is not found.
      complete: false,
      addLimit: dropped.length,
      gone: new Set(
        changes.rows
          .filter((row) => row.change === 'returned')
          .map((row) => issueId(INDEX_KIND, row.url)),
      ),
      status: `${INDEX_KIND}: ${changes.dropped} dropped out of Google's index and ${changes.returned} came back in the last 7 days${changes.rows.length < changes.dropped + changes.returned ? `, ${changes.rows.length} rows read` : ''}`,
    })
  }
  return runs
}

// Merges the checks into the stored list. Pure: the same list and runs
// always give the same result.
export function mergeIssues(
  stored: StoredIssue[],
  runs: CheckRun[],
  now: string,
): StoredIssue[] {
  const byId = new Map(stored.map((issue) => [issue.id, { ...issue }]))
  for (const run of runs) {
    const seenIds = new Set<string>()
    let added = 0
    for (const { kind, issue } of run.found) {
      const id = issueId(kind, issue.subject)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      const evidence = clip(issue.evidence, EVIDENCE_MAX)
      const existing = byId.get(id)
      if (existing) {
        Object.assign(existing, {
          evidence,
          last_found: now,
          seen: 'found',
          checked_at: now,
        })
        continue
      }
      if (added >= run.addLimit) continue
      added += 1
      byId.set(id, {
        id,
        kind,
        subject: clip(issue.subject, SUBJECT_MAX),
        evidence,
        mark: 'open',
        marked_at: null,
        note: null,
        first_found: now,
        last_found: now,
        seen: 'found',
        checked_at: now,
      })
    }
    for (const issue of byId.values()) {
      if (!run.covers(issue.kind) || seenIds.has(issue.id)) continue
      if (run.gone?.has(issue.id)) {
        Object.assign(issue, { seen: 'not-found', checked_at: now })
      } else if (run.complete && !run.partialKinds?.has(issue.kind)) {
        Object.assign(issue, { seen: 'not-found', checked_at: now })
      } else {
        // The check could not speak for it this time; keep when it last
        // did, and say it was not checked now.
        issue.seen = 'not-checked'
      }
    }
  }
  return prune([...byId.values()])
}

// At most MAX_ISSUES: open issues not found for the longest go first, and
// issues the person marked stay longest.
function prune(issues: StoredIssue[]): StoredIssue[] {
  if (issues.length <= MAX_ISSUES) return sortIssues(issues)
  const keep = [...issues].sort(
    (a, b) =>
      Number(b.mark !== 'open') - Number(a.mark !== 'open') ||
      (b.last_found ?? '').localeCompare(a.last_found ?? '') ||
      a.id.localeCompare(b.id),
  )
  return sortIssues(keep.slice(0, MAX_ISSUES))
}

const MARK_ORDER: Record<IssueMark, number> = { open: 0, fixed: 1, ignored: 2 }
const SEEN_ORDER: Record<IssueSeen, number> = {
  found: 0,
  'not-checked': 1,
  'not-found': 2,
}

// Open first, then fixed, then ignored; within each, found first; then by
// kind, subject and id, so the order never depends on how they were stored.
export function sortIssues(issues: StoredIssue[]): StoredIssue[] {
  return [...issues].sort(
    (a, b) =>
      MARK_ORDER[a.mark] - MARK_ORDER[b.mark] ||
      SEEN_ORDER[a.seen] - SEEN_ORDER[b.seen] ||
      a.kind.localeCompare(b.kind) ||
      (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0) ||
      a.id.localeCompare(b.id),
  )
}

// The Search Console day (America/Los_Angeles) of a timestamp.
const searchConsoleDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: GSC_TIME_ZONE }).format(
    new Date(iso),
  )

const QUERY_ON_PAGE = /^"(.*)" on (https?:\/\/\S+)$/s

// The page, and the query on it, that a fixed issue can be measured on;
// null for a subject that is not a page (a duplicate title) or was cut
// short when stored.
function measureTarget(
  subject: string,
): { page: string; query?: string } | null {
  if (subject.endsWith('…')) return null
  const onPage = QUERY_ON_PAGE.exec(subject)
  if (onPage) return { page: onPage[2] as string, query: onPage[1] }
  return /^https?:\/\/\S+$/.test(subject) ? { page: subject } : null
}

// The measures a fixed issue still lacks whose days after are all in
// final data by latest.
function dueDays(issue: StoredIssue, latest: string): MeasureDays[] {
  if (issue.mark !== 'fixed' || !issue.marked_at) return []
  const fixedOn = searchConsoleDate(issue.marked_at)
  const have = new Set((issue.measures ?? []).map((m) => m.days))
  return MEASURE_DAYS.filter(
    (days) => !have.has(days) && shiftIsoDate(fixedOn, days - 1) <= latest,
  )
}

function period(
  rows: {
    keys: string[]
    clicks: number
    impressions: number
    position: number
  }[],
  start: string,
  end: string,
): MeasurePeriod {
  let clicks = 0
  let impressions = 0
  let weighted = 0
  for (const row of rows) {
    const date = row.keys[0] ?? ''
    if (date < start || date > end) continue
    clicks += row.clicks
    impressions += row.impressions
    weighted += row.position * row.impressions
  }
  return {
    start,
    end,
    clicks,
    impressions,
    position:
      impressions > 0 ? Math.round((weighted / impressions) * 10) / 10 : null,
  }
}

type UpdateDates = { name: string; start: string; end?: string }

// Measures each fixed issue that is due: the same number of days before
// the day it was marked fixed and from that day on, from final Search
// Console data, one call per issue and at most MEASURES_PER_RUN a run,
// oldest fix first (limit sets a lower cap). A measure is kept on the issue and never fetched
// again; one whose call fails is left for the next run, never stored as
// zero. Measures from an earlier fix date, or of an issue no longer marked
// fixed, are dropped.
export async function measureFixed(
  issues: StoredIssue[],
  site: string,
  read: SearchAnalyticsQuery,
  now: Date,
  limit = MEASURES_PER_RUN,
  updatesIn: typeof googleUpdates = googleUpdates,
): Promise<{
  issues: StoredIssue[]
  added: number
  // Search Console calls made.
  calls: number
  status: string | null
}> {
  const latest = latestFinalGscDate(now)
  const kept = issues.map((issue) => {
    const fixedOn =
      issue.mark === 'fixed' && issue.marked_at
        ? searchConsoleDate(issue.marked_at)
        : null
    const measures = (issue.measures ?? []).filter(
      (m) => m.fixed_on === fixedOn,
    )
    const { measures: _, ...rest } = issue
    return measures.length ? { ...rest, measures } : rest
  })
  const fixed = kept.filter((issue) => issue.mark === 'fixed')
  const notPages = fixed.filter((issue) => !measureTarget(issue.subject))
  const due = fixed
    .map((issue) => ({ issue, days: dueDays(issue, latest) }))
    .filter(({ issue, days }) => days.length && measureTarget(issue.subject))
    .sort(
      (a, b) =>
        (a.issue.marked_at ?? '').localeCompare(b.issue.marked_at ?? '') ||
        a.issue.id.localeCompare(b.issue.id),
    )
  const batch = due.slice(0, Math.max(0, limit))
  const measuredAt = now.toISOString()
  const fresh: { issue: StoredIssue; measure: IssueMeasure }[] = []
  let failed = 0
  await Promise.all(
    batch.map(async ({ issue, days }) => {
      const target = measureTarget(issue.subject) as {
        page: string
        query?: string
      }
      const fixedOn = searchConsoleDate(issue.marked_at as string)
      const longest = Math.max(...days)
      const filters = [
        {
          dimension: 'page',
          operator: 'equals' as const,
          expression: target.page,
        },
        ...(target.query === undefined
          ? []
          : [
              {
                dimension: 'query',
                operator: 'equals' as const,
                expression: target.query,
              },
            ]),
      ]
      try {
        const result = await read(site, {
          startDate: shiftIsoDate(fixedOn, -longest),
          endDate: shiftIsoDate(fixedOn, longest - 1),
          dimensions: ['date'],
          type: 'web',
          dataState: 'final',
          dimensionFilterGroups: [{ groupType: 'and', filters }],
        })
        for (const n of days) {
          fresh.push({
            issue,
            measure: {
              days: n,
              fixed_on: fixedOn,
              scope: target.query === undefined ? 'page' : 'query on page',
              before: period(
                result.rows,
                shiftIsoDate(fixedOn, -n),
                shiftIsoDate(fixedOn, -1),
              ),
              after: period(result.rows, fixedOn, shiftIsoDate(fixedOn, n - 1)),
              updates: null,
              measured_at: measuredAt,
            },
          })
        }
      } catch {
        failed += 1
      }
    }),
  )
  if (fresh.length) {
    const starts = fresh.map((f) => f.measure.before.start).sort()
    const ends = fresh.map((f) => f.measure.after.end).sort()
    const found = await updatesIn({
      start: starts[0] as string,
      end: ends.at(-1) as string,
    }).catch(() => 'unread')
    for (const { measure } of fresh) {
      if (!Array.isArray(found)) continue
      measure.updates = (found as UpdateDates[])
        .filter(
          (u) =>
            u.start.slice(0, 10) <= measure.after.end &&
            (u.end ? u.end.slice(0, 10) : latest) >= measure.before.start,
        )
        .map((u) => u.name)
    }
    for (const { issue, measure } of fresh) {
      issue.measures = [...(issue.measures ?? []), measure].sort(
        (a, b) => a.days - b.days,
      )
    }
  }
  const later = due.length - batch.length
  const parts = [
    fresh.length
      ? `${fresh.length} ${fresh.length === 1 ? 'result' : 'results'} added`
      : null,
    failed
      ? `${failed} could not be read from Search Console and ${failed === 1 ? 'is' : 'are'} tried next time`
      : null,
    later > 0 ? `${later} more due, measured next time` : null,
    notPages.length
      ? `${notPages.length} fixed ${notPages.length === 1 ? 'issue is' : 'issues are'} not a page, so not measured`
      : null,
  ].filter(Boolean)
  return {
    issues: kept,
    added: fresh.length,
    calls: batch.length,
    status: parts.length
      ? `after-fix results (Search Console final data to ${latest}): ${parts.join('; ')}`
      : null,
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

// One measure as a sentence of facts.
function measureText(measure: IssueMeasure): string {
  const { before, after } = measure
  const pos = (p: MeasurePeriod) =>
    p.position === null ? '' : `, average position ${p.position}`
  const updates =
    measure.updates === null
      ? ' Google updates in these dates could not be read.'
      : measure.updates.length
        ? ` Google updates in these dates (timing only): ${measure.updates.join('; ')}.`
        : ''
  return `${measure.days} days from ${measure.fixed_on} (${measure.scope}): ${after.clicks} clicks (${signed(after.clicks - before.clicks)}) and ${after.impressions} impressions${pos(after)}, against ${before.clicks} clicks and ${before.impressions} impressions${pos(before)} in the ${measure.days} days before.${updates}`
}

function measuredLines(issues: StoredIssue[], origin: string): string | null {
  const measured = issues.filter((issue) => issue.measures?.length)
  if (!measured.length) return null
  const shown = measured.slice(0, MEASURED_SHOWN)
  return [
    `Search Console before and after the day each issue was marked fixed, on Search Console's Pacific time calendar (${measured.length} ${measured.length === 1 ? 'issue' : 'issues'}${measured.length > shown.length ? `, first ${shown.length} shown` : ''}). Before and after is timing, not proof the fix caused the change:`,
    ...shown.map(
      (issue) =>
        `- ${issue.id} ${relative(issue.subject, origin)}: ${(issue.measures ?? []).map(measureText).join(' ')}`,
    ),
  ].join('\n')
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function relative(subject: string, origin: string): string {
  return subject.split(origin).join('') || subject
}

function issuesTable(rows: StoredIssue[], origin: string): string {
  return [
    'id | mark | latest check | kind | subject | evidence when last found | first found',
    ...rows.map((issue) =>
      [
        issue.id,
        issue.mark === 'open'
          ? 'open'
          : `${issue.mark} ${day(issue.marked_at)}${issue.note ? ` (${issue.note})` : ''}`,
        issue.seen === 'not-checked'
          ? `not checked${issue.checked_at ? `, last ${day(issue.checked_at)}` : ''}`
          : `${issue.seen === 'found' ? 'found' : 'not found'} ${day(issue.checked_at)}`,
        issue.kind,
        relative(issue.subject, origin),
        issue.evidence,
        day(issue.first_found),
      ].join(' | '),
    ),
  ].join('\n')
}

function counts(issues: StoredIssue[]) {
  const by = (mark: IssueMark) => issues.filter((i) => i.mark === mark).length
  return { open: by('open'), fixed: by('fixed'), ignored: by('ignored') }
}

// One line for the full report: what is stored, without running checks.
export function issuesPreview(
  issues: StoredIssue[] | null,
  call: Caller,
  site: string,
) {
  const more = `${call('report', { site, section: ISSUES_SECTION })} checks again and lists them.`
  if (!issues) {
    return `This server is not storing an issues list for this site. ${call('report', { site, section: ISSUES_SECTION })} checks and returns the list to save.`
  }
  if (!issues.length) {
    return `No issues kept for this site yet. ${more}`
  }
  const c = counts(issues)
  return `${issues.length} issues kept: ${c.open} open, ${c.fixed} fixed, ${c.ignored} ignored, as of the last check. ${more}`
}

const SEEN = new Set<string>(['found', 'not-found', 'not-checked'])
const optionalText = (value: unknown) =>
  value === null || value === undefined || typeof value === 'string'

// A list the agent saved, read back for one site. Anything that is not
// the saved shape fails, so a broken file never passes as an empty list.
export function parseSaved(text: string, site: string): StoredIssue[] {
  const bad = (why: string) =>
    new CommandError(
      'INVALID_INPUT',
      `saved is not a saved issues list: ${why}. Pass the JSON the issues section returned, {"version":1,"sites":{"${site}":[...]}}, unchanged. Nothing was changed.`,
    )
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw bad('it is not JSON')
  }
  const { version, sites } = (file ?? {}) as Partial<IssuesFile>
  if (version !== 1 || !sites || typeof sites !== 'object') {
    throw bad('it needs version 1 and sites')
  }
  const list = (sites as Record<string, unknown>)[site]
  if (list === undefined) {
    throw bad(
      `it has no list for ${site} (it has ${Object.keys(sites).join(', ') || 'none'})`,
    )
  }
  if (!Array.isArray(list)) throw bad(`sites["${site}"] is not a list`)
  if (list.length > MAX_ISSUES) throw bad(`it has more than ${MAX_ISSUES}`)
  return list.map((entry, index) => {
    const issue = (entry ?? {}) as Record<string, unknown>
    const ok =
      typeof issue.id === 'string' &&
      /^[0-9a-f]{8}$/.test(issue.id) &&
      typeof issue.kind === 'string' &&
      typeof issue.subject === 'string' &&
      ISSUE_MARKS.includes(issue.mark as IssueMark) &&
      typeof issue.first_found === 'string' &&
      ['evidence', 'marked_at', 'note', 'last_found', 'checked_at'].every(
        (key) => optionalText(issue[key]),
      ) &&
      (issue.seen === undefined || SEEN.has(issue.seen as string)) &&
      (issue.measures === undefined ||
        (Array.isArray(issue.measures) &&
          issue.measures.length <= MEASURE_DAYS.length &&
          issue.measures.every(savedMeasure)))
    if (!ok) throw bad(`issue ${index + 1} is not in the saved shape`)
    return {
      id: issue.id as string,
      kind: clip(issue.kind as string, 100),
      subject: clip(issue.subject as string, SUBJECT_MAX),
      evidence: clip((issue.evidence as string | null) ?? '', EVIDENCE_MAX),
      mark: issue.mark as IssueMark,
      marked_at: (issue.marked_at as string | null) ?? null,
      note: issue.note ? clip(issue.note as string, NOTE_MAX) : null,
      first_found: issue.first_found as string,
      last_found: (issue.last_found as string | null) ?? null,
      seen: (issue.seen as IssueSeen | undefined) ?? 'not-checked',
      checked_at: (issue.checked_at as string | null) ?? null,
      ...(Array.isArray(issue.measures) && issue.measures.length
        ? { measures: issue.measures as IssueMeasure[] }
        : {}),
    }
  })
}

const savedPeriod = (value: unknown) => {
  const p = (value ?? {}) as Record<string, unknown>
  return (
    typeof p.start === 'string' &&
    typeof p.end === 'string' &&
    Number.isFinite(p.clicks) &&
    Number.isFinite(p.impressions) &&
    (p.position === null || Number.isFinite(p.position))
  )
}

function savedMeasure(value: unknown): boolean {
  const m = (value ?? {}) as Record<string, unknown>
  return (
    MEASURE_DAYS.includes(m.days as MeasureDays) &&
    typeof m.fixed_on === 'string' &&
    realIsoDate(m.fixed_on) &&
    (m.scope === 'page' || m.scope === 'query on page') &&
    savedPeriod(m.before) &&
    savedPeriod(m.after) &&
    (m.updates === null ||
      (Array.isArray(m.updates) &&
        m.updates.every((name) => typeof name === 'string'))) &&
    typeof m.measured_at === 'string'
  )
}

const asFile = (site: string, issues: StoredIssue[]): IssuesFile => ({
  version: 1,
  sites: { [site]: issues },
})

// Where the server keeps no list: what to save and how to pass it back.
function saveText(site: string, issues: StoredIssue[], call: Caller): string {
  return [
    `This server is not storing this list for ${site}: the hosted server keeps it only for sites in the weekly site audit. Save the JSON below in a file in the person's project, such as .seo/issues.json, replacing the old one. Next time, pass the file's contents as saved (${call('report', { site, section: ISSUES_SECTION, saved: '<file contents>' })}, or with mark and issues), so marks, notes and first-found dates carry over. Without saved, the list starts again.`,
    `\`\`\`json\n${JSON.stringify(asFile(site, issues))}\n\`\`\``,
  ].join('\n')
}

// The site's list from the surface, else from saved, else empty.
async function startingList(
  site: string,
  saved: string | undefined,
  deps: CommandDeps,
): Promise<{ issues: StoredIssue[]; stored: boolean; note: string | null }> {
  const kept = deps.issues ? await deps.issues.read(site) : null
  if (kept) {
    return {
      issues: kept,
      stored: true,
      note: saved
        ? 'saved was not used: this surface keeps the list itself.'
        : null,
    }
  }
  return {
    issues: saved ? parseSaved(saved, site) : [],
    stored: false,
    note: saved ? null : 'No saved list was passed, so this is a new list.',
  }
}

export type IssuesInput = DateInput & {
  site: string
  detail?: Detail
  offset?: number
  // The list the agent saved, where the server keeps none.
  saved?: string
}

// Runs a report section's checks for the issues section; report.ts passes
// its own builder, so this file does not import the report.
export type SectionBuild = (
  section: SearchCheck,
  range: DateRange,
) => Promise<Record<string, unknown>>

export async function runIssues(
  input: IssuesInput,
  deps: CommandDeps,
  build: SectionBuild,
): Promise<CommandResult> {
  const { site } = input
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const range = dateWindow(input, 28)
  // Read first, so a broken saved list fails before any check runs.
  const start = await startingList(site, input.saved, deps)
  const [snapshot, ...search] = await Promise.all([
    deps.audit ? deps.audit.snapshot(site) : Promise.resolve(undefined),
    ...SEARCH_CHECKS.map((kind) =>
      build(kind, range).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      ),
    ),
  ])
  const runs = [
    ...SEARCH_CHECKS.map((kind, i) =>
      searchRun(kind, search[i] as Record<string, unknown> | Error),
    ),
    ...auditRuns(snapshot),
  ]
  const measured = await measureFixed(
    mergeIssues(start.issues, runs, now),
    site,
    deps.searchAnalytics,
    new Date(now),
  )
  const issues = measured.issues
  if (start.stored) await deps.issues?.write(site, issues)
  return issuesResult(input, issues, runs, range, deps.call, {
    ...start,
    measureStatus: measured.status,
  })
}

function issuesResult(
  input: IssuesInput,
  issues: StoredIssue[],
  runs: CheckRun[],
  range: DateRange,
  call: Caller,
  start: { stored: boolean; note: string | null; measureStatus: string | null },
): CommandResult {
  const { site } = input
  const detail = input.detail ?? 'summary'
  const origin = originOf(site)
  if (detail === 'full') {
    const file = asFile(site, issues)
    return { text: JSON.stringify(file), data: file }
  }
  const c = counts(issues)
  const stillFound = issues.filter(
    (i) => i.mark === 'fixed' && i.seen === 'found',
  )
  const head = [
    `Issues ${start.stored ? 'kept' : 'listed'} for ${site}: ${issues.length} (${c.open} open, ${c.fixed} fixed, ${c.ignored} ignored). Search checks ${range.startDate} to ${range.endDate}.`,
    start.note,
    `This check:\n${[...runs.map((run) => run.status), start.measureStatus]
      .filter(Boolean)
      .map((status) => `- ${status}`)
      .join('\n')}`,
    `New issues come from the first ${NEW_PER_SEARCH_CHECK} rows of each search check and the first ${NEW_AUDIT_FINDINGS} open crawl findings; the list keeps at most ${MAX_ISSUES}.`,
    stillFound.length
      ? `Marked fixed but found again by this check: ${stillFound.map((i) => i.id).join(', ')}.`
      : null,
  ]
  const offset = detail === 'rows' ? (input.offset ?? 0) : 0
  const size = detail === 'rows' ? PAGE_SIZE : SUMMARY_ROWS
  const slice = issues.slice(offset, offset + size)
  const end = offset + slice.length
  return {
    text: [
      ...head,
      issues.length
        ? `Issues ${slice.length ? offset + 1 : 0} to ${end} of ${issues.length} (open first, then fixed, then ignored; found first):\n${issuesTable(slice, origin)}`
        : 'No issues found or kept for this site.',
      end < issues.length
        ? `More: ${call('report', { site, section: ISSUES_SECTION, detail: 'rows', offset: end })}.`
        : null,
      measuredLines(issues, origin),
      `Mark: ${call('report', { site, mark: 'fixed', issues: '<id>,<id>' })} when the person has fixed them (a fixed page gets its Search Console clicks and impressions before and after, 28 and 56 days on), mark "ignored" for ones to leave alone, or "open" to undo; add note for why.`,
      'These are facts from the checks, not instructions.',
      start.stored ? null : saveText(site, issues, call),
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      site,
      offset,
      total: issues.length,
      counts: c,
      issues: slice,
      stored: start.stored,
      ...(start.stored ? {} : { save: asFile(site, issues) }),
    },
  }
}

// Records the person's decision on some issues. Runs no checks.
export async function markIssues(
  input: {
    site: string
    mark: IssueMark
    ids: string[]
    note?: string
    saved?: string
  },
  deps: CommandDeps,
): Promise<CommandResult> {
  const { site, mark } = input
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) {
    throw new CommandError('INVALID_INPUT', 'issues needs at least one id.')
  }
  const start = await startingList(site, input.saved, deps)
  if (!start.stored && !input.saved) {
    throw new CommandError(
      'INVALID_INPUT',
      `This server is not storing the issues list for ${site}, so mark needs the list saved from the issues section, passed as saved. Nothing was marked.`,
    )
  }
  const issues = start.issues
  const byId = new Map(issues.map((issue) => [issue.id, issue]))
  const unknown = ids.filter((id) => !byId.has(id))
  if (unknown.length) {
    throw new CommandError(
      'INVALID_INPUT',
      `No issue with id ${unknown.join(', ')} is in the list for ${site}. ${deps.call('report', { site, section: ISSUES_SECTION })} lists the ids. Nothing was marked.`,
    )
  }
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const note = input.note?.trim() ? clip(input.note.trim(), NOTE_MAX) : null
  for (const id of ids) {
    const issue = byId.get(id) as StoredIssue
    issue.mark = mark
    issue.marked_at = mark === 'open' ? null : now
    issue.note = mark === 'open' ? null : note
    // A new mark starts a new before and after.
    delete issue.measures
  }
  const sorted = sortIssues(issues)
  if (start.stored) await deps.issues?.write(site, sorted)
  const changed = sorted.filter((issue) => ids.includes(issue.id))
  return {
    text: [
      `Marked ${changed.length} ${changed.length === 1 ? 'issue' : 'issues'} ${mark} for ${site}.`,
      issuesTable(changed, originOf(site)),
      `${deps.call('report', { site, section: ISSUES_SECTION })} checks again and shows whether each is still found.`,
      start.stored ? null : saveText(site, sorted, deps.call),
    ]
      .filter(Boolean)
      .join('\n\n'),
    data: {
      site,
      mark,
      issues: changed,
      stored: start.stored,
      ...(start.stored ? {} : { save: asFile(site, sorted) }),
    },
  }
}
