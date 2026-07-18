import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchBingSite } from './bing.js'

test('Bing site matching uses one verified host match only', () => {
  assert.equal(
    matchBingSite('sc-domain:example.com', [
      { url: 'https://example.com/', isVerified: true },
      { url: 'https://other.example/', isVerified: true },
    ])?.url,
    'https://example.com/',
  )
  assert.equal(
    matchBingSite('https://example.com/', [
      { url: 'http://example.com/', isVerified: true },
      { url: 'https://example.com/', isVerified: true },
    ]),
    undefined,
  )
  assert.equal(
    matchBingSite('sc-domain:example.com', [
      { url: 'https://example.com/', isVerified: false },
    ]),
    undefined,
  )
})
