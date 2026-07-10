import { normalizeText } from './shared.js'

const QUESTION_START =
  /^(?:how|what|why|when|where|who|which|can|could|do|does|is|are|should|would)\b/i
const LEADING_QUESTION =
  /^(?:(?:how\s+(?:many|much)|what|which|who|why|when|where)\s+(?:do|does|did|is|are|can|could|should|would)?|how\s+to|can|could|do|does|did|is|are|should|would)\s+/i
const LEADING_CHOICE =
  /^how\s+(?:(?:do|can|should|would)\s+(?:i|we|you|someone)\s+|to\s+)(?:choose|find|pick|use|compare)\s+/i
const LEADING_DECISION =
  /^(?:can|could|do|does|did|should|would)\s+(?:i|we|you|someone|they|he|she)\s+(?:use|choose|buy|get|try|consider|pick|find|hire)\s+/i
const COMMERCIAL_TERM = /\b(?:best|vs|versus|reviews?|worth|alternatives?)\b/
const PRICE_TERM = /\b(?:price|cost|salary|rate|fee|fees)\b/
const REVIEW_TERM = /\b(?:review|reviews|worth)\b/

function compactQuery(query: string): string {
  return query.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function querySubject(query: string): string {
  const compact = compactQuery(query)
  const subject = compact
    .replace(LEADING_CHOICE, '')
    .replace(LEADING_DECISION, '')
    .replace(LEADING_QUESTION, '')
    .replace(/^(?:the\s+)?(?:best|top\s+\d+)\s+/i, '')
    .replace(/^(?:reviews?)(?:\s+(?:of|for))?\s+/i, '')
    .replace(/\s+(?:reviews?|worth\s+it)$/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  return subject || compact.replace(/[?.!]+$/, '')
}

function comparisonParts(query: string): [string, string] | undefined {
  const parts = compactQuery(query)
    .replace(/[?.!]+$/, '')
    .split(/\s+(?:vs\.?|versus)\s+/i)
    .map((part) => part.trim())
  return parts.length === 2 && parts[0] && parts[1]
    ? [parts[0], parts[1]]
    : undefined
}

export function aiPromptsForQuery(query: string): string[] {
  const compact = compactQuery(query)
  if (!compact) return []
  const normalized = normalizeText(compact)
  const subject = querySubject(compact)
  const comparison = comparisonParts(compact)
  const prompts = new Set<string>()

  if (QUESTION_START.test(compact)) {
    prompts.add(`${compact.replace(/[?.!]+$/, '')}?`)
  }
  prompts.add(`What should someone know about ${subject}?`)
  prompts.add(`Explain ${subject}, including key facts and caveats.`)
  if (/\bbest\b/.test(normalized)) {
    prompts.add(
      `Which ${subject} options are strongest for different needs, and why?`,
    )
  }
  if (comparison) {
    prompts.add(
      `Compare ${comparison[0]} and ${comparison[1]}, including tradeoffs and use-case fit.`,
    )
  }
  if (PRICE_TERM.test(normalized)) {
    prompts.add(`What factors determine ${subject}?`)
  }
  if (REVIEW_TERM.test(normalized)) {
    prompts.add(
      `Is ${subject} worth considering? Include evidence, pros, cons, and alternatives.`,
    )
  }
  prompts.add(
    COMMERCIAL_TERM.test(normalized)
      ? `What criteria should someone use to evaluate ${subject}?`
      : `What evidence or data supports claims about ${subject}?`,
  )
  return [...prompts].slice(0, 5)
}
