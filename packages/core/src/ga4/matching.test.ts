import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type Ga4WebStreamCandidate,
  ga4MatchReason,
  matchGa4WebStreams,
} from './matching.js'

function candidate(
  property: string,
  defaultUri?: string,
): Ga4WebStreamCandidate {
  return {
    account: 'Example account',
    property,
    propertyName: `Property ${property}`,
    stream: {
      name: `properties/${property}/dataStreams/1`,
      displayName: `Website ${property}`,
      type: 'WEB_DATA_STREAM',
      webStreamData: defaultUri ? { defaultUri } : undefined,
    },
  }
}

test('matches one GA4 web stream inside a Search Console domain property', () => {
  const matches = matchGa4WebStreams('sc-domain:example.com', [
    candidate('100', 'https://www.example.com'),
    candidate('200', 'https://other.example'),
  ])

  const match = matches[0]
  assert.ok(match)
  assert.equal(matches.length, 1)
  assert.equal(match.property, '100')
  assert.equal(match.match, 'domain')
  assert.match(ga4MatchReason(match, 'sc-domain:example.com'), /inside/)
})

test('keeps several matching streams ambiguous', () => {
  const matches = matchGa4WebStreams('https://www.example.com/', [
    candidate('100', 'https://www.example.com'),
    candidate('200', 'https://www.example.com'),
  ])

  assert.equal(matches.length, 2)
  assert.deepEqual(
    matches.map((match) => match.property),
    ['100', '200'],
  )
})

test('does not match unrelated, malformed, or non-web streams', () => {
  const matches = matchGa4WebStreams('https://www.example.com/', [
    candidate('100', 'https://example.com'),
    candidate('200', 'not a URL'),
    candidate('300'),
  ])

  assert.deepEqual(matches, [])
})
