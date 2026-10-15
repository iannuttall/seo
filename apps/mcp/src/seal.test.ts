import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seal, unseal } from './seal.ts'

const key = Buffer.alloc(32, 7).toString('base64')
const other = Buffer.alloc(32, 8).toString('base64')

test('a sealed value opens only as its own kind, with its own key', async () => {
  const token = await seal(key, {
    k: 'user-access',
    userId: 'u1',
    exp: Date.now() + 60_000,
  })
  assert.equal((await unseal(key, token, 'user-access'))?.userId, 'u1')
  assert.equal(await unseal(key, token, 'user-refresh'), null)
  assert.equal(await unseal(key, token, 'session'), null)
  assert.equal(await unseal(other, token, 'user-access'), null)
  assert.equal(
    await unseal(key, `${token.slice(0, -2)}AA`, 'user-access'),
    null,
  )
  assert.equal(await unseal(key, 'not-a-token', 'user-access'), null)
})

test('an expired value does not open', async () => {
  const token = await seal(key, {
    k: 'session',
    userId: 'u1',
    exp: Date.now() - 1,
  })
  assert.equal(await unseal(key, token, 'session'), null)
})
