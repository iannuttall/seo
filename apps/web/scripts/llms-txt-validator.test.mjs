import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LLMS_TXT_VALIDATOR_LIMITS,
  validateLlmsTxt,
} from '../src/lib/llms-txt-validator.mjs'

test('accepts the proposal shape with a BOM and Windows line endings', () => {
  const result = validateLlmsTxt(
    '\uFEFF# Example docs\r\n\r\n> Documentation for Example.\r\n\r\nUseful context.\r\n\r\n## Docs\r\n\r\n- [Quick start](https://example.com/docs/start): Install the package.\r\n\r\n## Optional\r\n\r\n- [Reference](https://example.com/reference)\r\n',
  )

  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 0)
  assert.equal(result.stats.links, 2)
  assert.equal(result.stats.sections, 2)
})

test('treats a title-only file as valid but warns about optional context', () => {
  const result = validateLlmsTxt('# Example\n')

  assert.equal(result.errors.length, 0)
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    ['missing-summary', 'no-links'],
  )
  assert.deepEqual(result.stats, {
    bytes: 10,
    estimatedTokens: 3,
    lines: 1,
    links: 0,
    sections: 0,
  })
})

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

test('checks Optional spelling, order, and uniqueness', () => {
  const result = validateLlmsTxt(`# Example

## optional
- [Lowercase](https://example.com/lowercase)

## Optional
- [First](https://example.com/first)

## Docs
- [Docs](https://example.com/docs)

## Optional
- [Second](https://example.com/second)
`)

  assert.ok(
    result.warnings.some(({ code }) => code === 'optional-heading-case'),
  )
  assert.ok(
    result.warnings.some(({ code }) => code === 'optional-section-order'),
  )
  assert.ok(
    result.warnings.some(({ code }) => code === 'duplicate-section-heading'),
  )
  assert.ok(
    result.errors.some(({ code }) => code === 'duplicate-optional-section'),
  )
})

test('accepts balanced parentheses in complete URLs', () => {
  const result = validateLlmsTxt(`# Example

## Reference
- [Function](https://example.com/functions/parse(value)): Details.
`)

  assert.equal(result.errors.length, 0)
  assert.equal(result.stats.links, 1)
})

test('enforces the input byte limit', () => {
  const result = validateLlmsTxt(
    `# Example\n\n${'a'.repeat(LLMS_TXT_VALIDATOR_LIMITS.maxBytes)}`,
  )

  assert.ok(result.errors.some(({ code }) => code === 'file-too-large'))
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
