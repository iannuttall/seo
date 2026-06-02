import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCommunityIntent } from './community-intent.js'
import { aiPromptsForQuery } from './seo-to-ai-query.js'

test('aiPromptsForQuery keeps existing questions and adds AI-style prompts', () => {
  const prompts = aiPromptsForQuery('how to choose payroll software')

  assert.equal(prompts[0], 'how to choose payroll software?')
  assert.equal(
    prompts.some((prompt) =>
      prompt.includes('What should someone know about payroll software'),
    ),
    true,
  )
})

test('aiPromptsForQuery adds comparison prompt for vs queries', () => {
  const prompts = aiPromptsForQuery('quickbooks vs xero')

  assert.equal(
    prompts.some((prompt) => prompt.startsWith('Compare quickbooks vs xero')),
    true,
  )
})

test('classifyCommunityIntent detects review and forum phrasing', () => {
  assert.equal(
    classifyCommunityIntent('best crm reddit')?.intent,
    'forum/reddit',
  )
  assert.equal(
    classifyCommunityIntent('hubspot reviews and complaints')?.intent,
    'reviews',
  )
})
