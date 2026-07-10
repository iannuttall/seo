import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexWatchItemFromInspection } from './index-watch-analysis.js'

function inspection(input: {
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
}) {
  return {
    inspectionResult: { indexStatusResult: input },
  }
}

const base = {
  rootSite: 'sc-domain:example.com',
  property: 'sc-domain:example.com',
  url: 'https://example.com/page',
  inspectedAt: '2026-07-09T12:00:00.000Z',
}

test('first invalid inspection is a current issue without inventing a change', () => {
  const item = indexWatchItemFromInspection({
    ...base,
    result: inspection({
      verdict: 'FAIL',
      coverageState: 'URL is not on Google',
    }),
  })

  assert.equal(item.indexStatus, 'invalid')
  assert.equal(item.currentIssue, true)
  assert.equal(item.alert, true)
  assert.equal(item.changeKind, 'baseline')
  assert.equal(item.changed, false)
  assert.deepEqual(item.issueCodes, ['verdict_invalid'])
})

test('persistent issue stays current but is not a regression', () => {
  const item = indexWatchItemFromInspection({
    ...base,
    previous: {
      inspectedAt: '2026-07-08T12:00:00.000Z',
      verdict: 'FAIL',
      pageFetchState: 'SERVER_ERROR',
    },
    result: inspection({ verdict: 'FAIL', pageFetchState: 'SERVER_ERROR' }),
  })

  assert.equal(item.currentIssue, true)
  assert.equal(item.changeKind, 'unchanged')
  assert.equal(item.regression, false)
  assert.equal(item.changed, false)
})

test('PASS to FAIL is a regression and FAIL to PASS is a recovery', () => {
  const regression = indexWatchItemFromInspection({
    ...base,
    previous: {
      inspectedAt: '2026-07-08T12:00:00.000Z',
      verdict: 'PASS',
      pageFetchState: 'SUCCESSFUL',
    },
    result: inspection({ verdict: 'FAIL', pageFetchState: 'SERVER_ERROR' }),
  })
  const recovery = indexWatchItemFromInspection({
    ...base,
    previous: {
      inspectedAt: '2026-07-08T12:00:00.000Z',
      verdict: 'FAIL',
      pageFetchState: 'SERVER_ERROR',
    },
    result: inspection({ verdict: 'PASS', pageFetchState: 'SUCCESSFUL' }),
  })

  assert.equal(regression.changeKind, 'regression')
  assert.equal(regression.regression, true)
  assert.equal(recovery.changeKind, 'recovery')
  assert.equal(recovery.recovery, true)
  assert.equal(recovery.alert, false)
})

test('machine classification ignores translated coverage text', () => {
  const item = indexWatchItemFromInspection({
    ...base,
    previous: {
      inspectedAt: '2026-07-08T12:00:00.000Z',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
    },
    result: inspection({
      verdict: 'PASS',
      coverageState: 'Envoyee et indexee',
    }),
  })

  assert.equal(item.currentIssue, false)
  assert.equal(item.changed, false)
  assert.equal(item.changeKind, 'unchanged')
})

test('stable enums and canonicals produce typed changes and issue codes', () => {
  const item = indexWatchItemFromInspection({
    ...base,
    previous: {
      inspectedAt: '2026-07-08T12:00:00.000Z',
      verdict: 'PASS',
      indexingState: 'INDEXING_ALLOWED',
      robotsTxtState: 'ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      googleCanonical: base.url,
      userCanonical: base.url,
    },
    result: inspection({
      verdict: 'FAIL',
      indexingState: 'BLOCKED_BY_META_TAG',
      robotsTxtState: 'DISALLOWED',
      pageFetchState: 'BLOCKED_ROBOTS_TXT',
      googleCanonical: 'https://example.com/other',
      userCanonical: base.url,
    }),
  })

  assert.deepEqual(item.issueCodes, [
    'verdict_invalid',
    'robots_disallowed',
    'indexing_blocked_meta',
    'page_fetch_failed',
    'canonical_mismatch',
  ])
  assert.deepEqual(
    item.changes.map((change) => change.field),
    [
      'verdict',
      'indexingState',
      'robotsTxtState',
      'pageFetchState',
      'googleCanonical',
    ],
  )
})
