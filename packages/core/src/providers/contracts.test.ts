import assert from 'node:assert/strict'
import test from 'node:test'
import {
  observedValue,
  providerCapabilitySchema,
  providerIdSchema,
  searchMarketSchema,
  unavailableValue,
} from './contracts.js'

test('provider values keep zero separate from unavailable states', () => {
  assert.deepEqual(observedValue(0), { state: 'observed', value: 0 })
  assert.deepEqual(unavailableValue('missing', 'Provider omitted the field.'), {
    state: 'missing',
    value: null,
    reason: 'Provider omitted the field.',
  })
  assert.deepEqual(
    unavailableValue('unavailable', 'Market does not support this metric.'),
    {
      state: 'unavailable',
      value: null,
      reason: 'Market does not support this metric.',
    },
  )
  assert.deepEqual(unavailableValue('invalid', 'Value was not finite.'), {
    state: 'invalid',
    value: null,
    reason: 'Value was not finite.',
  })
})

test('search markets normalize stable country and language codes', () => {
  assert.deepEqual(
    searchMarketSchema.parse({
      countryCode: 'gb',
      languageCode: 'EN-gb',
      location: { code: 1006886, name: 'London,England,United Kingdom' },
      device: 'mobile',
    }),
    {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en-gb',
      location: { code: 1006886, name: 'London,England,United Kingdom' },
      device: 'mobile',
    },
  )
})

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

test('provider ids and capabilities stay an owned closed vocabulary', () => {
  assert.equal(providerIdSchema.parse('dataforseo'), 'dataforseo')
  assert.equal(
    providerCapabilitySchema.parse('keyword-metrics'),
    'keyword-metrics',
  )
  assert.throws(() => providerIdSchema.parse('vendor-row'))
  assert.throws(() => providerCapabilitySchema.parse('magic-score'))
})
