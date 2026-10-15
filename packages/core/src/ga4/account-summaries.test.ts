import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectGa4AccountSummaries,
  GA4_ACCOUNT_SUMMARY_PAGE_LIMIT,
} from './account-summaries.js'

test('account summary discovery follows page tokens and keeps empty accounts', async () => {
  const requestedTokens: Array<string | undefined> = []
  const summaries = await collectGa4AccountSummaries(async (pageToken) => {
    requestedTokens.push(pageToken)
    if (!pageToken) {
      return {
        accountSummaries: [{ account: 'accounts/1000' }],
        nextPageToken: 'next-page',
      }
    }
    return {
      accountSummaries: [
        {
          account: 'accounts/2000',
          propertySummaries: [{ property: 'properties/2001' }],
        },
      ],
    }
  })

  assert.deepEqual(requestedTokens, [undefined, 'next-page'])
  assert.deepEqual(summaries, [
    { account: 'accounts/1000', propertySummaries: [] },
    {
      account: 'accounts/2000',
      propertySummaries: [{ property: 'properties/2001' }],
    },
  ])
})

test('account summary discovery rejects repeated tokens and excessive pages', async () => {
  await assert.rejects(
    collectGa4AccountSummaries(async () => ({ nextPageToken: 'repeated' })),
    /repeated a page token/,
  )

  let pages = 0
  await assert.rejects(
    collectGa4AccountSummaries(async () => {
      pages += 1
      return { nextPageToken: `page-${pages}` }
    }),
    new RegExp(`exceeded ${GA4_ACCOUNT_SUMMARY_PAGE_LIMIT} pages`),
  )
  assert.equal(pages, GA4_ACCOUNT_SUMMARY_PAGE_LIMIT)
})
