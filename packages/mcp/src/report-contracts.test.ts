import assert from 'node:assert/strict'
import test from 'node:test'
import { getReportDefinition } from './report-registry.js'
import { runReport } from './reports.js'

function reportSchema(id: string) {
  const report = getReportDefinition(id)
  assert.ok(report, `Missing report definition: ${id}`)
  return report.inputSchema
}

test('technical-watch accepts active components and rejects a true no-op', async () => {
  const schema = reportSchema('technical-watch')
  for (const input of [
    { site: 'sc-domain:example.com' },
    {
      site: 'sc-domain:example.com',
      startUrl: 'https://example.com/',
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      urls: ['https://example.com/page'],
      recoverLinks: false,
    },
    {
      site: 'sc-domain:example.com',
      sitemaps: ['https://example.com/sitemap.xml'],
      recoverLinks: false,
    },
  ]) {
    assert.equal(schema.safeParse(input).success, true, JSON.stringify(input))
  }

  const noOp = { site: 'sc-domain:example.com', recoverLinks: false }
  assert.equal(schema.safeParse(noOp).success, false)

  const result = await runReport('technical-watch', noOp)
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'Invalid parameters for technical-watch: recoverLinks: Pass startUrl, urls, sitemaps, or enable link recovery for technical-watch.',
      retryable: false,
    },
  })
})
