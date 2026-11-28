import {
  type AnswersData,
  answerRun,
  bareDomain,
  contextDefinition,
  type ProgressRun,
  runAiAnswers,
  type WeekAiAnswers,
} from '@seo/core/commands'
import { siteContext } from '../context.ts'
import { directory } from '../google.ts'
import { siteProgress } from '../progress.ts'
import { accountsOf } from '../store.ts'
import { addUnmetered, flushUnmetered } from '../usage.ts'
import type { Google } from './checks.ts'
import {
  chargeCheck,
  type GapSite,
  NO_USAGE,
  payer,
  topCountry,
  usageLeftUsd,
} from './competitors.ts'
import type { Meter } from './meter.ts'

// The weekly audit's AI answer check, on SEO Skill's own DataForSEO
// account: once a week, the same questions are asked in ChatGPT search,
// the Gemini app, Google AI Mode and AI Overviews (ai_answers in seo_research), and each
// answer's result is kept beside the one from the week before, so the
// summary can say which answers started or stopped citing the site. The
// questions are the ones pinned under "## AI questions" in the site's
// business context, else the Search Console questions fixed at the first
// check; a new set starts the comparison again. Each run also joins the
// site's progress, with the context's competitors judged on the same
// answers. Only paid sites and unlimited-sites accounts get it; a usage
// plan's account pays for each run from its usage. Spend is capped per site
// a month before each run.

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
// DataForSEO spend per site a month (UTC), and the worst case of one run
// of 10 questions on four engines (about $0.10 at DataForSEO's prices).
export const AI_MONTH_BUDGET_USD = 1
const RUN_ESTIMATE_USD = 0.2
// How long a run waits for queued answers; the rest are read back, free,
// an hour later, for up to a day.
const WAIT_SECONDS = 120
const READ_BACK_SECONDS = 30
const MAX_CITED_SITES = 10
// Pages kept for each cited site in the weekly summary.
const MAX_CITED_PAGES = 3
// Results that say what the answer showed, so a change between two of
// them is a real change, not a failed or late read.
const KNOWN = new Set(['cited', 'mentioned', 'neither', 'no_answer'])

export const TABLES = `
CREATE TABLE IF NOT EXISTS ai_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_at INTEGER,
  -- DataForSEO spend this UTC month (YYYY-MM), in USD.
  month TEXT,
  spent_usd REAL NOT NULL DEFAULT 0,
  checked_at INTEGER,
  previous_checked_at INTEGER,
  blocked TEXT,
  -- JSON: the questions asked every week: the business context's pinned
  -- questions, else Search Console's, fixed at the first check that found
  -- any.
  questions TEXT,
  -- 1 when the questions are the business context's pinned ones.
  pinned INTEGER NOT NULL DEFAULT 0,
  -- When this set of questions was first asked.
  fixed_at INTEGER,
  country TEXT,
  -- JSON: queued answers not read yet, as ai_answers tasks.
  pending TEXT
);
-- Each question and engine's latest result and the one before it.
CREATE TABLE IF NOT EXISTS ai_answers (
  question TEXT NOT NULL,
  engine TEXT NOT NULL,
  result TEXT NOT NULL,
  cited_url TEXT,
  -- JSON list of the other sites the answer cites: the first page it
  -- cites on each, or the host alone from checks before pages were kept.
  sources TEXT NOT NULL DEFAULT '[]',
  previous_result TEXT,
  -- JSON: each context competitor's result for the same answer, by domain.
  others TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (question, engine)
);
`

// Columns an older ai_answers lacks (schema.ts adds them).
export const AI_ANSWERS_ADDED: [string, string][] = [
  ['others', "TEXT NOT NULL DEFAULT '{}'"],
]

// Columns an older ai_state lacks (schema.ts adds them).
export const AI_STATE_ADDED: [string, string][] = [
  ['pinned', 'INTEGER NOT NULL DEFAULT 0'],
  ['fixed_at', 'INTEGER'],
]

