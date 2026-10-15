import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectAccessBlock } from './access-block.js'

test('detects Cloudflare challenge evidence', () => {
  const evidence = detectAccessBlock({
    status: 403,
    headers: new Headers({
      'cf-mitigated': 'challenge',
      'cf-ray': 'abc123-LHR',
      server: 'cloudflare',
    }),
  })

  assert.equal(evidence?.provider, 'cloudflare')
  assert.equal(evidence?.kind, 'challenge')
  assert.equal(evidence?.requestId, 'abc123-LHR')
})

test('does not infer a block from Cloudflare infrastructure alone', () => {
  assert.equal(
    detectAccessBlock({
      status: 200,
      headers: new Headers({
        'cf-ray': 'abc123-LHR',
        server: 'cloudflare',
      }),
    }),
    undefined,
  )

  const denied = detectAccessBlock({ status: 429, headers: new Headers() })
  assert.equal(denied?.provider, 'unknown')
  assert.equal(denied?.kind, 'rate-limit')
})
