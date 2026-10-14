export const site = {
  name: 'SEO Skill',
  packageName: 'seo',
  url: 'https://seoskill.dev',
  mcpUrl: 'https://seoskill.dev/mcp',
  description:
    'Give your AI agent facts from your own Search Console, analytics and keyword data through a free hosted MCP server or the open source seo CLI.',
  repository: 'https://github.com/iannuttall/seo',
  issues: 'https://github.com/iannuttall/seo/issues',
  advisory: 'https://github.com/iannuttall/seo/security/advisories/new',
  npm: 'https://www.npmjs.com/package/seo',
  clickySiteId: '101508763',
} as const

/** The commands people copy to connect or install. */
export const setupCommands = {
  claude: 'claude mcp add --transport http seoskill https://seoskill.dev/mcp',
  codex: 'codex mcp add seoskill --url https://seoskill.dev/mcp',
  url: 'https://seoskill.dev/mcp',
  npm: 'npm i -g seo',
  start: 'seo start',
} as const