type State = {
  next_at: number | null
  month: string | null
  spent_usd: number
  checked_at: number | null
  previous_checked_at: number | null
  blocked: string | null
  questions: string | null
  pinned: number
  fixed_at: number | null
  country: string | null
  pending: string | null
}

type AnswerRow = {
  question: string
  engine: string
  result: string
  cited_url: string | null
  sources: string
  previous_result: string | null
  others: string
}

const aiState = (meter: Meter) => meter.one<State>('SELECT * FROM ai_state')

function saveState(meter: Meter, fields: Partial<State>): void {
  const next: State = {
    next_at: null,
    month: null,
    spent_usd: 0,
    checked_at: null,
    previous_checked_at: null,
    blocked: null,
    questions: null,
    pinned: 0,
    fixed_at: null,
    country: null,
    pending: null,
    ...aiState(meter),
    ...fields,
  }
  meter.run(
    `INSERT INTO ai_state (id, next_at, month, spent_usd, checked_at, previous_checked_at, blocked, questions, pinned, fixed_at, country, pending)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET next_at = excluded.next_at, month = excluded.month,
       spent_usd = excluded.spent_usd, checked_at = excluded.checked_at,
       previous_checked_at = excluded.previous_checked_at, blocked = excluded.blocked,
       questions = excluded.questions, pinned = excluded.pinned, fixed_at = excluded.fixed_at,
       country = excluded.country, pending = excluded.pending`,
    next.next_at,
    next.month,
    next.spent_usd,
    next.checked_at,
    next.previous_checked_at,
    next.blocked,
    next.questions,
    next.pinned,
    next.fixed_at,
    next.country,
    next.pending,
  )
}

// The rows ai_answers returns with detail full.
type Answered = AnswersData['rows'][number] & {
  sources: string[]
  source_urls?: string[]
}
type Answers = Omit<AnswersData, 'rows'> & {
  questions: string[]
  pendingTasks: string[]
  rows: Answered[]
}

const sameSet = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// The progress run a check is kept as, by when the check ran.
const runId = (checkedAt: number) =>
  `ai_answers-${new Date(checkedAt).toISOString()}`

// Keeps the check in the site's progress. An answer not read yet stays
// pending with no task, because its task is on SEO Skill's DataForSEO
// account and the person's key cannot read it back; the read-back
// replaces it here. A failed write never fails the check.
async function keepProgress(
  env: Env,
  site: GapSite,
  checkedAt: number,
  country: string,
  data: Answers,
  earlier: ProgressRun | null,
): Promise<void> {
  const fresh = answerRun(country, data)
  const answers =
    earlier?.kind === 'ai_answers'
      ? (() => {
          const read = new Map(
            fresh.answers
              .filter((a) => a.result !== 'pending')
              .map((a) => [`${a.question}|${a.engine}`, a]),
          )
          return earlier.answers.map(
            (a) => read.get(`${a.question}|${a.engine}`) ?? a,
          )
        })()
      : fresh.answers
  const run = {
    ...fresh,
    ...(earlier?.kind === 'ai_answers' ? { cost_usd: earlier.cost_usd } : {}),
    id: runId(checkedAt),
    ran_at: new Date(checkedAt).toISOString(),
    answers: answers.map((a) => ({ ...a, task: null })),
  } as ProgressRun
  await siteProgress(env, site.user_id)
    .saveRun(site.property, run)
    .catch(() => undefined)
}

