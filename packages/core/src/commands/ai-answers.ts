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
const CHATGPT_MODEL = 'gpt-4.1-mini'
const PERPLEXITY_MODEL = 'sonar'

type Engine = {
  name: string
  // What the engine name means here, for the notes.
  means: string
  path: string
  task: (question: string, country: string) => Record<string, unknown>
  // The parts of a result that are the answer, or null when none was shown.
  answer: (result: Record<string, unknown>) => unknown[] | null
}

const llm = (model: string) => (question: string, country: string) => ({
  user_prompt: question,
  model_name: model,
  web_search: true,
  web_search_country_iso_code: country.toUpperCase(),
  max_output_tokens: 1024,
})

const messages = (result: Record<string, unknown>) => {
  const items = (result.items as unknown[] | null) ?? []
  return items.length ? items : null
}

const overviews = (result: Record<string, unknown>) => {
  const items = (
    (result.items as Record<string, unknown>[] | null) ?? []
  ).filter((item) => item.type === 'ai_overview')
  return items.length ? items : null
}

const ENGINES: Engine[] = [
  {
    name: 'chatgpt',
    means: `OpenAI's ${CHATGPT_MODEL} API with web search, not the ChatGPT app`,
    path: 'v3/ai_optimization/chat_gpt/llm_responses/live',
    task: (question, country) => ({
      ...llm(CHATGPT_MODEL)(question, country),
      force_web_search: true,
    }),
    answer: messages,
  },
  {
    name: 'perplexity',
    means: `Perplexity's ${PERPLEXITY_MODEL} API, which always searches the web`,
    path: 'v3/ai_optimization/perplexity/llm_responses/live',
    task: (question, country) => {
      const { web_search: _, ...task } = llm(PERPLEXITY_MODEL)(
        question,
        country,
      )
      return task
    },
    answer: messages,
  },
  {
    name: 'google_ai_mode',
    means: 'Google AI Mode',
    path: 'v3/serp/google/ai_mode/live/advanced',
    task: (question, country) => ({
      keyword: question,
      ...dataForSeoMarket(country, null),
    }),
    answer: overviews,
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
    answer: overviews,
  },
]

// Each source URL and each piece of answer text in a result. Text quoted
// from sources (annotations, references) is not the answer's own text.
function parts(
  value: unknown,
  urls: string[],
  text: string[],
  key = '',
  quoted = false,
) {
  if (typeof value === 'string') {
    if (key === 'url') urls.push(value)
    else if (!quoted && (key === 'text' || key === 'markdown')) text.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) parts(item, urls, text, key, quoted)
  } else if (value && typeof value === 'object') {
    for (const [child, item] of Object.entries(value)) {
      const source = child === 'annotations' || child === 'references'
      parts(item, urls, text, child, quoted || source)
    }
  }
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
    const answer = done.result && engine.answer(done.result)
    if (!answer) return { result: 'no_answer', cited_url: null, ...answered }
    const urls: string[] = []
    const text: string[] = []
    parts(answer, urls, text)
    // Links written into the answer text count as citations, not names.
    const link = /https?:\/\/[^\s)\]]+/g
    let all = text.join('\n')
    urls.push(...(all.match(link) ?? []))
    all = all.replace(link, ' ')
    const cited = urls.find((url) => onSite(url, site.domain))
    if (cited) return { result: 'cited', cited_url: cited, ...answered }
    const mentioned =
      all.toLowerCase().includes(site.domain) || isBrandQuery(all, site.terms)
    return {
      result: mentioned ? 'mentioned' : 'neither',
      cited_url: null,
      ...answered,
    }
  } catch (error) {
    // A missing or rejected key stops the run; one engine failing does not.
    if (error instanceof CommandError && error.code === 'NO_KEY') throw error
    return {
      result: 'unavailable',
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
          `cited: a source link to ${domain} or a subdomain. mentioned: no link, but the answer text names ${[domain, ...site.terms].join(' or ')}, a text match. no_answer: the engine showed no AI answer for the question.`,
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
