import { type AiQueryKind, aiQueryKind, QUESTION } from './ai-queries.js'

// What kind of search a query is, so reports can say which of their rows are
// questions, comparisons or AI-style searches. Each label uses the one
// definition the rest of SEO Skill uses: the comparison intent of content
// optimization, the askable question of ai_answers and the AI query kinds.

export const COMPARISON =
  /\b(vs|versus|alternative|alternatives|compare|comparison|best)\b/

export type QueryShape = 'comparison' | 'question' | AiQueryKind

export function queryShape(query: string): QueryShape | null {
  const text = query.trim().toLowerCase()
  if (COMPARISON.test(text)) return 'comparison'
  const kind = aiQueryKind(text)
  // Replies, follow-ups, operators and agent text say more than "question".
  if (kind && kind !== 'chat' && kind !== 'long') return kind
  if (QUESTION.test(text)) return 'question'
  return kind
}

// "9 of 40 queries: question 6, comparison 3", or null when none match.
export function queryShapeLine(queries: string[]): string | null {
  const counts = new Map<QueryShape, number>()
  for (const query of queries) {
    const shape = queryShape(query)
    if (shape) counts.set(shape, (counts.get(shape) ?? 0) + 1)
  }
  if (!counts.size) return null
  const shaped = [...counts.values()].reduce((sum, n) => sum + n, 0)
  const parts = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([shape, n]) => `${shape} ${n}`)
  return `Query shapes, ${shaped} of ${queries.length} queries: ${parts.join(', ')}.`
}