// One check when it is due. Returns when it is due next, or null when the
// check is off on this server.
export async function runAiCheck(
  env: Env,
  meter: Meter,
  site: GapSite,
  google: Google,
  now = Date.now(),
): Promise<number | null> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return null
  const state = aiState(meter)
  if (state?.next_at && state.next_at > now) return state.next_at
  const pays = await payer(env, site.user_id)
  if (!pays) {
    saveState(meter, { next_at: now + DAY_MS })
    return now + DAY_MS
  }
  const headers = new Headers({
    'x-dataforseo-login': env.DATAFORSEO_LOGIN,
    'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
  })
  const search = google.searchAnalytics()
  // The business context's pinned questions and competitors, if any.
  const context = await siteContext(env, site.user_id)
    .read(site.property)
    .catch(() => null)
  const definition = context
    ? contextDefinition(site.property, context).definition
    : null
  const pinned = definition?.questions?.length ? definition.questions : null
  const others = definition?.competitors ?? []
  const ask = async (input: {
    country: string
    questions?: string[]
    tasks?: string[]
    waitSeconds: number
  }) =>
    (
      await runAiAnswers(
        {
          site: site.property,
          detail: 'full',
          offset: 0,
          others,
          // The audit keeps its own runs; a retry must not reuse a cached one.
          store: null,
          // A scheduled check reads late answers back hourly, so it takes
          // DataForSEO's cheaper standard queue.
          standard: true,
          ...input,
        },
        headers,
        { searchAnalytics: search },
        () => '',
      )
    ).data as Answers
  const store = (rows: Answered[], fresh: boolean) => {
    for (const row of rows) {
      const sources = JSON.stringify(
        row.source_urls?.length ? row.source_urls : (row.sources ?? []),
      )
      const others = JSON.stringify(row.others ?? {})
      if (fresh) {
        meter.run(
          `INSERT INTO ai_answers (question, engine, result, cited_url, sources, previous_result, others)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT (question, engine) DO UPDATE SET previous_result = ai_answers.result,
             result = excluded.result, cited_url = excluded.cited_url, sources = excluded.sources,
             others = excluded.others`,
          row.question,
          row.engine,
          row.result,
          row.cited_url,
          sources,
          others,
        )
      } else {
        // A late answer replaces its own pending row and keeps the week
        // before.
        meter.run(
          'UPDATE ai_answers SET result = ?, cited_url = ?, sources = ?, others = ? WHERE question = ? AND engine = ?',
          row.result,
          row.cited_url,
          sources,
          others,
          row.question,
          row.engine,
        )
      }
    }
  }

  // Answers still queued from this week's run, read back at no cost.
  const pending = state?.pending ? (JSON.parse(state.pending) as string[]) : []
  if (pending.length && state?.checked_at && state.country) {
    const weekly = state.checked_at + WEEK_MS
    if (now - state.checked_at > DAY_MS) {
      saveState(meter, { pending: null, next_at: weekly })
      return weekly
    }
    const data = await ask({
      country: state.country,
      tasks: pending,
      waitSeconds: READ_BACK_SECONDS,
    })
    const left = data.pendingTasks
    const kept = (
      await siteProgress(env, site.user_id)
        .runs(site.property)
        .catch(() => [] as ProgressRun[])
    ).find((run) => run.id === runId(state.checked_at as number))
    await keepProgress(
      env,
      site,
      state.checked_at,
      state.country,
      data,
      kept ?? null,
    )
    meter.transaction(() => {
      store(
        data.rows.filter((row) => row.result !== 'pending'),
        false,
      )
      saveState(meter, {
        pending: left.length ? JSON.stringify(left) : null,
        next_at: left.length ? now + HOUR_MS : weekly,
      })
    })
    return left.length ? now + HOUR_MS : weekly
  }

  const month = new Date(now).toISOString().slice(0, 7)
  const spent = state?.month === month ? state.spent_usd : 0
  const block = (blocked: string, at: number) => {
    saveState(meter, { blocked, next_at: at, month, spent_usd: spent })
    return at
  }
  if (spent + RUN_ESTIMATE_USD > AI_MONTH_BUDGET_USD) {
    return block(
      'This month’s data budget for the AI answer check is used up, so it runs again next month',
      Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth() + 1,
        1,
      ),
    )
  }
  // A usage plan pays for the run from its usage, inside the budget above.
  if (
    pays === 'usage' &&
    (await usageLeftUsd(env, site.user_id)) < RUN_ESTIMATE_USD
  ) {
    return block(NO_USAGE, now + DAY_MS)
  }
  const { alpha3, country } = await topCountry(search, site.property)
  if (!country) {
    return block(
      `DataForSEO has no AI answer data for the country most of the site's clicks come from (${alpha3.toUpperCase()})`,
      now + WEEK_MS,
    )
  }
  // The pinned questions, else the Search Console set fixed earlier. A
  // set that is not the one asked last week starts the comparison again.
  const stored = state?.questions
    ? (JSON.parse(state.questions) as string[])
    : null
  const keep =
    stored &&
    (pinned
      ? Boolean(state?.pinned) && sameSet(pinned, stored)
      : !state?.pinned)
  const questions = pinned ?? (keep ? (stored ?? undefined) : undefined)
  let data: Answers
  try {
    data = await ask({ country, questions, waitSeconds: WAIT_SECONDS })
  } catch (error) {
    // Tasks may have been queued and paid for before the failure. A usage
    // plan is charged only a cost DataForSEO reported.
    if (pays === 'usage') {
      await chargeCheck(
        env,
        site.user_id,
        (error as { cost?: number }).cost ?? 0,
      )
    }
    meter.transaction(() => {
      saveState(meter, { month, spent_usd: spent + RUN_ESTIMATE_USD })
      addUnmetered(
        meter,
        'included_dataforseo_microusd',
        Math.round(RUN_ESTIMATE_USD * 1_000_000),
      )
    })
    throw error
  }
  if (!data.questions.length) {
    return block(
      'Search Console has no askable questions among the site’s AI-shaped queries yet, so no answer was checked',
      now + WEEK_MS,
    )
  }
  meter.transaction(() => {
    addUnmetered(
      meter,
      'included_dataforseo_microusd',
      Math.round(data.costUsd * 1_000_000),
    )
    // A new set of questions starts the comparison again; otherwise a
    // question no longer asked leaves it.
    if (keep) {
      meter.run(
        `DELETE FROM ai_answers WHERE question NOT IN (SELECT value FROM json_each(?))`,
        JSON.stringify(data.questions),
      )
    } else {
      meter.run('DELETE FROM ai_answers')
    }
    store(data.rows, true)
    saveState(meter, {
      month,
      spent_usd: spent + data.costUsd,
      previous_checked_at: keep ? (state?.checked_at ?? null) : null,
      checked_at: now,
      blocked: null,
      questions: JSON.stringify(data.questions),
      pinned: pinned ? 1 : 0,
      // A set kept from before this column existed counts from its
      // earliest known check.
      fixed_at: keep
        ? (state?.fixed_at ??
          state?.previous_checked_at ??
          state?.checked_at ??
          now)
        : now,
      country,
      pending: data.pendingTasks.length
        ? JSON.stringify(data.pendingTasks)
        : null,
      next_at: data.pendingTasks.length ? now + HOUR_MS : now + WEEK_MS,
    })
  })
  if (pays === 'usage') await chargeCheck(env, site.user_id, data.costUsd)
  await keepProgress(env, site, now, country, data, null)
  return data.pendingTasks.length ? now + HOUR_MS : now + WEEK_MS
}

