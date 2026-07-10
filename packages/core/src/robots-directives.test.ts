import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  effectiveRobotsDirectives,
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
