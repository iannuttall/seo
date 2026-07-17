import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectAccessBlock } from './access-block.js'
import { SEO_CRAWLER_USER_AGENT } from './crawler-identity.js'

test('detects Cloudflare challenge evidence and returns narrow guidance', () => {
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
  assert.equal(evidence?.crawler.userAgent, SEO_CRAWLER_USER_AGENT)
  assert.match(evidence?.guidance.recommendedAction ?? '', /source IP/)
  assert.match(evidence?.guidance.securityNote ?? '', /spoofed/)
  assert.match(evidence?.guidance.documentationUrl ?? '', /cloudflare\.com/)
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
  assert.match(denied?.guidance.securityNote ?? '', /spoofed/)
})
