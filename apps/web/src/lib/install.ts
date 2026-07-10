export const installCommands = [
  {
    id: 'skills',
    label: 'agent skills',
    command: 'npx skills add iannuttall/seo',
  },
  { id: 'npx', label: 'npx', command: 'npx seo start' },
  { id: 'npm', label: 'npm global', command: 'npm i -g seo' },
  { id: 'mcp', label: 'mcp', command: 'seo mcp install' },
] as const
