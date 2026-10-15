import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLlmsTxt } from '../src/lib/llms-txt-generator.mjs'

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
