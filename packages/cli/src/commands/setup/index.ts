import { defineCommand } from 'citty'
import { runGuidedSetup } from './flow.js'

export const setupCommand = defineCommand({
  meta: {
    name: 'setup',
    description:
      'Guided setup for auth, one project profile, MCP, and next commands',
  },
  args: {
    id: { type: 'string', description: 'Short stable project id.' },
    name: { type: 'string', description: 'Human project name.' },
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    url: { type: 'string', description: 'Default technical crawl start URL.' },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs to watch with URL Inspection.',
    },
    ga4: { type: 'string', description: 'Optional GA4 property ID.' },
    brand: {
      type: 'string',
      description: 'Comma-separated branded query terms to exclude by default.',
    },
    'report-day': {
      type: 'string',
      description: 'Preferred monthly report day. Defaults to 1.',
    },
    weekday: {
      type: 'string',
      description: 'Preferred technical-watch weekday. Defaults to Monday.',
    },
    default: {
      type: 'boolean',
      description: 'Make this the default project.',
    },
    'skip-profile': {
      type: 'boolean',
      default: false,
      description: 'Do not save a project profile during setup.',
    },
    'skip-auth': {
      type: 'boolean',
      default: false,
      description: 'Skip Google sign-in during setup.',
    },
    'skip-mcp': {
      type: 'boolean',
      default: false,
      description: 'Skip MCP install prompts.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Refresh GSC property discovery.',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Show what setup does without changing files.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => runGuidedSetup(args),
})

export const startCommand = defineCommand({
  ...setupCommand,
  meta: {
    name: 'start',
    description:
      'Start here: connect Google, save a profile, and get the first report commands',
  },
})

export const clientSetupCommand = defineCommand({
  ...setupCommand,
  meta: {
    name: 'setup',
    description: 'Guided setup for one saved project profile',
  },
})
