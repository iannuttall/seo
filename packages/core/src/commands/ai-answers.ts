import { aiQueriesReport } from '../analyze/ai-queries.js'
import { deriveBrandTerms, isBrandQuery, registrableDomain } from '../brand.js'
import type { Detail } from './present.js'
import {
  dataForSeoKeys,
  dataForSeoMarket,
  dataForSeoTask,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { dateWindow } from './shared.js'
import { type CommandDeps, CommandError, type CommandResult } from './types.js'

// Whether AI answers cite or mention a site, for the questions people
// already ask AI about it: the top AI-shaped questions in the site's own
// Search Console, never questions the agent writes. One live answer per
// question and engine, from the person's own DataForSEO account.

export const AI_ANSWER_QUESTIONS = 10
const QUESTION_DAYS = 90
// Only questions that make sense on their own. Replies such as "yes",
// follow-ups, tracker probes, agent prompt text and search operators need
// the conversation or the search box they came from.
const ASKABLE = new Set(['chat', 'long'])
const PROMPT_CHARACTERS = 500

// What an engine showed: the answer as Markdown, the URLs it cited (never
// pages it only looked at), and the model DataForSEO says answered.
type Shown = { markdown: string; sources: string[]; model: string | null }

type Engine = {
  name: string
  // What the engine name means here, for the notes.
  means: string
  path: string
  task: (question: string, country: string) => Record<string, unknown>
  // What the engine showed, or null when it showed no AI answer.
  shown: (result: Record<string, unknown>) => Shown | null
}

type Item = Record<string, unknown>
const list = (value: unknown) => (Array.isArray(value) ? (value as Item[]) : [])
const urls = (items: Item[]) =>
  items.map((item) => item.url).filter((url) => typeof url === 'string')

// Google AI Mode and AI Overviews: the ai_overview block, its Markdown, and
// the references on it and on each of its parts.
const overview = (result: Item): Shown | null => {
  const block = list(result.items).find((item) => item.type === 'ai_overview')
  if (!block) return null
  const parts = list(block.items)
  return {
    markdown:
      typeof block.markdown === 'string'
        ? block.markdown
        : parts.map((part) => String(part.markdown ?? '')).join('\n'),
    sources: urls([
      ...list(block.references),
      ...parts.flatMap((part) => list(part.references)),
    ]),
    model: null,
  }
}

const ENGINES: Engine[] = [
  {
    name: 'chatgpt',
    means: 'a ChatGPT search, read by DataForSEO',
    path: 'v3/ai_optimization/chat_gpt/llm_scraper/live/advanced',
    task: (question, country) => ({
      keyword: question,
      ...dataForSeoMarket(country, null),
    }),
    shown: (result) => {
      const markdown =
        typeof result.markdown === 'string' ? result.markdown : ''
      const sources = urls(list(result.sources))
      if (!markdown && !sources.length) return null
      return {
        markdown,
        sources,
        model: typeof result.model === 'string' ? result.model : null,
      }
    },
  },
  {
    name: 'google_ai_mode',
    means: 'Google AI Mode',
    path: 'v3/serp/google/ai_mode/live/advanced',
    task: (question, country) => ({
      keyword: question,
      ...dataForSeoMarket(country, null),
    }),
    shown: overview,
  },
  {
    name: 'google_ai_overview',
    means: 'the AI Overview on a Google search',
    path: 'v3/serp/google/organic/live/advanced',
    task: (question, country) => ({
      keyword: question,
      depth: 10,
      load_async_ai_overview: true,
      ...dataForSeoMarket(country, null),
    }),
    shown: overview,
  },
]

// The answer's own words: citation pills such as [1](url) or
// [example.com](url) and bare links go, so a citation is never also counted
// as a mention by name.
function prose(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\(https?:\/\/[^)]*\)/g, (_, label: string) =>
      /^\s*(\d+|[\w-]+(\.[\w-]+)+)\s*$/.test(label) ? ' ' : label,
    )
    .replace(/https?:\/\/\S+/g, ' ')
}

function onSite(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === domain || host.endsWith(`.${domain}`)
  } catch {
    return false
  }
}

type Answer = {
  result: 'cited' | 'mentioned' | 'neither' | 'no_answer' | 'unavailable'
  // The model DataForSEO reports for the answer, when it reports one.
  model: string | null
  cited_url: string | null
  answered_at: string | null
  cost_usd: number
  error?: string
}

