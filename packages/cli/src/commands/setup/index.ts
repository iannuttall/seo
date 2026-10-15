import { defineCommand } from 'citty'
import { runGuidedSetup } from './flow.js'

export const setupCommand = defineCommand({
  meta: {
    name: 'setup',
    description: 'Sign in with Google, then add the MCP server and skill',
  },
  args: {
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Show what setup does without changing anything.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON. Never prompts.',
    },
  },
  run: async ({ args }) => runGuidedSetup(args),
})

export const startCommand = defineCommand({
  ...setupCommand,
  meta: {
    name: 'start',
    description:
      'Start here: sign in with Google, then add the MCP server and skill to your agents',
  },
})
