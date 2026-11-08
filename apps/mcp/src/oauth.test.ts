import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorize, register } from './oauth.ts'

const env = {
  PUBLIC_URL: 'https://seoskill.example',
  SEAL_KEY: Buffer.alloc(32, 7).toString('base64'),
} as unknown as Env

test('a bad authorize request never redirects to a registered URI', async () => {
  const redirectUri = 'https://attacker.example/landing'
  const registered = await register(
    new Request('https://seoskill.example/oauth/register', {
      method: 'POST',
      body: JSON.stringify({ redirect_uris: [redirectUri] }),
    }),
    env,
  )
  const { client_id } = (await registered.json()) as { client_id: string }
  const goodPkce = {
    code_challenge: 'a'.repeat(43),
    code_challenge_method: 'S256',
  }
  for (const query of [
    { response_type: 'token', ...goodPkce },
    { response_type: 'code', code_challenge: 'short' },
    { response_type: 'code' },
  ]) {
    const url = new URL('https://seoskill.example/oauth/authorize')
    for (const [key, value] of Object.entries({
      client_id,
      redirect_uri: redirectUri,
      state: 's',
      ...query,
    })) {
      url.searchParams.set(key, value)
    }
    const response = await authorize(new Request(url), env)
    assert.equal(response.status, 400, JSON.stringify(query))
    assert.equal(response.headers.get('location'), null)
  }
})
