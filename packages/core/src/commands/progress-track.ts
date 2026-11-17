import { registrableDomain } from '../brand.js'
import { runAiAnswers } from './ai-answers.js'
import { contextDefinition } from './progress.js'
import type { ProgressDefinition } from './progress-data.js'
import { type ResearchDevice, research } from './research-providers.js'
import type { ToolSurface } from './tools.js'
import { type CommandDeps, CommandError, type CommandResult } from './types.js'

// A site's tracking runs: the live Google positions of its tracked searches
// and the AI answers to its questions, for the site and its competitors,
// kept on each check so they can be charted from the first on (progress.ts).

// Results read per tracked keyword.
export const TRACK_DEPTH = 30
// Runs kept per site and kind: five years of weekly checks.
export const TRACK_RUNS = 260

const fail = (message: string) => new CommandError('INVALID_INPUT', message)
const now = (deps: CommandDeps) => deps.now?.() ?? new Date()

type AnswerResult = string

export type KeywordRun = {
  kind: 'keywords'
  country: string
  device: ResearchDevice
  depth: number
  cost_usd: number | null
  results: {
    keyword: string
    // The site's best organic position, null when it is not in the top
    // depth results; competitors' the same way, by domain.
    position: number | null
    url: string | null
    competitors: Record<string, number | null>
  }[]
  // Keywords the provider failed on or had no results for: unknown, not
  // "not ranking".
  missed: string[]
}

export type AnswerRun = {
  kind: 'ai_answers'
  country: string
  cost_usd: number
  answers: {
    question: string
    engine: string
    // The result for the site, then each competitor by domain.
    result: AnswerResult
    cited_url: string | null
    competitors: Record<string, AnswerResult>
    // A queued answer not read yet, as an ai_answers task.
    task: string | null
  }[]
}

export type ProgressRun = { id: string; ran_at: string } & (
  | KeywordRun
  | AnswerRun
)

// Track

const ownDomain = (site: string) => {
  const domain = registrableDomain(site)?.domain
  if (!domain) throw fail(`${site} has no domain to track.`)
  return domain
}

const onDomain = (host: string, domain: string) => {
  const bare = host.toLowerCase().replace(/^www\./, '')
  return bare === domain || bare.endsWith(`.${domain}`)
}

// Checks the site's tracked searches in Google (serp) or its AI questions
// (ai_answers) for the site and its competitors, and keeps the run beside
// its progress points. seo research runs it when asked for serp or
// ai_answers on a site whose business context lists them. Answers the last
// run was still waiting for are read back first, at no cost, and nothing
// new is asked until they are in. One run of each kind is kept a day.
export async function trackProgress(
  input: {
    site: string
    kind: ProgressRun['kind']
    definition: ProgressDefinition
    country: string
    device?: ResearchDevice
  },
  deps: CommandDeps,
  headers: Headers,
): Promise<CommandResult> {
  const { site, kind, definition, country } = input
  const store = deps.siteProgress
  if (!store) throw fail('Progress is not kept on this surface.')
  const runs = await store.runs(site)
  const ranAt = now(deps).toISOString()
  const today = ranAt.slice(0, 10)
  const mine = runs.filter((run) => run.kind === kind)
  const last = mine.at(-1)
  const show = (lines: string[], all: ProgressRun[], saved: ProgressRun[]) => ({
    text: [...lines, '', ...runsText(definition, all, kind)].join('\n'),
    data: { site, kind, runs: saved },
  })

  if (last?.kind === 'ai_answers' && last.answers.some((a) => a.task)) {
    const queued = last.answers.filter((a) => a.task)
    const read = await askAnswers(site, definition, country, headers, deps, {
      tasks: queued.map((a) => a.task as string),
    })
    const byKey = new Map(
      read.answers.map((a) => [`${a.question}|${a.engine}`, a]),
    )
    const run: ProgressRun = {
      ...last,
      answers: last.answers.map((a) =>
        a.task ? (byKey.get(`${a.question}|${a.engine}`) ?? a) : a,
      ),
    }
    await store.saveRun(site, run)
    const left =
      run.kind === 'ai_answers' ? run.answers.filter((a) => a.task).length : 0
    return show(
      [
        `Read back the ${queued.length} AI answers the check of ${last.ran_at.slice(0, 10)} was still waiting for, at no cost.${left ? ` ${left} still not ready; ask again in a minute.` : ''}`,
      ],
      [...runs.filter((r) => r.id !== run.id), run],
      [run],
    )
  }
  if (last?.ran_at.slice(0, 10) === today) {
    return show(
      [
        `${kind === 'keywords' ? 'Tracked searches were' : 'AI questions were'} already checked today; one check a day is kept, so nothing was spent again.`,
      ],
      runs,
      [],
    )
  }
  if (mine.length >= TRACK_RUNS) {
    throw fail(
      `${site} already keeps ${TRACK_RUNS} checks of this kind, the most it keeps.`,
    )
  }
  const body =
    kind === 'keywords'
      ? await trackKeywords(
          site,
          definition,
          country,
          input.device ?? 'desktop',
          headers,
        )
      : await askAnswers(site, definition, country, headers, deps, {
          questions: definition.questions,
        })
  const run = { id: `${kind}-${ranAt}`, ran_at: ranAt, ...body } as ProgressRun
  await store.saveRun(site, run)
  return show(
    [
      `Kept this check for ${site} on ${today}, beside its progress. DataForSEO cost: $${Math.round((run.cost_usd ?? 0) * 10_000) / 10_000}.`,
    ],
    [...runs, run],
    [run],
  )
}

