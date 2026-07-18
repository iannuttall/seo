import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '@seo/core'
import { defaultReportHtmlPath, reportHtmlOptions } from './report-html.js'

test('reportHtmlOptions keeps terminal output as the default', () => {
  assert.equal(reportHtmlOptions({}), undefined)
  assert.deepEqual(reportHtmlOptions({ format: 'html' }), {
    output: undefined,
    view: 'client',
  })
  assert.deepEqual(
    reportHtmlOptions({
      format: 'html',
      output: 'report.html',
      view: 'analyst',
    }),
    { output: 'report.html', view: 'analyst' },
  )
})

test('reportHtmlOptions rejects conflicting and unknown output modes', () => {
  assert.throws(
    () => reportHtmlOptions({ format: 'html', json: true }),
    SeoError,
  )
  assert.throws(() => reportHtmlOptions({ format: 'pdf' }), SeoError)
  assert.throws(() => reportHtmlOptions({ output: 'report.html' }), SeoError)
})

test('defaultReportHtmlPath creates a stable safe filename', () => {
  const path = defaultReportHtmlPath({
    reportName: 'monthly report',
    projectId: 'Example Project',
    site: 'sc-domain:example.com',
    date: new Date('2026-07-18T12:00:00Z'),
  })
  assert.match(path, /example-project-monthly-report-2026-07-18\.html$/)
})
