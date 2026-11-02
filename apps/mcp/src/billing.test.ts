import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { verifyStripeSignature } from './billing.ts'

const secret = 'whsec_test_secret'
const body = '{"type":"customer.subscription.updated"}'
const now = 1_793_600_000_000
const t = Math.floor(now / 1000)
const sign = (at: number, payload: string, key = secret) =>
  createHmac('sha256', key).update(`${at}.${payload}`).digest('hex')

test('only a fresh Stripe signature over the exact body is accepted', async () => {
  const good = `t=${t},v1=${sign(t, body)}`
  assert.equal(await verifyStripeSignature(body, good, secret, now), true)
  // Stripe sends several v1 values while a secret is being rolled.
  assert.equal(
    await verifyStripeSignature(
      body,
      `t=${t},v1=${sign(t, body, 'whsec_old')},v1=${sign(t, body)}`,
      secret,
      now,
    ),
    true,
  )
  const refused = [
    `t=${t},v1=${sign(t, `${body} `)}`,
    `t=${t},v1=${sign(t, body, 'whsec_other')}`,
    `t=${t - 301},v1=${sign(t - 301, body)}`,
    `t=${t},v0=${sign(t, body)}`,
    `v1=${sign(t, body)}`,
    '',
  ]
  for (const header of refused) {
    assert.equal(
      await verifyStripeSignature(body, header, secret, now),
      false,
      header,
    )
  }
  assert.equal(await verifyStripeSignature(body, good, '', now), false)
})
