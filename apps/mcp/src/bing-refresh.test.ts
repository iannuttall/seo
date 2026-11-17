import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshAccess } from './google.ts'
import { seal } from './seal.ts'
import { accountsOf } from './store.ts'

// Bing's token endpoint as it behaves: every refresh returns a new refresh
// token, but only the token from the sign-in works for the next refresh.
// https://learn.microsoft.com/en-us/answers/questions/5659086

const SEAL_KEY = Buffer.alloc(32, 7).toString('base64')

type Row = {
  provider: 'bing'
  subject: string
  label: string
  refresh: string
  access: string | null
  access_exp: number
}

// Just enough of D1 for accountsOf and saveAccess on one account row.
function fakeDb(row: Row) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              return { results: [{ ...row }] }
            },
            async run() {
              assert.match(sql, /^UPDATE accounts SET/)
              row.access = args[0] as string
              row.access_exp = args[1] as number
              if (/refresh = \?/.test(sql)) row.refresh = args[2] as string
              return {}
            },
          }
        },
      }
    },
  }
}

test('a Bing account keeps refreshing after Bing sends a new refresh token', async () => {
  const original = 'refresh-from-sign-in'
  const row: Row = {
    provider: 'bing',
    subject: 's1',
    label: 'example.com',
    refresh: await seal(SEAL_KEY, { k: 'secret', value: original }),
    access: await seal(SEAL_KEY, { k: 'secret', value: 'expired-access' }),
    access_exp: Date.now() - 1,
  }
  const env = {
    PUBLIC_URL: 'https://seoskill.example',
    SEAL_KEY,
    BING_CLIENT_ID: 'client',
    BING_CLIENT_SECRET: 'secret',
    DB: fakeDb(row),
  } as unknown as Env

  let issued = 0
  const sent: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = new URLSearchParams(String(init.body))
    sent.push(body.get('refresh_token') ?? '')
    if (body.get('refresh_token') !== original) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    issued += 1
    return Response.json({
      access_token: `access-${issued}`,
      expires_in: 3599,
      refresh_token: `rotated-${issued}`,
    })
  }) as typeof fetch
  try {
    for (const expected of ['access-1', 'access-2', 'access-3']) {
      const [account] = await accountsOf(env, 'u1')
      assert.ok(account)
      account.accessExp = Date.now() - 1
      assert.equal((await freshAccess(env, account)).token, expected)
    }
  } finally {
    globalThis.fetch = realFetch
  }
  assert.deepEqual(sent, [original, original, original])
  const [account] = await accountsOf(env, 'u1')
  assert.equal(account?.refresh, original)
  assert.equal(account?.access, 'access-3')
})
