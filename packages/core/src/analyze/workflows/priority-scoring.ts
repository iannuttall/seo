import type { QueryContentClassification } from '../../types.js'
import type { PriorityQueueItem } from './types.js'

export type PriorityCategory =
  | 'technical'
  | 'content'
  | 'serp'
  | 'authority'
  | 'strategy'

export type PriorityScoreInput = {
  source: PriorityQueueItem['source']
  impact: number
  confidence: PriorityQueueItem['confidence']
  effort?: 'S' | 'M' | 'L'
  verification?: QueryContentClassification
  templateCount?: number
  analyticsSessions?: number
}

const SOURCE_WEIGHT: Record<PriorityQueueItem['source'], number> = {
  decay: 1.25,
  'quick-win': 1.15,
  'striking-distance': 1,
  cannibalization: 0.9,
  diagnosis: 0.75,
  template: 1.35,
}

const CONFIDENCE_WEIGHT = {
  high: 1.2,
  medium: 1,
  low: 0.7,
} as const

const EFFORT_WEIGHT = {
  S: 1.15,
  M: 1,
  L: 0.8,
} as const

const VERIFICATION_WEIGHT: Record<QueryContentClassification, number> = {
  'technical-check': 1.25,
  'content-gap': 1.2,
  'serp-framing': 1.1,
  covered: 0.85,
  'fetch-failed': 0.7,
}

function boundedLogScore(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(100, Math.log1p(value) * 12)
}

function templateLeverage(count = 1): number {
  if (count <= 1) return 1
  return Math.min(1.6, 1 + Math.log1p(count - 1) / 8)
}

function analyticsBoost(sessions = 0): number {
  if (sessions <= 0) return 1
  return Math.min(1.35, 1 + Math.log1p(sessions) / 30)
}

export function priorityCategory(
  source: PriorityQueueItem['source'],
  verification?: QueryContentClassification,
): PriorityCategory {
  if (verification === 'technical-check') return 'technical'
  if (verification === 'content-gap') return 'content'
  if (verification === 'serp-framing' || verification === 'covered') {
    return 'serp'
  }
  if (source === 'cannibalization') return 'authority'
  if (source === 'template') return 'strategy'
  if (source === 'diagnosis') return 'strategy'
  return source === 'decay' ? 'content' : 'serp'
}

export function scorePriority(input: PriorityScoreInput) {
  const impact = boundedLogScore(input.impact)
  const source = SOURCE_WEIGHT[input.source]
  const confidence = CONFIDENCE_WEIGHT[input.confidence]
  const effort = EFFORT_WEIGHT[input.effort ?? 'M']
  const verification = input.verification
    ? VERIFICATION_WEIGHT[input.verification]
    : 1
  const template = templateLeverage(input.templateCount)
  const analytics = analyticsBoost(input.analyticsSessions)
  const final = impact * source * confidence * effort * verification * template
  return {
    impact: Number(impact.toFixed(2)),
    source: Number(source.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    effort: Number(effort.toFixed(2)),
    verification: Number(verification.toFixed(2)),
    template: Number(template.toFixed(2)),
    analytics: Number(analytics.toFixed(2)),
    final: Number(final.toFixed(2)),
  }
}
