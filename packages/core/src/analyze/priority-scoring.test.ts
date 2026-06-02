import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  priorityCategory,
  scorePriority,
} from './workflows/priority-scoring.js'

test('scorePriority boosts template leverage and analytics value', () => {
  const base = scorePriority({
    source: 'quick-win',
    impact: 100,
    confidence: 'medium',
    verification: 'serp-framing',
  })
  const boosted = scorePriority({
    source: 'quick-win',
    impact: 100,
    confidence: 'medium',
    verification: 'serp-framing',
    templateCount: 20,
    analyticsSessions: 5000,
  })

  assert.ok(boosted.final > base.final)
  assert.ok(boosted.template > base.template)
  assert.ok(boosted.analytics > base.analytics)
})

test('priorityCategory follows verification before source defaults', () => {
  assert.equal(priorityCategory('quick-win', 'technical-check'), 'technical')
  assert.equal(priorityCategory('quick-win', 'content-gap'), 'content')
  assert.equal(priorityCategory('template'), 'strategy')
})