async function trackKeywords(
  site: string,
  definition: ProgressDefinition,
  country: string,
  device: ResearchDevice,
  headers: Headers,
): Promise<KeywordRun> {
  const keywords = definition.searches ?? []
  const domain = ownDomain(site)
  const competitors = (definition.competitors ?? []).map((c) => c.domain)
  // serp reads five keywords a call.
  const chunks: string[][] = []
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5))
  }
  const reads = await Promise.all(
    chunks.map((chunk) =>
      research('dataforseo', headers, {
        action: 'serp',
        keywords: chunk,
        target: '',
        country,
        device,
        depth: TRACK_DEPTH,
        noRank: true,
        limit: TRACK_DEPTH,
      }),
    ),
  )
  const rows = reads.flatMap((read) => read.rows)
  const missed = new Set(
    reads.flatMap((read) => [...read.missed, ...read.noData]),
  )
  const best = (keyword: string, target: string) =>
    rows
      .filter(
        (row) =>
          row.keyword === keyword &&
          typeof row.position === 'number' &&
          onDomain(String(row.domain ?? ''), target),
      )
      .sort((a, b) => Number(a.position) - Number(b.position))[0]
  return {
    kind: 'keywords',
    country,
    device,
    depth: TRACK_DEPTH,
    cost_usd: reads.some((read) => read.costUsd === null)
      ? null
      : reads.reduce((sum, read) => sum + (read.costUsd ?? 0), 0),
    missed: keywords.filter((k) => missed.has(k)),
    results: keywords
      .filter((k) => !missed.has(k))
      .map((keyword) => {
        const own = best(keyword, domain)
        return {
          keyword,
          position: own ? Number(own.position) : null,
          url: own ? (own.url as string | null) : null,
          competitors: Object.fromEntries(
            competitors.map((c) => {
              const row = best(keyword, c)
              return [c, row ? Number(row.position) : null]
            }),
          ),
        }
      }),
  }
}

async function askAnswers(
  site: string,
  definition: ProgressDefinition,
  country: string,
  headers: Headers,
  deps: CommandDeps,
  ask: { questions?: string[]; tasks?: string[] },
): Promise<AnswerRun> {
  const result = await runAiAnswers(
    {
      site: ownDomain(site),
      country,
      detail: 'full',
      offset: 0,
      questions: ask.questions,
      tasks: ask.tasks,
      brand: [],
      others: definition.competitors,
    },
    headers,
    deps,
    () => '',
  )
  const data = result.data as {
    costUsd: number
    rows: {
      question: string
      engine: string
      result: AnswerResult
      cited_url: string | null
      others?: Record<string, AnswerResult>
      task: string | null
    }[]
  }
  return {
    kind: 'ai_answers',
    country,
    cost_usd: data.costUsd,
    answers: data.rows.map((row) => ({
      question: row.question,
      engine: row.engine,
      result: row.result,
      cited_url: row.cited_url,
      competitors: row.others ?? {},
      task: row.task,
    })),
  }
}

