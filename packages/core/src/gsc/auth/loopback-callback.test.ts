import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { SeoError } from '../../errors.js'
import { waitForCode } from './loopback-callback.js'

async function loopbackServer(): Promise<{
  server: http.Server
  redirectUri: string
}> {
  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return {
    server,
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
  }
}

test('a stale OAuth callback does not stop the current login', async (t) => {
  const { server, redirectUri } = await loopbackServer()
  t.after(() => server.close())

  const currentCallback = waitForCode({
    server,
    redirectUri,
    state: 'current-state',
  })
  const staleResponse = await fetch(
    `${redirectUri}?state=stale-state&code=stale-code`,
  )
  assert.equal(staleResponse.status, 400)

  const responsePromise = fetch(
    `${redirectUri}?state=current-state&code=current-code`,
  )
  const callback = await currentCallback
  assert.equal(callback.code, 'current-code')
  callback.respond(200, 'Connected.')

  const response = await responsePromise
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Connected.')
})

test('an OAuth timeout is an expected auth failure with clear retry steps', async (t) => {
  const { server, redirectUri } = await loopbackServer()
  t.after(() => server.close())

  await assert.rejects(
    waitForCode({
      server,
      redirectUri,
      state: 'current-state',
      timeoutMs: 5,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SeoError)
      assert.equal(error.code, 'AUTH_REQUIRED')
      assert.match(error.message, /No account was connected/)
      assert.match(error.message, /seo auth login/)
      assert.match(error.message, /within five minutes/)
      assert.match(error.message, /Keep the terminal open/)
      return true
    },
  )
})

test('a cancelled Google login returns a clear access error', async (t) => {
  const { server, redirectUri } = await loopbackServer()
  t.after(() => server.close())

  const rejected = assert.rejects(
    waitForCode({
      server,
      redirectUri,
      state: 'current-state',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SeoError)
      assert.equal(error.code, 'ACCESS_DENIED')
      assert.match(error.message, /sign-in was cancelled/i)
      assert.match(error.message, /No account was connected/)
      return true
    },
  )
  const response = await fetch(
    `${redirectUri}?state=current-state&error=access_denied`,
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /Google sign-in was cancelled/)
  await rejected
})

test('another OAuth callback error returns a retry step instead of an internal error', async (t) => {
  const { server, redirectUri } = await loopbackServer()
  t.after(() => server.close())

  const rejected = assert.rejects(
    waitForCode({
      server,
      redirectUri,
      state: 'current-state',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SeoError)
      assert.equal(error.code, 'AUTH_REQUIRED')
      assert.match(error.message, /could not finish/i)
      assert.match(error.message, /seo auth login/)
      return true
    },
  )
  const response = await fetch(
    `${redirectUri}?state=current-state&error=temporarily_unavailable`,
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /Google connection failed/)
  await rejected
})
