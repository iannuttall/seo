import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupPriorityQueue } from './workflows/priority-grouping.js'
import type { PriorityQueueItem } from './workflows/types.js'

function item(input: Partial<PriorityQueueItem> = {}): PriorityQueueItem {
  return {
    source: input.source ?? 'quick-win',
    title: input.title ?? 'salary for plumber',
    target: input.target ?? 'https://example.com/a/',
    category: input.category ?? 'serp',
    score: input.score ?? 100,
    impact: input.impact ?? 100,
    confidence: input.confidence ?? 'medium',
    template: input.template ?? {
      id: 'salary-page',
      label: 'Salary page',
      count: 10,
    },
    analytics: input.analytics,
    scoreBreakdown: input.scoreBreakdown ?? {
      impact: 50,
      source: 1,
      confidence: 1,
      effort: 1,
      verification: 1,
      template: 1,
      analytics: 1,
      final: input.score ?? 100,
    },
    action:
      input.action ??
      'Main content already supports "salary for plumber"; test title wording.',
    evidence: input.evidence ?? 'Evidence.',
  }
}

test('groupPriorityQueue collapses repeated opportunity findings', () => {
  const grouped = groupPriorityQueue([
    item({ target: 'https://example.com/a/', score: 100, impact: 100 }),
    item({ target: 'https://example.com/b/', score: 90, impact: 80 }),
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0]?.grouped?.count, 2)
  assert.equal(grouped[0]?.grouped?.findings.length, 2)
  assert.match(grouped[0]?.action ?? '', /2 affected URLs/)
  assert.match(grouped[0]?.evidence ?? '', /Grouped 2 matching findings/)
})

test('groupPriorityQueue groups same query and category with different action text', () => {
  const grouped = groupPriorityQueue([
    item({ target: 'https://example.com/a/' }),
    item({
      target: 'https://example.com/b/',
      action: 'Add a content section for salary for plumber.',
    }),
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0]?.grouped?.count, 2)
})

test('groupPriorityQueue keeps different categories separate', () => {
  const grouped = groupPriorityQueue([
    item({ target: 'https://example.com/a/', category: 'serp' }),
    item({
      target: 'https://example.com/b/',
      category: 'content',
      action: 'Add a content section for salary for plumber.',
    }),
  ])

  assert.equal(grouped.length, 2)
  assert.equal(
    grouped.some((entry) => entry.grouped),
    false,
  )
})

test('groupPriorityQueue groups salary city and country template families', () => {
  const grouped = groupPriorityQueue([
    item({
      target: 'https://example.com/average-plumber-salary-in-quito/ecuador/',
      template: {
        id: 'example-site-city-salary',
        label: 'ExampleSite city salary page',
        count: 10,
      },
    }),
    item({
      target: 'https://example.com/average-plumber-salary-in-ecuador/',
      template: {
        id: 'example-site-country-salary',
        label: 'ExampleSite country salary page',
        count: 10,
      },
    }),
  ])

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0]?.grouped?.count, 2)
})
