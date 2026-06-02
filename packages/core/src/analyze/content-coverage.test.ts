import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractedPage } from '../types.js'
import {
  contentCoverageRecommendation,
  measureCoverage,
  normalizeForCoverage,
  queryContentCoverageFromPage,
} from './content-coverage.js'

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

function page(input: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    url: 'https://example.com/page/',
    finalUrl: input.finalUrl ?? 'https://example.com/page/',
    title: input.title ?? 'Laroya surname origin and popularity',
    metaDescription: input.metaDescription ?? 'Learn about Laroya origin.',
    metaRobots: undefined,
    xRobotsTag: undefined,
    canonical: undefined,
    headings: input.headings ?? [{ level: 1, text: 'Laroya surname' }],
    links: [],
    jsonLd: [],
    openGraph: {},
    twitter: {},
    contentText:
      input.contentText ??
      'Laroya is a last name. This page covers origin, popularity, rarity, and Philippines census data.',
    excerpt: undefined,
    wordCount: 100,
    warnings: [],
  }
}

test('contentCoverageRecommendation suggests field-specific SERP framing', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'origin of the last name laroya',
    url: 'https://example.com/page/',
    page: page(),
  })

  assert.equal(coverage.classification, 'serp-framing')
  assert.match(contentCoverageRecommendation(coverage), /title/)
  assert.match(contentCoverageRecommendation(coverage), /H1/)
  assert.match(
    contentCoverageRecommendation(coverage),
    /origin of the last name laroya/,
  )
})

test('contentCoverageRecommendation names missing body terms', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'air pasang surut batu pahat',
    url: 'https://example.com/page/',
    page: page({
      title: 'Batu Pahat tide times',
      headings: [{ level: 1, text: 'Batu Pahat tide times' }],
      contentText: 'Batu Pahat tide times and tide chart.',
    }),
  })

  assert.equal(coverage.classification, 'content-gap')
  assert.match(contentCoverageRecommendation(coverage), /air/)
  assert.match(contentCoverageRecommendation(coverage), /pasang/)
})

test('contentCoverageRecommendation flags redirected GSC URLs first', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'salary for plumber',
    url: 'https://example.com/city/plumber/',
    page: page({
      finalUrl: 'https://example.com/country/plumber/',
      title: 'Plumber salary',
      headings: [{ level: 1, text: 'Plumber salary' }],
      contentText: 'Plumber salary by country.',
    }),
  })

  assert.equal(coverage.classification, 'technical-check')
  assert.match(contentCoverageRecommendation(coverage), /resolves/)
  assert.match(contentCoverageRecommendation(coverage), /salary for plumber/)
})
