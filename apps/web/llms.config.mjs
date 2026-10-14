import { docsSections } from './src/content/docs-nav.mjs'
import { tools } from './src/content/tools/manifest.mjs'

const docsSection = (title) =>
  docsSections
    .find((section) => section.title === title)
    ?.items.map((item) => ({ path: item.path })) ?? []

/** @satisfies {import('@iannuttall/seo-graph-core').LlmsTxtConfig} */
export const llmsTxt = {
  title: 'SEO Skill',
  summary:
    'Free SEO data for AI agents: facts from Search Console, analytics and your own keyword data through a hosted MCP server or the open source seo CLI.',
  sections: [
    {
      heading: 'Start here',
      items: [{ path: '/', label: 'SEO Skill' }, ...docsSection('Start')],
    },
    {
      heading: 'Commands',
      items: docsSection('Commands'),
    },
    {
      heading: 'Free web tools',
      items: [
        { path: '/tools' },
        ...tools.map((tool) => ({ path: tool.path })),
      ],
    },
    {
      heading: 'Data and privacy',
      items: [
        ...docsSection('Reference'),
        { path: '/telemetry' },
        { path: '/stats' },
      ],
    },
    {
      heading: 'Machine-readable capability',
      items: [
        {
          label: 'Hosted MCP server',
          url: 'https://seoskill.dev/mcp',
          description:
            'Connect any remote MCP client. Sign in with Google. Your data and keys are never stored.',
        },
        {
          label: 'Agent Skills index',
          url: '/.well-known/agent-skills/index.json',
          description:
            'Discover the published SEO skill and verify its declared digest.',
        },
        {
          label: 'SEO SKILL.md',
          url: '/.well-known/agent-skills/seo/SKILL.md',
          description:
            'Read the instructions that teach an agent how to choose and run SEO reports.',
        },
      ],
    },
  ],
}
