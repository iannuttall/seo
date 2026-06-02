import assert from 'node:assert/strict'
import { test } from 'node:test'
import { measureCoverage, normalizeForCoverage } from './content-coverage.js'

test('normalizeForCoverage folds accents and apostrophe variants', () => {
  assert.equal(normalizeForCoverage('Peoplé’s surname'), 'peoples surname')
  assert.equal(normalizeForCoverage('peoples surname'), 'peoples surname')
})

test('measureCoverage counts normalized phrase matches', () => {
  const coverage = measureCoverage(
    'peoples surname',
    'This page explains Peoplé’s surname distribution.',
  )

  assert.equal(coverage.phraseCount, 1)
  assert.deepEqual(coverage.missingTerms, [])
})

test('measureCoverage separates phrase match from term coverage', () => {
  const coverage = measureCoverage(
    'origin of the last name laroya',
    'Laroya appears in census records. This page discusses last name origin.',
  )

  assert.equal(coverage.phraseCount, 0)
  assert.equal(coverage.termCoverage, 1)
})
