import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectGa4AccountSummaries,
  GA4_ACCOUNT_SUMMARY_PAGE_LIMIT,
  parseGa4AccountSummaryPage,
} from './account-summaries.js'

test('account summary pages normalize an omitted property list', () => {
  assert.deepEqual(
    parseGa4AccountSummaryPage({
      accountSummaries: [
        {
          account: 'accounts/1000',
          displayName: 'Empty account',
        },
      ],
    }),
    {
      accountSummaries: [
        {
          account: 'accounts/1000',
          displayName: 'Empty account',
          propertySummaries: [],
        },
      ],
      nextPageToken: undefined,
    },
  )
})

test('account summary pages reject malformed provider rows', () => {
  assert.throws(
    () =>
      parseGa4AccountSummaryPage({
        accountSummaries: [
          {
            account: 'accounts/1000',
            propertySummaries: null,
          },
        ],
      }),
    /account summary response was invalid/,
  )
})

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

test('account summary discovery stays bounded at 4,000 normalized accounts', async () => {
  let pages = 0
  const summaries = await collectGa4AccountSummaries(async () => {
    pages += 1
    return {
      accountSummaries: Array.from({ length: 200 }, (_, index) => ({
        account: `accounts/${pages}-${index}`,
      })),
      nextPageToken:
        pages < GA4_ACCOUNT_SUMMARY_PAGE_LIMIT ? `page-${pages}` : undefined,
    }
  })

  assert.equal(pages, GA4_ACCOUNT_SUMMARY_PAGE_LIMIT)
  assert.equal(summaries.length, 4_000)
  assert.ok(
    summaries.every((summary) => summary.propertySummaries.length === 0),
  )
})
