import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscQueryAggregate } from '../domain-research/shared.js'
import {
  createFirstPartyMatcher,
  fanOutThemes,
  targetObservations,
} from './analysis.js'

test('target matching handles punctuation boundaries and exact domain ownership', () => {
  const observations = targetObservations(
    'Rival++ is visible. Targeting is not Target.',
    [
      {
        title: null,
        url: 'https://support.target.example/guide',
        domain: 'support.target.example',
      },
      {
        title: null,
        url: 'https://nottarget.example/guide',
        domain: 'nottarget.example',
      },
    ],
    [
      {
        key: 'target',
        role: 'target',
        label: 'Target',
        aliases: ['Target'],
        domains: ['target.example'],
      },
      {
        key: 'competitor-1',
        role: 'competitor',
        label: 'Rival++',
        aliases: ['Rival++'],
        domains: [],
      },
    ],
  )

  assert.equal(observations[0]?.answerState, 'observed')
  assert.deepEqual(observations[0]?.citedDomains, ['support.target.example'])
  assert.equal(observations[1]?.answerState, 'observed')
})

test('first-party matching bounds candidate work on a large fixture', () => {
  const rows: GscQueryAggregate[] = Array.from(
    { length: 10_000 },
    (_, index) => ({
      query: `best widget option unique${index}a unique${index}b unique${index}c unique${index}d unique${index}e unique${index}f unique${index}g`,
      clicks: index % 7,
      impressions: 10_000 - index,
      averagePosition: 10,
      urls: [`https://example.test/widgets/${index}`],
    }),
  )
  const matcher = createFirstPartyMatcher(rows)
  const themes = fanOutThemes(
    Array.from({ length: 20 }, (_, index) => ({
      observationKey: `observation-${index}`,
      surface: index % 2 === 0 ? ('chatgpt' as const) : ('claude' as const),
      fanOutQueries: ['best widget option', 'widget pricing comparison'],
    })),
    matcher,
  )

  assert.equal(matcher.processing.rows, 10_000)
  assert.equal(matcher.processing.retainedPostings, 50_000)
  assert.ok(matcher.processing.candidateVisits <= 400)
  assert.equal(themes.length, 4)
  assert.deepEqual(
    themes.map((theme) => theme.term),
    ['option', 'widget', 'comparison', 'pricing'],
  )
  assert.equal(themes[0]?.firstParty.queries.length, 3)
})
