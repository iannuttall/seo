import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  effectiveRobotsDirectives,
  effectiveSnippetControl,
  metaRobotsDirectives,
  xRobotsDirectives,
} from './robots-directives.js'

test('meta robots combines repeated restrictions and expands none', () => {
  assert.deepEqual(
    [...metaRobotsDirectives(['INDEX, follow', 'NoFollow', 'NONE'])].sort(),
    ['nofollow', 'noindex'],
  )
})

test('x-robots-tag applies generic and googlebot rules only', () => {
  assert.deepEqual(
    [
      ...xRobotsDirectives([
        'otherbot: noindex, nofollow',
        'googlebot: NoIndex',
        'nofollow',
      ]),
    ].sort(),
    ['nofollow', 'noindex'],
  )
  assert.deepEqual([...xRobotsDirectives('otherbot: none')], [])
  assert.deepEqual(
    [...xRobotsDirectives('unavailable_after: 25 Jun 2030, noindex')],
    ['noindex'],
  )
})

test('effective directives use the most restrictive signal across sources', () => {
  assert.deepEqual(
    [
      ...effectiveRobotsDirectives({
        metaRobots: 'index, follow',
        xRobotsTag: 'googlebot: none',
      }),
    ].sort(),
    ['nofollow', 'noindex'],
  )
})

test('snippet controls preserve the most restrictive Googlebot evidence', () => {
  assert.deepEqual(
    effectiveSnippetControl({
      metaRobots: 'max-snippet:50, nosnippet',
      xRobotsTag: 'googlebot: max-snippet:20',
    }),
    {
      status: 'blocked',
      reason: 'nosnippet',
      maxCharacters: 0,
      evidence: [
        {
          source: 'meta-robots',
          directive: 'max-snippet',
          raw: 'max-snippet:50',
          value: 50,
        },
        {
          source: 'meta-robots',
          directive: 'nosnippet',
          raw: 'nosnippet',
        },
        {
          source: 'x-robots-tag',
          directive: 'max-snippet',
          raw: 'max-snippet:20',
          value: 20,
        },
      ],
    },
  )
})

test('snippet controls distinguish limits, zero, unlimited, and other bots', () => {
  assert.deepEqual(
    effectiveSnippetControl({
      metaRobots: ['max-snippet:-1', 'max-snippet:80'],
      xRobotsTag: ['otherbot: nosnippet', 'googlebot: max-snippet:40'],
    }),
    {
      status: 'limited',
      reason: 'max-snippet-limit',
      maxCharacters: 40,
      evidence: [
        {
          source: 'meta-robots',
          directive: 'max-snippet',
          raw: 'max-snippet:-1',
          value: -1,
        },
        {
          source: 'meta-robots',
          directive: 'max-snippet',
          raw: 'max-snippet:80',
          value: 80,
        },
        {
          source: 'x-robots-tag',
          directive: 'max-snippet',
          raw: 'max-snippet:40',
          value: 40,
        },
      ],
    },
  )
  assert.equal(
    effectiveSnippetControl({ metaRobots: 'max-snippet:0' }).status,
    'blocked',
  )
  assert.deepEqual(
    effectiveSnippetControl({
      metaRobots: 'max-snippet:-1, max-snippet:invalid',
      xRobotsTag: 'otherbot: nosnippet',
    }),
    {
      status: 'not-restricted',
      reason: 'no-restrictive-directive',
      evidence: [
        {
          source: 'meta-robots',
          directive: 'max-snippet',
          raw: 'max-snippet:-1',
          value: -1,
        },
      ],
    },
  )
})
