import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LinkedAccounts } from './linked.js'

const account = (email: string, token: string) => ({
  email,
  token: async () => token,
})

const SITES: Record<string, { siteUrl: string; permissionLevel: string }[]> = {
  'Bearer one': [
    {
      siteUrl: 'sc-domain:example.dev',
      permissionLevel: 'siteRestrictedUser',
    },
    { siteUrl: 'sc-domain:shared.com', permissionLevel: 'siteRestrictedUser' },
  ],
  'Bearer two': [
    { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:shared.com', permissionLevel: 'siteOwner' },
  ],
}

test('each site goes to the linked Google account with the most access to it', async () => {
  const used: string[] = []
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization') ?? ''
    const url = String(input)
    if (url.endsWith('/webmasters/v3/sites')) {
      return Response.json({ siteEntry: SITES[auth] ?? [] })
    }
    used.push(`${auth} ${decodeURIComponent(url.split('/sites/')[1] ?? '')}`)
    return Response.json({ rows: [] })
  }) as typeof fetch

  const directory = new LinkedAccounts(
    {
      google: [
        account('a@example.com', 'one'),
        account('b@example.com', 'two'),
      ],
      bing: [],
    },
    { signIn: 'Sign in again.', addGoogle: 'Add the Google account.' },
  )
  assert.equal(
    await directory.resolve('https://example.org/pay'),
    'sc-domain:example.org',
  )
  const read = directory.searchAnalytics()
  await read('sc-domain:shared.com', {
    startDate: '2026-09-01',
    endDate: '2026-09-02',
  })
  await read('sc-domain:example.dev', {
    startDate: '2026-09-01',
    endDate: '2026-09-02',
  })
  assert.deepEqual(used, [
    'Bearer two sc-domain:shared.com/searchAnalytics/query',
    'Bearer one sc-domain:example.dev/searchAnalytics/query',
  ])
  await assert.rejects(
    directory.resolve('nobody.org'),
    /None of the connected Google accounts \(a@example.com, b@example.com\).*Add the Google account/,
  )
})