async function ask(
  keys: string[],
  engine: Engine,
  question: string,
  country: string,
  site: { domain: string; terms: string[] },
): Promise<Answer> {
  try {
    const done = await dataForSeoTask(
      keys,
      engine.path,
      engine.task(question, country),
    )
    const answered = {
      answered_at: String(done.result?.datetime ?? '').slice(0, 10) || null,
      cost_usd: done.cost,
    }
    const shown = done.result && engine.shown(done.result)
    if (!shown) {
      return { result: 'no_answer', model: null, cited_url: null, ...answered }
    }
    const base = { model: shown.model, ...answered }
    // Links written into the answer count as sources too.
    const linked = shown.markdown.match(/https?:\/\/[^\s)\]]+/g) ?? []
    const cited = [...shown.sources, ...linked].find((url) =>
      onSite(url, site.domain),
    )
    if (cited) return { result: 'cited', cited_url: cited, ...base }
    const text = prose(shown.markdown)
    const mentioned =
      text.toLowerCase().includes(site.domain) || isBrandQuery(text, site.terms)
    return {
      result: mentioned ? 'mentioned' : 'neither',
      cited_url: null,
      ...base,
    }
  } catch (error) {
    // A missing or rejected key stops the run; one engine failing does not.
    if (error instanceof CommandError && error.code === 'NO_KEY') throw error
    return {
      result: 'unavailable',
      model: null,
      cited_url: null,
      answered_at: null,
      cost_usd: 0,
      error: error instanceof Error ? error.message.slice(0, 200) : 'failed',
    }
  }
}

const usd = (value: number) => Math.round(value * 10_000) / 10_000

export async function runAiAnswers(
  input: {
    site: string
    country: string
    detail: Detail
    offset: number
  },
  headers: Headers,
  deps: CommandDeps,
  more: (offset: number) => string,
): Promise<CommandResult> {
  const keys = dataForSeoKeys(headers)
  const domain = registrableDomain(input.site)?.domain
  if (!domain) {
    throw new CommandError(
      'INVALID_INPUT',
      `ai_answers needs a site with a domain, not "${input.site}".`,
    )
  }
  const range = dateWindow({}, QUESTION_DAYS)
  const report = await aiQueriesReport(
    { site: input.site, ...range },
    deps.searchAnalytics,
  )
  const items = (report.items ?? []) as {
    query: string
    kind: string
    impressions: number
  }[]
  const questions = items
    .filter(
      (item) =>
        ASKABLE.has(item.kind) && item.query.length <= PROMPT_CHARACTERS,
    )
    .slice(0, AI_ANSWER_QUESTIONS)
  const site = { domain, terms: deriveBrandTerms({ siteUrl: input.site }) }
  const answers = await Promise.all(
    questions.flatMap((question) =>
      ENGINES.map(async (engine) => ({
        question: question.query,
        impressions: question.impressions,
        engine: engine.name,
        ...(await ask(keys, engine, question.query, input.country, site)),
      })),
    ),
  )
  const cost = usd(answers.reduce((sum, row) => sum + row.cost_usd, 0))
  const count = (result: Answer['result']) =>
    answers.filter((row) => row.result === result).length
  const notes = [
    questions.length
      ? `The top ${questions.length} chat-style and long questions in Search Console’s AI-shaped queries for ${range.startDate} to ${range.endDate}, by impressions. No calls were made for other questions.`
      : `No chat-style or long questions in Search Console’s AI-shaped queries for ${range.startDate} to ${range.endDate}, so no answers were checked and nothing was spent.`,
    ...(questions.length
      ? [
          `Cited ${count('cited')}, mentioned ${count('mentioned')}, neither ${count('neither')}, no answer shown ${count('no_answer')}, unavailable ${count('unavailable')}. DataForSEO cost: $${cost}.`,
          'Each row is one sample of an answer that changes from run to run, not a ranking.',
          `cited: the answer lists or links a page on ${domain} or a subdomain. mentioned: no such source, but the answer text names ${[domain, ...site.terms].join(' or ')}, a text match. no_answer: the engine showed no AI answer for the question. model: the model DataForSEO reports for the answer, when it reports one.`,
          `Engines: ${ENGINES.map((engine) => `${engine.name} is ${engine.means}`).join('; ')}.`,
        ]
      : []),
  ]
  return {
    text: rowsText({
      title: `AI answers for ${input.site}, ${input.country}.`,
      rows: answers,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes,
      more,
    }),
    data: {
      provider: 'dataforseo',
      action: 'ai_answers',
      site: input.site,
      country: input.country,
      questionsFrom: { section: 'ai-queries', ...range },
      questions: questions.map((question) => question.query),
      costUsd: cost,
      total: answers.length,
      offset: input.offset,
      rows: answers.slice(input.offset, input.offset + PAGE_SIZE),
    },
  }
}
