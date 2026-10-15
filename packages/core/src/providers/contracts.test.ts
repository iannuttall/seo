import assert from 'node:assert/strict'
import test from 'node:test'
import { searchMarketSchema } from './contracts.js'

test('search markets reject ambiguous and extra location input', () => {
  assert.throws(() =>
    searchMarketSchema.parse({ countryCode: 'USA', languageCode: 'en' }),
  )
  assert.throws(() =>
    searchMarketSchema.parse({
      countryCode: 'US',
      languageCode: 'en',
      location: {},
    }),
  )
  assert.throws(() =>
    searchMarketSchema.parse({
      countryCode: 'US',
      languageCode: 'en',
      database: 'us',
    }),
  )
})
