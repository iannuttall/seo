import { getClient } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../../args.js'
import { printJson } from '../../../utils.js'
import { printClientProfile } from './output.js'

export const clientShowCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Show one project profile',
  },
  args: {
    id: {
      type: 'string',
      description: 'Project id or name. Defaults to the default project.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const client = getClient(stringArg(args.id))
    if (!client) throw new Error('Project not found.')
    if (jsonFlag(args)) {
      printJson(client)
      return
    }
    printClientProfile(client)
  },
})
