import { listClients } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../../args.js'
import { printJson } from '../../../utils.js'
import { printClientList } from './output.js'

export const clientListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List saved clients',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const clients = listClients()
    if (jsonFlag(args)) {
      printJson({ clients })
      return
    }
    printClientList(clients)
  },
})
