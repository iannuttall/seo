import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLocalIntent, normalizeLocationTerms } from './intent.js'

test('classifies explicit place, proximity, and postal-code evidence', () => {
  const terms = normalizeLocationTerms([' New York ', 'NYC', 'new york'])
  assert.deepEqual(terms, ['new york', 'nyc'])
  assert.deepEqual(classifyLocalIntent('Plumber near me in NYC', terms), {
    heuristic: true,
    method: 'explicit-local-intent-v1',
    classes: ['named-location', 'nearby'],
    matchedTerms: ['nyc', 'near me'],
  })
  assert.deepEqual(
    classifyLocalIntent('emergency plumber SW1A 1AA', terms)?.classes,
    ['postal-code'],
  )
  assert.deepEqual(
    classifyLocalIntent('dentist near 10001-1234', terms)?.classes,
    ['postal-code'],
  )
})

test('uses token boundaries and does not treat generic local wording as proof', () => {
  assert.equal(classifyLocalIntent('new yorker magazine', ['new york']), null)
  assert.equal(classifyLocalIntent('local seo guide', []), null)
  assert.equal(classifyLocalIntent('plumber northampton', ['ham']), null)
  assert.equal(classifyLocalIntent('replacement part 10001', []), null)
  assert.equal(
    classifyLocalIntent('"took its name from a nearby stream" factory', []),
    null,
  )
  assert.equal(classifyLocalIntent('history of a nearby village', []), null)
  assert.deepEqual(
    classifyLocalIntent('restaurants close to me', [])?.matchedTerms,
    ['close to me'],
  )
  assert.deepEqual(
    classifyLocalIntent('coffee shops around me', [])?.matchedTerms,
    ['around me'],
  )
  assert.deepEqual(classifyLocalIntent('dentist 10001', ['10001'])?.classes, [
    'named-location',
  ])
})
