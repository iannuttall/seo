import { runAiAnswers, type WeekAiAnswers } from '@seo/core/commands'
import { directory } from '../google.ts'
import { accountsOf } from '../store.ts'
import { addUnmetered, flushUnmetered } from '../usage.ts'
import type { Google } from './checks.ts'
import { type GapSite, included, topCountry } from './competitors.ts'
import type { Meter } from './meter.ts'

// The weekly audit's AI answer check, on SEO Skill's own DataForSEO
// account: once a week, the same questions from the site's Search Console
// are asked in ChatGPT search, Google AI Mode and AI Overviews (ai_answers
// in seo_research), and each answer's result is kept beside the one from
// the week before, so the summary can say which answers started or
// stopped citing the site. Only paid sites and unlimited-sites accounts
// get it. Spend is capped per site a month before each run.

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
// DataForSEO spend per site a month (UTC), and the worst case of one run
// of 10 questions on three engines (a run cost about $0.07 in testing).
export const AI_MONTH_BUDGET_USD = 1
const RUN_ESTIMATE_USD = 0.2
// How long a run waits for queued answers; the rest are read back, free,
// an hour later, for up to a day.
const WAIT_SECONDS = 120
const READ_BACK_SECONDS = 30
const MAX_CITED_SITES = 10
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
  -- JSON: the questions asked every week, fixed at the first check that
  -- found any.
  questions TEXT,
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
  -- JSON list of the other hosts the answer cites.
  sources TEXT NOT NULL DEFAULT '[]',
  previous_result TEXT,
  PRIMARY KEY (question, engine)
);
`

type State = {
  next_at: number | null
  month: string | null
  spent_usd: number
  checked_at: number | null
  previous_checked_at: number | null
  blocked: string | null
  questions: string | null
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
    country: null,
    pending: null,
    ...aiState(meter),
    ...fields,
  }
  meter.run(
    `INSERT INTO ai_state (id, next_at, month, spent_usd, checked_at, previous_checked_at, blocked, questions, country, pending)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET next_at = excluded.next_at, month = excluded.month,
       spent_usd = excluded.spent_usd, checked_at = excluded.checked_at,
       previous_checked_at = excluded.previous_checked_at, blocked = excluded.blocked,
       questions = excluded.questions, country = excluded.country, pending = excluded.pending`,
    next.next_at,
    next.month,
    next.spent_usd,
    next.checked_at,
    next.previous_checked_at,
    next.blocked,
    next.questions,
    next.country,
    next.pending,
  )
}

// The rows ai_answers returns with detail full.
type Answered = {
  question: string
  engine: string
  result: string
  cited_url: string | null
  sources: string[]
}
type AnswersData = {
  questions: string[]
  costUsd: number
  pendingTasks: string[]
  rows: Answered[]
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
  if (!(await included(env, site.user_id))) {
    saveState(meter, { next_at: now + DAY_MS })
    return now + DAY_MS
  }
  const headers = new Headers({
    'x-dataforseo-login': env.DATAFORSEO_LOGIN,
    'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
  })
  const search = google.searchAnalytics()
  const ask = async (input: {
    country: string
    questions?: string[]
    tasks?: string[]
    waitSeconds: number
  }) =>
    (
      await runAiAnswers(
        { site: site.property, detail: 'full', offset: 0, ...input },
        headers,
        { searchAnalytics: search },
        () => '',
      )
    ).data as AnswersData
  const store = (rows: Answered[], fresh: boolean) => {
    for (const row of rows) {
      const sources = JSON.stringify(row.sources ?? [])
      if (fresh) {
        meter.run(
          `INSERT INTO ai_answers (question, engine, result, cited_url, sources, previous_result)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT (question, engine) DO UPDATE SET previous_result = ai_answers.result,
             result = excluded.result, cited_url = excluded.cited_url, sources = excluded.sources`,
          row.question,
          row.engine,
          row.result,
          row.cited_url,
          sources,
        )
      } else {
        // A late answer replaces its own pending row and keeps the week
        // before.
        meter.run(
          'UPDATE ai_answers SET result = ?, cited_url = ?, sources = ? WHERE question = ? AND engine = ?',
          row.result,
          row.cited_url,
          sources,
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
  const { alpha3, country } = await topCountry(search, site.property)
  if (!country) {
    return block(
      `DataForSEO has no AI answer data for the country most of the site's clicks come from (${alpha3.toUpperCase()})`,
      now + WEEK_MS,
    )
  }
  const questions = state?.questions
    ? (JSON.parse(state.questions) as string[])
    : undefined
  let data: AnswersData
  try {
    data = await ask({ country, questions, waitSeconds: WAIT_SECONDS })
  } catch (error) {
    // Tasks may have been queued and paid for before the failure.
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
    // A question no longer asked leaves the comparison.
    meter.run(
      `DELETE FROM ai_answers WHERE question NOT IN (SELECT value FROM json_each(?))`,
      JSON.stringify(data.questions),
    )
    store(data.rows, true)
    saveState(meter, {
      month,
      spent_usd: spent + data.costUsd,
      previous_checked_at: state?.checked_at ?? null,
      checked_at: now,
      blocked: null,
      questions: JSON.stringify(data.questions),
      country,
      pending: data.pendingTasks.length
        ? JSON.stringify(data.pendingTasks)
        : null,
      next_at: data.pendingTasks.length ? now + HOUR_MS : now + WEEK_MS,
    })
  })
  return data.pendingTasks.length ? now + HOUR_MS : now + WEEK_MS
}

// The latest check for D1, in the weekly summary's shape.
export function aiResult(meter: Meter): WeekAiAnswers {
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
  const cites = new Map<string, number>()
  for (const row of rows) {
    const key = row.result as keyof typeof counts
    if (key in counts) counts[key] += 1
    for (const host of JSON.parse(row.sources) as string[]) {
      cites.set(host, (cites.get(host) ?? 0) + 1)
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
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_CITED_SITES)
      .map(([host, answers]) => ({ host, answers })),
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
      .bind(JSON.stringify(aiResult(meter)), site.user_id, site.property)
      .run()
      .catch(() => null)
  }
  if (at === null) return
  const current = await storage.getAlarm().catch(() => null)
  if (current === null || at < current) await storage.setAlarm(at)
}