// The latest check for D1, in the weekly summary's shape.
// For the site and each competitor judged on the same answers: answers
// read, and how many cite or name each, the site first, then the most
// named.
function shareOfVoice(
  property: string,
  rows: AnswerRow[],
): WeekAiAnswers['share_of_voice'] {
  const read = rows.filter((row) => KNOWN.has(row.result))
  const others = read.map(
    (row) => JSON.parse(row.others || '{}') as Record<string, string>,
  )
  const domains = [...new Set(others.flatMap((o) => Object.keys(o)))]
  if (!domains.length) return []
  const voice = (domain: string, results: (string | undefined)[]) => {
    const known = results.filter((r): r is string => Boolean(r && KNOWN.has(r)))
    return {
      domain,
      read: known.length,
      cited: known.filter((r) => r === 'cited').length,
      mentioned: known.filter((r) => r === 'mentioned').length,
    }
  }
  const named = (v: { cited: number; mentioned: number }) =>
    v.cited + v.mentioned
  return [
    voice(
      bareDomain(property),
      read.map((row) => row.result),
    ),
    ...domains
      .map((domain) =>
        voice(
          domain,
          others.map((o) => o[domain]),
        ),
      )
      .sort((a, b) => named(b) - named(a) || a.domain.localeCompare(b.domain)),
  ]
}

