import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateLlmsTxt,
  LLMS_TXT_LIMITS,
} from '../src/lib/llms-txt-generator.mjs'

test('generates the required title-only file', () => {
  const result = generateLlmsTxt({ title: 'Example' })

  assert.equal(result.content, '# Example\n')
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 2)
  assert.deepEqual(result.stats, {
    bytes: 10,
    estimatedTokens: 3,
    links: 0,
    sections: 0,
  })
})

test('generates proposal-shaped sections, links, and an optional section', () => {
  const result = generateLlmsTxt({
    title: 'Example docs',
    summary: 'Documentation for the Example API.',
    details: 'Start with the quick start before opening the full reference.',
    sections: [
      {
        heading: 'Docs',
        links: [
          {
            label: 'Quick start',
            url: 'https://example.com/docs/start',
            description: 'Install and make the first request.',
          },
        ],
      },
      {
        heading: 'Ignored heading',
        optional: true,
        links: [
          {
            label: 'Full reference',
            url: 'https://example.com/reference',
          },
        ],
      },
    ],
  })

  assert.equal(result.errors.length, 0)
  assert.equal(result.stats.links, 2)
  assert.equal(result.stats.sections, 2)
  assert.equal(
    result.content,
    `# Example docs

> Documentation for the Example API.

Start with the quick start before opening the full reference.

## Docs

- [Quick start](https://example.com/docs/start): Install and make the first request.

## Optional

- [Full reference](https://example.com/reference)
`,
  )
})

test('rejects missing fields, unsafe protocols, and duplicate links', () => {
  const result = generateLlmsTxt({
    title: '',
    sections: [
      {
        heading: '',
        links: [
          { label: '', url: 'javascript:alert(1)' },
          { label: 'First', url: 'https://example.com/docs' },
          { label: 'Second', url: 'https://example.com/docs' },
        ],
      },
    ],
  })

  assert.equal(result.content, '')
  assert.deepEqual(
    new Set(result.errors.map((item) => item.code)),
    new Set([
      'missing-title',
      'missing-section-heading',
      'missing-link-label',
      'invalid-link-url',
      'duplicate-link',
    ]),
  )
})

test('escapes closing brackets in link labels', () => {
  const result = generateLlmsTxt({
    title: 'Example',
    sections: [
      {
        heading: 'Docs',
        links: [
          { label: 'Array] reference', url: 'https://example.com/array' },
        ],
      },
    ],
  })

  assert.match(result.content, /\[Array\\\] reference\]/u)
})

test('enforces the shared link limit before returning output', () => {
  const links = Array.from(
    { length: LLMS_TXT_LIMITS.maxLinks + 1 },
    (_, index) => ({
      label: `Page ${index}`,
      url: `https://example.com/${index}`,
    }),
  )
  const result = generateLlmsTxt({
    title: 'Example',
    sections: [{ heading: 'Docs', links }],
  })

  assert.equal(result.content, '')
  assert.ok(result.errors.some((item) => item.code === 'too-many-links'))
})
