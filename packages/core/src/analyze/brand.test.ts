import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deriveBrandTerms,
  isBrandQuery,
  shouldExcludeBrandQuery,
} from '../brand.js'

test('deriveBrandTerms includes domain and compact client names', () => {
  const terms = deriveBrandTerms({
    id: 'example-site',
    name: 'ExampleSite',
    siteUrl: 'sc-domain:example.com',
  })

  assert.ok(terms.includes('example site'))
  assert.ok(terms.includes('example-site'))
})

test('brand query matching is token-aware for short brands', () => {
  assert.equal(isBrandQuery('keep md', ['keep']), true)
  assert.equal(isBrandQuery('best keeping apps', ['keep']), false)
  assert.equal(isBrandQuery('example site.com', ['example-site']), true)
})

test('shouldExcludeBrandQuery can include brand when requested', () => {
  assert.equal(
    shouldExcludeBrandQuery({
      query: 'example-site',
      siteUrl: 'sc-domain:example.com',
    }),
    true,
  )
  assert.equal(
    shouldExcludeBrandQuery({
      query: 'example-site',
      siteUrl: 'sc-domain:example.com',
      includeBrand: true,
    }),
    false,
  )
})
