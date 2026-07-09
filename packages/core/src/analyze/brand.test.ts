import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deriveBrandTerms,
  isBrandQuery,
  shouldExcludeBrandQuery,
} from '../brand.js'

test('deriveBrandTerms includes domain and compact client names', () => {
  const terms = deriveBrandTerms({
    id: 'example-brand',
    name: 'ExampleBrand',
    siteUrl: 'sc-domain:examplebrand.com',
  })

  assert.ok(terms.includes('example brand'))
  assert.ok(terms.includes('examplebrand'))
})

test('deriveBrandTerms handles common country-code public suffixes', () => {
  assert.deepEqual(
    deriveBrandTerms({ siteUrl: 'sc-domain:shop.example.co.uk' }),
    ['example'],
  )
  assert.deepEqual(
    deriveBrandTerms({ siteUrl: 'https://www.example.com.au/products' }),
    ['example'],
  )
})

test('brand query matching is token-aware for short brands', () => {
  assert.equal(isBrandQuery('acme docs', ['acme']), true)
  assert.equal(isBrandQuery('best academic apps', ['acme']), false)
  assert.equal(isBrandQuery('example brand.com', ['examplebrand']), true)
  assert.equal(isBrandQuery('examples brand', ['example brand']), true)
})

test('brand query matching preserves non-Latin brand terms', () => {
  assert.equal(isBrandQuery('品牌評測', ['品牌']), true)
  assert.equal(isBrandQuery('مراجعة أكمي', ['أكمي']), true)
  assert.equal(isBrandQuery('отзывы маяк', ['маяк']), true)
  assert.equal(isBrandQuery('seo guide', ['品']), false)
})

test('shouldExcludeBrandQuery can include brand when requested', () => {
  assert.equal(
    shouldExcludeBrandQuery({
      query: 'examplebrand',
      siteUrl: 'sc-domain:examplebrand.com',
    }),
    true,
  )
  assert.equal(
    shouldExcludeBrandQuery({
      query: 'examplebrand',
      siteUrl: 'sc-domain:examplebrand.com',
      includeBrand: true,
    }),
    false,
  )
})
