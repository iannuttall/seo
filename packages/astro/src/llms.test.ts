import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderLlmsTxt } from './llms.js'
import type { AgentRouteManifest } from './manifest.js'

const manifest: AgentRouteManifest = {
  version: 1,
  site: 'https://example.com',
  pages: [
    {
      bytes: 12,
      canonical: 'https://example.com/docs',
      description: 'Read the useful documentation.',
      htmlFile: 'docs/index.html',
      htmlPath: '/docs',
      language: 'en',
      markdownFile: 'docs.md',
      markdownPath: '/docs.md',
      noindex: false,
      sha256: 'digest',
      title: 'Documentation | Example',
      tokens: 3,
    },
    {
      bytes: 12,
      canonical: 'https://example.com/privacy',
      description: 'Private policy.',
      htmlFile: 'privacy/index.html',
      htmlPath: '/privacy',
      language: 'en',
      markdownFile: 'privacy.md',
      markdownPath: '/privacy.md',
      noindex: true,
      sha256: 'digest',
      title: 'Privacy | Example',
      tokens: 3,
    },
  ],
}

test('renders a stable curated map from manifest metadata', () => {
  assert.equal(
    renderLlmsTxt(manifest, {
      title: 'Example',
      summary: 'Useful docs for agents.',
      sections: [
        {
          heading: 'Start here',
          items: [{ path: '/docs' }],
        },
        {
          heading: 'Capabilities',
          items: [
            {
              label: 'Agent skill',
              url: '/.well-known/agent-skills/example/SKILL.md',
              description: 'Instructions for the agent.',
            },
          ],
        },
      ],
    }),
    `# Example

> Useful docs for agents.

## Start here

- [Documentation](https://example.com/docs.md): Read the useful documentation.

## Capabilities

- [Agent skill](https://example.com/.well-known/agent-skills/example/SKILL.md): Instructions for the agent.
`,
  )
})

test('rejects stale, noindex and duplicate curated routes', () => {
  for (const path of ['/missing', '/privacy']) {
    assert.throws(
      () =>
        renderLlmsTxt(manifest, {
          title: 'Example',
          summary: 'Useful docs.',
          sections: [{ heading: 'Start', items: [{ path }] }],
        }),
      /manifest|indexable/u,
    )
  }
  assert.throws(
    () =>
      renderLlmsTxt(manifest, {
        title: 'Example',
        summary: 'Useful docs.',
        sections: [
          { heading: 'Start', items: [{ path: '/docs' }, { path: '/docs' }] },
        ],
      }),
    /Duplicate/u,
  )
})
