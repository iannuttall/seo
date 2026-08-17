import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
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
