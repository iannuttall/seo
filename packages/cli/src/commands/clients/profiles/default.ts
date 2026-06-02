import { setDefaultClient } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../../args.js'
import { printJson } from '../../../utils.js'

export const clientDefaultCommand = defineCommand({
  meta: {
    name: 'default',
    description: 'Set the default client',
  },
  args: {
    id: {
      type: 'string',
      required: true,
      description: 'Client id or name.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const client = setDefaultClient(stringArg(args.id) ?? '')
    if (jsonFlag(args)) {
      printJson(client)
      return
    }
    process.stdout.write(`Default client set to ${client.id}.\n`)
  },
})
