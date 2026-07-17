/** @satisfies {import('@iannuttall/seo-graph-core').LlmsTxtConfig} */
export const llmsTxt = {
  title: 'SEO Skill',
  summary:
    'Local SEO audits and reports for coding agents through the CLI, MCP, and TypeScript package.',
  sections: [
    {
      heading: 'Start here',
      items: [
        { path: '/', label: 'SEO Skill' },
        { path: '/docs/getting-started' },
        { path: '/docs/skill' },
      ],
    },
    {
      heading: 'Use the product',
      items: [
        { path: '/docs/reports' },
        { path: '/docs/cli' },
        { path: '/docs/mcp' },
        { path: '/docs/typescript' },
      ],
    },
    {
      heading: 'Agent and AI guidance',
      items: [
        { path: '/docs/ai-search' },
        { path: '/docs/ai-visibility' },
        { path: '/docs/agents' },
      ],
    },
    {
      heading: 'Machine-readable capability',
      items: [
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
