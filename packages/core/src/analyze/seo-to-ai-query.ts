import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { defaultDateRange, normalizeText, tokenize } from './shared.js'

export type SeoToAiQueryReport = {
  site: string
  generatedAt: string
  rangeDays: number
  summary: {
    sourceQueries: number
    prompts: number
  }
  items: Array<{
    query: string
    clicks: number
    impressions: number
    position: number
    prompts: string[]
  }>
}

const QUESTION_STARTS = new Set([
  'how',
  'what',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can',
  'does',
  'is',
  'are',
  'should',
])

function compactQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

function querySubject(query: string): string {
  let subject = normalizeText(query)
  subject = subject
    .replace(
      /^(how many|how much|how to choose|how to find|how to pick|how to|what is|what are|which is|which are|is|are|does|do|can|should)\s+/,
      '',
    )
    .trim()
  const tokens = tokenize(subject || query)
  if (tokens.length <= 8) return compactQuery(subject || query)
  return tokens.slice(0, 8).join(' ')
}

export function aiPromptsForQuery(query: string): string[] {
  const normalized = normalizeText(query)
  const first = normalized.split(' ')[0] ?? ''
  const subject = querySubject(query)
  const prompts = new Set<string>()

  if (QUESTION_STARTS.has(first)) {
    prompts.add(compactQuery(query).replace(/[?.!]*$/, '?'))
  }
  prompts.add(`What should someone know about ${subject}?`)
  prompts.add(`Explain ${subject}, including key facts and caveats.`)

  if (/\bbest\b/.test(normalized)) {
    prompts.add(
      `Which ${subject.replace(/\bbest\b/g, '').trim()} options are best and why?`,
    )
  }
  if (/\bvs\b|\bversus\b/.test(normalized)) {
    prompts.add(
      `Compare ${subject} and explain which is better for different situations.`,
    )
  }
  if (/\bprice|cost|salary|rate|fee\b/.test(normalized)) {
    prompts.add(`What does ${subject} cost, and what affects the price?`)
  }
  if (/\breview|reviews|worth\b/.test(normalized)) {
    prompts.add(`Is ${subject} worth it? Include pros, cons, and alternatives.`)
  }
  if (
    /\bbest\b|\bvs\b|\bversus\b|\breview|reviews|worth|alternative|alternatives\b/.test(
      normalized,
    )
  ) {
    prompts.add(`How do I choose the best ${subject}?`)
  } else {
    prompts.add(`What evidence or data supports ${subject}?`)
  }

  return [...prompts].slice(0, 5)
}

export async function seoToAiQueryReport(input: {
  site: string
  days?: number
  limit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<SeoToAiQueryReport> {
  const days = input.days ?? 28
  const range = defaultDateRange(days)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )
  const items = rows
    .map((row) => ({
      query: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    }))
    .filter(
      (item) =>
        item.query &&
        item.impressions >= (input.minImpressions ?? 20) &&
        !shouldExcludeBrandQuery({
          query: item.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, input.limit ?? 25)
    .map((item) => ({
      ...item,
      prompts: aiPromptsForQuery(item.query),
    }))

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    summary: {
      sourceQueries: items.length,
      prompts: items.reduce((sum, item) => sum + item.prompts.length, 0),
    },
    items,
  }
}
