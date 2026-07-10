import { normalizeText } from './shared.js'

export type CommunityIntent =
  | 'forum/reddit'
  | 'comparison'
  | 'reviews'
  | 'experience'
  | 'recommendation'

export type CommunityIntentClassification = {
  intent: CommunityIntent
  signals: CommunityIntent[]
  matchedTerms: string[]
  confidence: 'low'
  method: 'query-language-heuristic'
  action: string
}

type IntentPattern = {
  intent: CommunityIntent
  patterns: Array<{ regex: RegExp; label: string }>
  action: string
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'forum/reddit',
    patterns: [
      { regex: /\breddit\b/, label: 'reddit' },
      { regex: /\bforums?\b/, label: 'forum' },
    ],
    action:
      'Retrieve the page or pages associated with this query. If relevant pages lack practical first-party detail, add evidence, examples, and limitations without imitating forum posts.',
  },
  {
    intent: 'comparison',
    patterns: [
      { regex: /\S+\s+vs\.?\s+\S+/, label: 'vs' },
      { regex: /\S+\s+versus\s+\S+/, label: 'versus' },
      {
        regex: /\balternatives?\s+to\b|\balternatives?\s*$/,
        label: 'alternative comparison',
      },
    ],
    action:
      'Retrieve the page or pages associated with this query. If relevant pages do not satisfy comparison intent, explain criteria, tradeoffs, alternatives, and which situations fit each option.',
  },
  {
    intent: 'reviews',
    patterns: [
      { regex: /\breviews?\b/, label: 'review' },
      { regex: /\bcomplaints?\b/, label: 'complaint' },
      { regex: /\bworth\s+it\b/, label: 'worth it' },
    ],
    action:
      'Retrieve the page or pages associated with this query. If relevant pages do not satisfy review intent, add original evidence, pros, cons, limitations, and suitable alternatives.',
  },
  {
    intent: 'experience',
    patterns: [
      { regex: /\bfirst[ -]?hand\b/, label: 'first-hand' },
      { regex: /\bmy\s+experience(?:\s+with)?\b/, label: 'my experience' },
      { regex: /\bexperience\s+with\b/, label: 'experience with' },
      { regex: /\bpeople\s+say\b/, label: 'people say' },
      { regex: /\breal\s+users?\b/, label: 'real user' },
      { regex: /\buser\s+opinions?\b/, label: 'user opinion' },
    ],
    action:
      'Retrieve the page or pages associated with this query. If relevant pages do not satisfy experience-seeking intent, add genuine first-party examples, methodology, and clearly stated limitations.',
  },
  {
    intent: 'recommendation',
    patterns: [
      { regex: /\bbest\b/, label: 'best' },
      {
        regex: /\brecommend(?:ed|ation|ations|ing)?\b/,
        label: 'recommendation',
      },
      { regex: /\btop\s+\d+\b/, label: 'ranked list' },
    ],
    action:
      'Retrieve the page or pages associated with this query. If relevant pages do not satisfy recommendation intent, make selection criteria, evidence, tradeoffs, and use-case fit explicit.',
  },
]

export function classifyCommunityIntent(
  query: string,
): CommunityIntentClassification | undefined {
  const normalized = normalizeText(query)
  const matches = INTENT_PATTERNS.map((pattern) => ({
    pattern,
    terms: pattern.patterns
      .filter(({ regex }) => regex.test(normalized))
      .map(({ label }) => label),
  })).filter(({ terms }) => terms.length > 0)
  const primary = matches[0]
  if (!primary) return undefined
  return {
    intent: primary.pattern.intent,
    signals: matches.map(({ pattern }) => pattern.intent),
    matchedTerms: matches.flatMap(({ terms }) => terms),
    confidence: 'low',
    method: 'query-language-heuristic',
    action: primary.pattern.action,
  }
}
