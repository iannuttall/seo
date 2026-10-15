import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../errors.js'
import { assertUrlMatchesGscProperty } from './property-url.js'

function assertInvalid(run: () => unknown, message: RegExp): void {
  assert.throws(run, (error) => {
    assert.ok(error instanceof SeoError)
    assert.equal(error.code, 'INVALID_INPUT')
    assert.match(error.message, message)
    return true
  })
}

test('matches domain properties to the domain and its subdomains', () => {
  assert.equal(
    assertUrlMatchesGscProperty(
      'sc-domain:example.com',
      'https://docs.example.com/guide',
    ),
    'https://docs.example.com/guide',
  )
  assertInvalid(
    () =>
      assertUrlMatchesGscProperty(
        'sc-domain:example.com',
        'https://notexample.com/guide',
      ),
    /outside the Search Console property/,
  )
})

test('honors the scheme and path of URL-prefix properties', () => {
  assert.equal(
    assertUrlMatchesGscProperty(
      'https://example.com/guides/',
      'https://example.com/guides/technical-seo',
    ),
    'https://example.com/guides/technical-seo',
  )
  assertInvalid(
    () =>
      assertUrlMatchesGscProperty(
        'https://example.com/guides/',
        'http://example.com/guides/technical-seo',
      ),
    /outside the Search Console property/,
  )
  assertInvalid(
    () =>
      assertUrlMatchesGscProperty(
        'https://example.com/guides/',
        'https://example.com/blog/technical-seo',
      ),
    /outside the Search Console property/,
  )
})
