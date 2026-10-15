import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LLMS_TXT_VALIDATOR_LIMITS,
  validateLlmsTxt,
} from '../src/lib/llms-txt-validator.mjs'

test('finds title and heading errors with their source lines', () => {
  const result = validateLlmsTxt(
    '\n# Late title\n### Deeper heading\n# Second title\n',
  )
  const errors = new Map(result.errors.map((item) => [item.code, item]))

  assert.equal(errors.get('missing-title')?.line, 1)
  assert.equal(errors.get('unsupported-heading')?.line, 3)
  assert.equal(errors.get('extra-title')?.line, 4)
})

test('rejects malformed, unsafe, and duplicate file links', () => {
  const result = validateLlmsTxt(`# Example

> Summary

## Docs

This is not a file list.
- No Markdown link
- [Unsafe](javascript:alert(1))
- [First](https://example.com/docs)
- [Second](https://example.com/docs)
`)

  assert.deepEqual(
    new Set(result.errors.map(({ code }) => code)),
    new Set([
      'unexpected-section-content',
      'invalid-file-link',
      'duplicate-link',
    ]),
  )
  assert.equal(result.stats.links, 2)
})

test('keeps one total output budget for pathological files', () => {
  const rows = Array.from({ length: 250 }, (_, index) => `Broken row ${index}`)
  const result = validateLlmsTxt(`# Example\n\n## Docs\n${rows.join('\n')}\n`)

  assert.equal(
    result.errors.length + result.warnings.length,
    LLMS_TXT_VALIDATOR_LIMITS.maxIssues,
  )
  assert.equal(result.issueStats.errors, 250)
  assert.equal(result.issueStats.warnings, 2)
  assert.equal(result.issueStats.omitted, 152)
})
