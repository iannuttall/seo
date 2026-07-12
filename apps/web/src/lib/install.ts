export const installCommands = [
  {
    id: 'recommended',
    label: 'CLI + skills',
    command: 'npm i -g seo && npx skills add iannuttall/seo',
    description: 'Install the CLI and the seo skill. Then run seo start.',
  },
  {
    id: 'mcp',
    label: 'MCP',
    command: 'npm i -g seo && seo mcp install',
    description:
      'Install the CLI first, then connect its local MCP server to a supported AI client.',
  },
] as const
