import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveGoogleAnalyticsReportProperty } from './report.js'

test('an explicit Google Analytics property bypasses saved project selection', async () => {
  let clientSelectionCalls = 0
  let receivedProperty: string | undefined

  const property = await resolveGoogleAnalyticsReportProperty(
    { property: '375885850' },
    {
      resolveClient: async () => {
        clientSelectionCalls += 1
        return undefined
      },
      resolveGoogleAnalyticsProperty: async (input) => {
        receivedProperty = input.property
        return input.property ?? ''
      },
    },
  )

  assert.equal(property, '375885850')
  assert.equal(receivedProperty, '375885850')
  assert.equal(clientSelectionCalls, 0)
})

test('a saved project can supply the Google Analytics property', async () => {
  const property = await resolveGoogleAnalyticsReportProperty(
    { project: 'keep' },
    {
      resolveClient: async (input) => {
        assert.equal(input.client, 'keep')
        return {
          analytics: { google: { propertyId: '123456789' } },
          brandTerms: [],
          createdAt: 1,
          id: 'keep',
          name: 'Keep.md',
          siteUrl: 'sc-domain:keep.md',
          updatedAt: 1,
          watchUrls: [],
        }
      },
      resolveGoogleAnalyticsProperty: async (input) => input.property ?? '',
    },
  )

  assert.equal(property, '123456789')
})
