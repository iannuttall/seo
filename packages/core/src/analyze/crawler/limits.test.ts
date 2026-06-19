import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CRAWLER_LIMIT_PROFILES, crawlLimitProfile } from './limits.js'

test('crawler limit profiles define local and hosted tier boundaries', () => {
  assert.deepEqual(
    CRAWLER_LIMIT_PROFILES.map((profile) => profile.id),
    [
      'local',
      'hosted_free',
      'hosted_starter',
      'hosted_pro',
      'hosted_enterprise',
    ],
  )

  const local = crawlLimitProfile('local')
  assert.equal(local.maxPagesPerCrawl, null)
  assert.equal(local.reportHistoryPerProject, null)
  assert.equal(local.schedulesPerProject, 0)

  const free = crawlLimitProfile('hosted_free')
  assert.equal(free.paid, false)
  assert.equal(free.jsRenderPagesPerCrawl, 0)
  assert.equal(free.schedulesPerProject, 0)
  assert.ok(free.maxPagesPerCrawl)
  assert.ok(free.externalLinkChecksPerCrawl)

  const starter = crawlLimitProfile('hosted_starter')
  const pro = crawlLimitProfile('hosted_pro')
  const enterprise = crawlLimitProfile('hosted_enterprise')
  assert.ok(starter.paid)
  assert.ok(pro.paid)
  assert.ok(enterprise.paid)
  assert.ok((starter.maxPagesPerCrawl ?? 0) > (free.maxPagesPerCrawl ?? 0))
  assert.ok((pro.maxPagesPerCrawl ?? 0) > (starter.maxPagesPerCrawl ?? 0))
  assert.ok((enterprise.maxPagesPerCrawl ?? 0) > (pro.maxPagesPerCrawl ?? 0))
  assert.ok(
    (enterprise.externalLinkChecksPerCrawl ?? 0) >
      (pro.externalLinkChecksPerCrawl ?? 0),
  )
})
