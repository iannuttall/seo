export const installCommands = [
  {
    id: 'recommended',
    label: 'CLI + skills',
    command: 'npm i -g seo && npx skills add iannuttall/seo',
    description:
      'Install the report engine and the instructions that teach agents how to use it. Then run seo start.',
  },
  {
    id: 'skills',
    label: 'skills only',
    command: 'npx skills add iannuttall/seo',
    description:
      'Add the instruction layer to an agent that can already run the seo package.',
  },
  {
    id: 'npx',
    label: 'try with npx',
    command: 'npx seo start',
    description:
      'Run the guided setup without installing the CLI or agent skills globally.',
  },
  {
    id: 'npm',
    label: 'CLI only',
    command: 'npm i -g seo',
    description:
      'Install the report engine for terminal use, scripts, CI, and local MCP.',
  },
  {
    id: 'mcp',
    label: 'MCP',
    command: 'seo mcp install',
    description:
      'Connect the installed report engine to a supported local AI client.',
  },
] as const
