import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLocalSearchDemandHandler,
  localSearchDemandInputSchema,
} from './local-search-demand.js'

test('local search report definition passes first-party and local SERP inputs to core', async () => {
  const handler = createLocalSearchDemandHandler({
    localSearchReport: async (input) => {
      assert.equal(input.site, 'sc-domain:example.com')
      assert.deepEqual(input.locationTerms, ['London'])
      assert.equal(input.includeSerps, true)
      assert.equal(
        input.market?.location?.name,
        'London,England,United Kingdom',
      )
      return {
        summary: { verdict: 'Local evidence retained.' },
      } as never
    },
  })
  const input = {
    site: 'sc-domain:example.com',
    locationTerms: ['London'],
    includeSerps: true,
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google' as const,
    location: { name: 'London,England,United Kingdom' },
  }
  assert.equal(localSearchDemandInputSchema.safeParse(input).success, true)
  await handler(input)
})

test('local search report schema keeps paid local SERPs explicit and bounded', () => {
  assert.equal(
    localSearchDemandInputSchema.safeParse({
      site: 'sc-domain:example.com',
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', countryCode: 'GB' },
    { site: 'sc-domain:example.com', includeSerps: true },
    {
      site: 'sc-domain:example.com',
      includeSerps: true,
      countryCode: 'GB',
      languageCode: 'en',
      location: { name: 'London,England,United Kingdom' },
      serpLimit: 4,
    },
    { site: 'sc-domain:example.com', maxRows: 50_001 },
    {
      site: 'sc-domain:example.com',
      locationTerms: Array.from({ length: 101 }, (_, index) => `area ${index}`),
    },
  ]) {
    assert.equal(
      localSearchDemandInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})