export function aiResult(meter: Meter, property: string): WeekAiAnswers {
  const state = aiState(meter)
  const rows = meter.all<AnswerRow>(
    'SELECT * FROM ai_answers ORDER BY question, engine',
  )
  const counts: WeekAiAnswers['counts'] = {
    cited: 0,
    mentioned: 0,
    neither: 0,
    no_answer: 0,
    unavailable: 0,
    pending: 0,
  }
  // Each cited site's answers, and the answers citing each page on it.
  const cites = new Map<
    string,
    { answers: number; urls: Map<string, number> }
  >()
  for (const row of rows) {
    const key = row.result as keyof typeof counts
    if (key in counts) counts[key] += 1
    for (const source of JSON.parse(row.sources) as string[]) {
      const url = /^https?:\/\//.test(source) ? source : null
      const host = url
        ? new URL(url).hostname.toLowerCase().replace(/^www\./, '')
        : source
      const site = cites.get(host) ?? { answers: 0, urls: new Map() }
      site.answers += 1
      if (url) site.urls.set(url, (site.urls.get(url) ?? 0) + 1)
      cites.set(host, site)
    }
  }
  const rank = (result: string) => (result === 'cited' ? 0 : 1)
  return {
    checked_at: state?.checked_at ?? null,
    previous_checked_at: state?.previous_checked_at ?? null,
    blocked: state?.blocked ?? null,
    questions: state?.questions
      ? (JSON.parse(state.questions) as string[])
      : [],
    pinned: Boolean(state?.pinned),
    share_of_voice: shareOfVoice(property, rows),
    fixed_at: state?.fixed_at ?? null,
    counts,
    changes: rows
      .filter(
        (row) =>
          row.previous_result !== null &&
          row.previous_result !== row.result &&
          KNOWN.has(row.previous_result) &&
          KNOWN.has(row.result),
      )
      .map((row) => ({
        question: row.question,
        engine: row.engine,
        from: row.previous_result as string,
        to: row.result,
        cited_url: row.result === 'cited' ? row.cited_url : null,
      }))
      // Answers that gained or lost a citation first.
      .sort(
        (a, b) =>
          Math.min(rank(a.from), rank(a.to)) -
            Math.min(rank(b.from), rank(b.to)) ||
          a.question.localeCompare(b.question) ||
          a.engine.localeCompare(b.engine),
      ),
    cited_sites: [...cites]
      .sort((a, b) => b[1].answers - a[1].answers || a[0].localeCompare(b[0]))
      .slice(0, MAX_CITED_SITES)
      .map(([host, { answers, urls }]) => ({
        host,
        answers,
        pages: urls.size,
        urls: [...urls]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, MAX_CITED_PAGES)
          .map(([url]) => url),
      })),
  }
}

// The check from the site object's alarm, when due and no crawl runs,
// then the latest result to D1 for the weekly summary. Like the
// competitor check, it sets the shared alarm only when its next wake is
// sooner, and a failed check tries again in a day.
export async function aiWake(
  env: Env,
  meter: Meter,
  storage: DurableObjectStorage,
  site: GapSite,
): Promise<void> {
  const run = meter.one<{ status: string }>('SELECT status FROM run')
  if (run?.status === 'running') return
  let at: number | null
  try {
    const accounts = await accountsOf(env, site.user_id)
    at = await runAiCheck(env, meter, site, directory(env, accounts))
  } catch {
    at = Date.now() + DAY_MS
    saveState(meter, { next_at: at })
  }
  await flushUnmetered(env, meter, site.user_id)
  const state = aiState(meter)
  if (state?.checked_at || state?.blocked) {
    await env.DB.prepare(
      'UPDATE audit_sites SET ai_answers = ? WHERE user_id = ? AND property = ?',
    )
      .bind(
        JSON.stringify(aiResult(meter, site.property)),
        site.user_id,
        site.property,
      )
      .run()
      .catch(() => null)
  }
  if (at === null) return
  const current = await storage.getAlarm().catch(() => null)
  if (current === null || at < current) await storage.setAlarm(at)
}