// What the runs show, first run against the latest.
export function runsText(
  definition: ProgressDefinition,
  runs: ProgressRun[],
  only?: ProgressRun['kind'],
): string[] {
  const lines: string[] = []
  const keywordRuns = runs.filter(
    (run): run is ProgressRun & KeywordRun =>
      run.kind === 'keywords' && only !== 'ai_answers',
  )
  const first = keywordRuns[0]
  const last = keywordRuns.at(-1)
  if (first && last) {
    const was = new Map(first.results.map((r) => [r.keyword, r]))
    const top = (run: KeywordRun, depth: number) =>
      run.results.filter((r) => r.position !== null && r.position <= depth)
        .length
    lines.push(
      keywordRuns.length > 1
        ? `Google positions, ${first.ran_at.slice(0, 10)} → ${last.ran_at.slice(0, 10)} (${last.country}, ${last.device}, top ${last.depth}; out is not in the top ${last.depth}):`
        : `Google positions on ${last.ran_at.slice(0, 10)} (${last.country}, ${last.device}, top ${last.depth}; out is not in the top ${last.depth}):`,
      `In the top 3: ${keywordRuns.length > 1 ? `${top(first, 3)} → ` : ''}${top(last, 3)}. Top 10: ${keywordRuns.length > 1 ? `${top(first, 10)} → ` : ''}${top(last, 10)}. Top ${last.depth}: ${keywordRuns.length > 1 ? `${top(first, last.depth)} → ` : ''}${top(last, last.depth)}, of ${last.results.length}.`,
      ...last.results.map((r) => {
        const before = was.get(r.keyword)
        const competitors = Object.entries(r.competitors)
          .filter(([, p]) => p !== null)
          .map(([domain, p]) => `${domain} ${p}`)
        return `- ${r.keyword}: ${keywordRuns.length > 1 ? `${before ? (before.position ?? 'out') : 'not checked'} → ` : ''}${r.position ?? 'out'}${r.url ? ` (${r.url})` : ''}${competitors.length ? `; ${competitors.join(', ')}` : ''}`
      }),
      ...(last.missed.length
        ? [
            `No result read for ${last.missed.join(', ')}: unknown, not "not ranking".`,
          ]
        : []),
    )
  }
  const answerRuns = runs.filter(
    (run): run is ProgressRun & AnswerRun =>
      run.kind === 'ai_answers' && only !== 'keywords',
  )
  const a1 = answerRuns[0]
  const a2 = answerRuns.at(-1)
  if (a1 && a2) {
    const domains = (definition.competitors ?? []).map((c) => c.domain)
    const counts = (run: AnswerRun) => appearances(run, domains)
    const before = counts(a1)
    const after = counts(a2)
    if (lines.length) lines.push('')
    lines.push(
      answerRuns.length > 1
        ? `AI answers citing or naming each site, ${a1.ran_at.slice(0, 10)} → ${a2.ran_at.slice(0, 10)}:`
        : `AI answers citing or naming each site on ${a2.ran_at.slice(0, 10)}:`,
      ...after.map((row, i) => {
        const was = before[i]
        return `- ${row.domain}: ${answerRuns.length > 1 && was ? `${was.appeared} of ${was.read} → ` : ''}${row.appeared} of ${row.read} (cited ${row.cited})`
      }),
      'Each answer is one sample and changes from run to run, so read the trend across runs, not one answer.',
    )
  }
  return lines
}

const READ = new Set(['cited', 'mentioned', 'neither', 'no_answer'])

// For the site and each competitor: answers read, and how many cite or
// name it.
function appearances(run: AnswerRun, competitors: string[]) {
  const read = run.answers.filter((a) => READ.has(a.result))
  const own = {
    domain: 'this site',
    read: read.length,
    cited: read.filter((a) => a.result === 'cited').length,
    appeared: read.filter(
      (a) => a.result === 'cited' || a.result === 'mentioned',
    ).length,
  }
  return [
    own,
    ...competitors.map((domain) => {
      const results = read.map((a) => a.competitors[domain])
      return {
        domain,
        read: results.filter((r) => r && READ.has(r)).length,
        cited: results.filter((r) => r === 'cited').length,
        appeared: results.filter((r) => r === 'cited' || r === 'mentioned')
          .length,
      }
    }),
  ]
}

// Whether seo research for serp or ai_answers on a site with no keywords
// checks the tracked searches (serp) or AI questions (ai_answers) its
// business context lists, which it then keeps as progress.
export async function tracksProgress(
  action: string,
  site: string,
  deps: CommandDeps,
): Promise<ProgressDefinition | null> {
  if (!deps.siteProgress || !deps.context) return null
  if (action !== 'serp' && action !== 'ai_answers') return null
  const context = await deps.context.read(site)
  if (!context) return null
  const { definition } = contextDefinition(site, context)
  const list = action === 'serp' ? definition.searches : definition.questions
  return list?.length ? definition : null
}

// seo research's progress check: null when tracksProgress says no, so seo
// research runs as usual.
export async function researchProgress(
  input: {
    action: string
    target: string
    keywords: string[]
    tasks?: string[]
    // ai_answers with competitors reads cited pages instead.
    competitors?: string[]
    country: string
    device?: ResearchDevice
  },
  surface: Pick<ToolSurface, 'deps' | 'resolveSite' | 'keys'>,
): Promise<CommandResult | null> {
  const asked = [input.keywords, input.tasks, input.competitors]
  if (!input.target || asked.some((list) => list?.length)) {
    return null
  }
  const site = await surface.resolveSite(input.target).catch(() => null)
  const deps = surface.deps
  const definition = site && (await tracksProgress(input.action, site, deps))
  if (!site || !definition) return null
  const headers = await surface.keys()
  return trackProgress(
    {
      site,
      kind: input.action === 'serp' ? 'keywords' : 'ai_answers',
      definition,
      country: input.country,
      device: input.device,
    },
    deps,
    headers,
  )
}
