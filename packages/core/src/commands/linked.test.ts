import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LinkedAccounts } from './linked.js'
import { matchProperty } from './shared.js'

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

test('a Google call that never answers stops at its timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let stopped: AbortSignal | undefined
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (String(input).endsWith('/webmasters/v3/sites')) {
      return Response.json({ siteEntry: SITES['Bearer two'] })
    }
    stopped = init?.signal ?? undefined
    t.mock.timers.tick(30_000)
    return new Promise<Response>(() => {})
  }) as typeof fetch

  const directory = new LinkedAccounts(
    { google: [account('b@example.com', 'two')], bing: [] },
    { signIn: 'Sign in again.', addGoogle: 'Add the Google account.' },
  )
  await assert.rejects(
    directory.searchAnalytics()('sc-domain:example.org', {
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    }),
    {
      code: 'PROVIDER_UNAVAILABLE',
      message:
        /^Search Console for sc-domain:example\.org did not answer within 30 seconds/,
    },
  )
  assert.equal(stopped?.aborted, true)
})

test('a site, host or URL finds the property that covers it', () => {
  const names = [
    'sc-domain:example.com',
    'sc-domain:www.site.example',
    'http://www.example.org/',
    'https://blog.example/',
    'https://blog.example/blog/',
  ]
  const cases: [string, string | null][] = [
    [' example.com ', 'sc-domain:example.com'],
    ['https://shop.example.com/a', 'sc-domain:example.com'],
    ['site.example', 'sc-domain:www.site.example'],
    ['shop.site.example', null],
    // A bare host tries http too; a URL keeps its scheme.
    ['example.org', 'http://www.example.org/'],
    ['https://example.org/', null],
    ['https://blog.example/blog/post', 'https://blog.example/blog/'],
    ['https://blog.example/blogger', 'https://blog.example/'],
  ]
  for (const [site, expected] of cases) {
    assert.equal(matchProperty(names, site), expected, site)
  }
})
