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
